import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  parseQueryWorkspace,
  QueryTabs,
} from '../packages/editor/src/query-tabs.js';
import {
  readQueryWorkspace,
  saveQueryWorkspace,
} from '../apps/demo/src/query-storage.js';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
describe('virtual query tabs', () => {
  it('stores strings, switches queries, renames and closes tabs without mutating snapshots', () => {
    const tabs = new QueryTabs('ASK {}');
    const first = tabs.snapshot();
    tabs.add();
    const secondId = tabs.snapshot().activeId;
    expect(tabs.query).toBe('');
    tabs.update('SELECT * {}');
    tabs.rename(secondId, '  Cities  ');
    expect(tabs.snapshot().tabs[1]?.title).toBe('Cities');
    expect(tabs.select('query-1')).toBe(true);
    expect(tabs.query).toBe('ASK {}');
    expect(tabs.select('missing')).toBe(false);
    expect(tabs.select('query-1')).toBe(false);
    expect(tabs.close('missing')).toBe(false);
    expect(tabs.close(secondId)).toBe(false);
    expect(tabs.snapshot().tabs).toHaveLength(1);
    expect(tabs.close('query-1')).toBe(false);
    expect(first.tabs).toHaveLength(1);
    expect(first.tabs[0]?.query).toBe('ASK {}');
  });
  it('selects an adjacent tab when closing the active one and resets blank titles', () => {
    const tabs = new QueryTabs();
    tabs.add();
    tabs.rename(tabs.snapshot().activeId, 'Title');
    tabs.rename(tabs.snapshot().activeId, ' ');
    expect(tabs.snapshot().tabs[1]?.title).toBeUndefined();
    expect(tabs.close(tabs.snapshot().activeId)).toBe(true);
    expect(tabs.snapshot().activeId).toBe('query-1');
  });
  it.each([
    null,
    {},
    { tabs: [] },
    { tabs: [null] },
    { tabs: [{ id: '', query: '' }] },
    { tabs: [{ id: 'a', query: 42 }] },
    { tabs: [{ id: 'a', query: '', title: 42 }] },
    {
      tabs: [
        { id: 'a', query: '' },
        { id: 'a', query: '' },
      ],
    },
  ])('rejects invalid stored workspaces %#', (value) => {
    expect(parseQueryWorkspace(value)).toBeUndefined();
  });
  it('restores text, names and active tab with a fallback for a missing selection', () => {
    const workspace = {
      activeId: 'two',
      tabs: [
        { id: 'one', query: 'ASK {}' },
        { id: 'two', query: 'SELECT * {}', title: 'Cities' },
      ],
    };
    saveQueryWorkspace(workspace);
    const restored = readQueryWorkspace();
    expect(restored).toEqual(workspace);
    expect(new QueryTabs('', restored).query).toBe('SELECT * {}');
    expect(
      parseQueryWorkspace({ ...workspace, activeId: 'missing' })?.activeId,
    ).toBe('one');
  });
  it('recovers from corrupt or blocked storage', () => {
    localStorage.setItem('ldforge.demo.queries.v1', 'broken');
    expect(readQueryWorkspace()).toBeUndefined();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Full');
    });
    expect(readQueryWorkspace()).toBeUndefined();
    expect(() => saveQueryWorkspace(new QueryTabs().snapshot())).not.toThrow();
  });
});
