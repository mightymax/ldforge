import { describe, expect, it, vi } from 'vitest';
import type { Binding, QueryResult } from '@ldforge/core';
import { buildNetworkModel, createNetworkRenderer } from '@ldforge/network';
import {
  buildTimelineModel,
  createTimelineRenderer,
  parseTimelineDate,
} from '@ldforge/timeline';
const term = (
  value: string,
  type: 'uri' | 'literal' | 'bnode' = 'literal',
) => ({ value, type });
function bindings(
  rows: Binding[],
  variables = Object.keys(rows[0] ?? {}),
): QueryResult {
  return { kind: 'bindings', variables, bindings: rows };
}
const networkRow: Binding = {
  source: term('https://example.org/artist', 'uri'),
  sourceLabel: term('<b>Artist</b>'),
  sourceGroup: term('Artist'),
  target: term('https://example.org/movement', 'uri'),
  targetLabel: term('Movement'),
  targetGroup: term('Movement'),
  relationLabel: term('belongs to'),
};
const timelineRow: Binding = {
  timelineLabel: term('<b>Artist</b>'),
  timelineStart: term('1853-03-30T00:00:00Z'),
  timelineEnd: term('1890-07-29T00:00:00Z'),
  timelineGroup: term('<img>Group'),
  timelineDescription: term('<script>Description</script>'),
  timelineLink: term('https://example.org/artist', 'uri'),
};
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('network model', () => {
  it('deduplicates nodes and identical directed edges, retaining distinct relations', () => {
    const model = buildNetworkModel(
      bindings([
        networkRow,
        networkRow,
        { ...networkRow, relationLabel: term('influenced by') },
      ]),
    );
    expect(model.nodes).toHaveLength(2);
    expect(model.edges).toHaveLength(2);
    expect(model.nodes[0]).toMatchObject({
      label: '<b>Artist</b>',
      group: 'Artist',
      link: 'https://example.org/artist',
    });
  });
  it('distinguishes blank nodes from URIs and enriches labels seen later', () => {
    const model = buildNetworkModel(
      bindings([
        { source: term('a', 'bnode'), target: term('a', 'uri') },
        {
          source: term('a', 'bnode'),
          sourceLabel: term('Named blank'),
          target: term('a', 'uri'),
          relationLabel: term('other'),
        },
      ]),
    );
    expect(model.nodes).toHaveLength(2);
    expect(model.nodes[0]?.label).toBe('Named blank');
    expect(model.nodes[0]).not.toHaveProperty('link');
  });
  it.each([
    { ...networkRow, source: term('bad') },
    { ...networkRow, target: term('', 'uri') },
    { source: term('https://example.org', 'uri') },
  ])('rejects invalid source/target with the row', (row) =>
    expect(() => buildNetworkModel(bindings([row]))).toThrow('row 1'),
  );
  it('handles empty and non-binding results', () => {
    expect(buildNetworkModel({ kind: 'boolean', value: true })).toEqual({
      nodes: [],
      edges: [],
    });
    expect(buildNetworkModel(bindings([])).edges).toHaveLength(0);
  });
});
describe('timeline model', () => {
  it('creates ranges and point events, accepts optional metadata, and preserves ungrouped items', () => {
    const items = buildTimelineModel(
      bindings([
        timelineRow,
        { timelineLabel: term('Point'), timelineStart: term('2000') },
      ]),
    );
    expect(items[0]?.end?.toISOString()).toBe('1890-07-29T00:00:00.000Z');
    expect(items[0]?.description).toBe('<script>Description</script>');
    expect(items[1]?.start.toISOString()).toBe('2000-01-01T00:00:00.000Z');
    expect(items[1]).not.toHaveProperty('end');
  });
  it.each([
    ['0099', '0099-01-01T00:00:00.000Z'],
    ['2024-02', '2024-02-01T00:00:00.000Z'],
    ['2024-02-29', '2024-02-29T00:00:00.000Z'],
    ['+1853-03-30T00:00:00Z', '1853-03-30T00:00:00.000Z'],
    ['-0044-03-15', '-000044-03-15T00:00:00.000Z'],
    ['2024-03-01T12:00:00+02:00', '2024-03-01T10:00:00.000Z'],
  ])('parses explicit ISO date %s', (input, output) =>
    expect(parseTimelineDate(input).toISOString()).toBe(output),
  );
  it.each([
    '03/04/2024',
    '2023-02-29',
    '2024-04-31',
    '2024-13-01',
    '2024-00-01',
    '2024-01-00',
    'garbage',
    '2024-01-01T24:00:00Z',
    '2024-01-01T00:60:00Z',
    '2024-01-01T00:00:60Z',
    '2024-01-01T00:00:00+99:99',
  ])('rejects invalid/ambiguous date %s', (input) =>
    expect(() => parseTimelineDate(input)).toThrow(),
  );
  it.each([
    { ...timelineRow, timelineEnd: term('1800') },
    { ...timelineRow, timelineStart: term('1853', 'uri') },
    { ...timelineRow, timelineLabel: term(' ') },
    { ...timelineRow, timelineEnd: term('1900', 'uri') },
    { timelineLabel: term('Missing start') },
  ])('reports an invalid row without dropping it', (row) =>
    expect(() => buildTimelineModel(bindings([row]))).toThrow('row 1'),
  );
  it('handles non-binding and empty results', () => {
    expect(buildTimelineModel({ kind: 'boolean', value: true })).toEqual([]);
    expect(buildTimelineModel(bindings([]))).toEqual([]);
  });
});
function mockLibrary(kind: 'network' | 'timeline') {
  const events = new Map<
    string,
    (event: { nodes?: string[]; items?: string[] }) => void
  >();
  const handle = {
    destroy: vi.fn(),
    fit: vi.fn(),
    focus: vi.fn(),
    moveTo: vi.fn(),
    getScale: vi.fn(() => 1),
    selectNodes: vi.fn(),
    unselectAll: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    on: vi.fn((event, callback) => events.set(event, callback)),
  };
  const Constructor = vi.fn(function () {
    return handle;
  });
  return {
    module:
      kind === 'network' ? { Network: Constructor } : { Timeline: Constructor },
    handle,
    Constructor,
    events,
  };
}
for (const kind of ['network', 'timeline'] as const) {
  describe(`${kind} renderer lifecycle`, () => {
    const create =
      kind === 'network' ? createNetworkRenderer : createTimelineRenderer;
    const row = kind === 'network' ? networkRow : timelineRow;
    it('loads only on activation, creates safe content, exposes controls, and destroys on cleanup', async () => {
      const mock = mockLibrary(kind);
      const loadLibrary = vi.fn(async () => mock.module);
      const plugin = create({ loadLibrary, stylesheetUrl: false });
      expect(loadLibrary).not.toHaveBeenCalled();
      expect(plugin.supports(bindings([row]))).toBe(true);
      expect(plugin.supports({ kind: 'boolean', value: false })).toBe(false);
      expect(plugin.supports(bindings([{}]))).toBe(false);
      const node = document.createElement('div');
      const cleanup = plugin.render(node, bindings([row]), {
        locale: 'en',
        directives: { [`${kind}-title`]: 'Custom title' },
      });
      await flush();
      expect(mock.Constructor).toHaveBeenCalledTimes(1);
      expect(node.querySelector('h3')?.textContent).toBe('Custom title');
      expect(node.querySelector('b,img,script')).toBeNull();
      expect(node.querySelector('section')?.getAttribute('aria-busy')).toBe(
        'false',
      );
      const buttons = node.querySelectorAll<HTMLButtonElement>(
        `.ldforge-${kind}-controls button`,
      );
      buttons.forEach((button) => button.click());
      expect(mock.handle.fit).toHaveBeenCalled();
      if (kind === 'network') {
        const select = node.querySelector('select');
        if (!select) throw new Error('Missing node picker');
        select.value = JSON.stringify(['uri', 'https://example.org/artist']);
        select.dispatchEvent(new Event('change'));
        expect(mock.handle.focus).toHaveBeenCalled();
        expect(
          node.querySelector('.ldforge-network-selection a')?.textContent,
        ).toBe('<b>Artist</b>');
        select.value = '';
        select.dispatchEvent(new Event('change'));
        expect(mock.handle.unselectAll).toHaveBeenCalled();
        mock.events.get('selectNode')?.({
          nodes: [JSON.stringify(['uri', 'https://example.org/movement'])],
        });
        expect(
          node.querySelector('.ldforge-network-selection')?.textContent,
        ).toContain('Movement');
        mock.events.get('deselectNode')?.({});
      } else {
        const config = mock.Constructor.mock.calls[0] as unknown[] | undefined;
        const visual = config?.[1] as { content: HTMLElement }[];
        expect(visual[0]?.content.textContent).toBe('<b>Artist</b>');
        expect(visual[0]?.content.querySelector('b')).toBeNull();
        mock.events.get('select')?.({ items: ['0'] });
        expect(
          node.querySelector('.ldforge-timeline-selection')?.textContent,
        ).toContain('<script>Description</script>');
        mock.events.get('select')?.({ items: [] });
        expect(
          node.querySelector('.ldforge-timeline-selection')?.textContent,
        ).toBe('');
      }
      if (typeof cleanup === 'function') cleanup();
      expect(mock.handle.destroy).toHaveBeenCalledTimes(1);
    });
    it('does not fetch for invalid or empty data and localizes errors', () => {
      const loadLibrary = vi.fn();
      const plugin = create({ loadLibrary, stylesheetUrl: false });
      const node = document.createElement('div');
      plugin.render(node, bindings([{}]), { locale: 'nl' });
      expect(node.querySelector('[role=alert]')?.textContent).toContain(
        'rij 1',
      );
      plugin.render(node, bindings([]), { locale: 'nl' });
      expect(node.textContent).toContain('Geen');
      expect(loadLibrary).not.toHaveBeenCalled();
    });
    it('retries a failed download and discards a completion after disposal', async () => {
      const mock = mockLibrary(kind);
      const loadLibrary = vi
        .fn()
        .mockRejectedValueOnce(Error('offline'))
        .mockResolvedValue(mock.module);
      const node = document.createElement('div');
      const cleanup = create({ loadLibrary, stylesheetUrl: false }).render(
        node,
        bindings([row]),
      );
      await flush();
      expect(node.textContent).toContain('Could not load');
      node.querySelector<HTMLButtonElement>(`button`)?.click();
      await flush();
      expect(loadLibrary).toHaveBeenCalledTimes(2);
      expect(mock.Constructor).toHaveBeenCalledTimes(1);
      if (typeof cleanup === 'function') cleanup();
      let resolve: (value: unknown) => void = () => {};
      const delayed = create({
        loadLibrary: () =>
          new Promise((done) => {
            resolve = done;
          }),
        stylesheetUrl: false,
      });
      const dispose = delayed.render(
        document.createElement('div'),
        bindings([row]),
      );
      await flush();
      if (typeof dispose === 'function') dispose();
      resolve(mock.module);
      await flush();
      expect(mock.Constructor).toHaveBeenCalledTimes(1);
    });
    it('retries malformed exports, prevents unsafe URLs, and cleans up constructor errors', async () => {
      const mock = mockLibrary(kind);
      const loadLibrary = vi
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValue(mock.module);
      const node = document.createElement('div');
      const cleanup = create({ loadLibrary, stylesheetUrl: false }).render(
        node,
        bindings([row]),
      );
      await flush();
      expect(node.textContent).toContain('Could not load');
      node.querySelector<HTMLButtonElement>('button')?.click();
      await flush();
      expect(loadLibrary).toHaveBeenCalledTimes(2);
      if (typeof cleanup === 'function') cleanup();
      create({
        libraryUrl: 'javascript:alert(1)',
        stylesheetUrl: false,
      }).render(node, bindings([row]));
      await flush();
      expect(node.textContent).toContain('Could not load');
      const bad = mockLibrary(kind);
      bad.handle.on.mockImplementation(() => {
        throw Error('Setup failed');
      });
      create({
        loadLibrary: async () => bad.module,
        stylesheetUrl: false,
      }).render(node, bindings([row]));
      await flush();
      expect(bad.handle.destroy).toHaveBeenCalledTimes(1);
      expect(node.textContent).toContain('Could not load');
    });
  });
}

it('keeps point events without a group visible alongside grouped ranges', async () => {
  const mock = mockLibrary('timeline');
  const cleanup = createTimelineRenderer({
    loadLibrary: async () => mock.module,
    stylesheetUrl: false,
  }).render(
    document.createElement('div'),
    bindings([
      timelineRow,
      { timelineLabel: term('Ungrouped event'), timelineStart: term('1900') },
    ]),
    { locale: 'nl' },
  );
  await flush();
  const args = mock.Constructor.mock.calls[0] as unknown[] | undefined;
  const items = args?.[1] as { type: string; group?: string }[];
  const groups = args?.[2] as { id: string; content: HTMLElement }[];
  expect(items[1]).toMatchObject({ type: 'point', group: 'ungrouped' });
  expect(
    groups.find((group) => group.id === 'ungrouped')?.content.textContent,
  ).toBe('Overig');
  if (typeof cleanup === 'function') cleanup();
});
for (const kind of ['network', 'timeline'] as const) {
  it(`${kind} retries failed stylesheet downloads before creating a view`, async () => {
    const mock = mockLibrary(kind);
    const node = document.createElement('div');
    const create =
      kind === 'network' ? createNetworkRenderer : createTimelineRenderer;
    const stylesheetUrl = `https://example.org/${kind}-test.css`;
    const cleanup = create({
      loadLibrary: async () => mock.module,
      stylesheetUrl,
    }).render(node, bindings([kind === 'network' ? networkRow : timelineRow]));
    await flush();
    const failed = document.head.querySelector<HTMLLinkElement>(
      `link[href="${stylesheetUrl}"]`,
    );
    expect(failed).not.toBeNull();
    failed?.dispatchEvent(new Event('error'));
    await flush();
    expect(mock.Constructor).not.toHaveBeenCalled();
    expect(node.textContent).toContain('Could not load');
    node.querySelector<HTMLButtonElement>('button')?.click();
    await flush();
    document.head
      .querySelector<HTMLLinkElement>(`link[href="${stylesheetUrl}"]`)
      ?.dispatchEvent(new Event('load'));
    await flush();
    expect(mock.Constructor).toHaveBeenCalledTimes(1);
    if (typeof cleanup === 'function') cleanup();
  });
}
