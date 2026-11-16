import { describe, expect, it } from 'vitest';
import { createTableRenderer } from '@ldforge/renderers';
import type { QueryResult } from '@ldforge/core';

const data = (count: number): QueryResult => ({
  kind: 'bindings',
  variables: ['value'],
  bindings: Array.from({ length: count }, (_, index) => ({
    value: { type: 'literal', value: String(index) },
  })),
});
function viewport(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('.ldforge-table-viewport');
  if (!node) throw new Error('Missing viewport');
  return node;
}

describe('table height configuration', () => {
  it('renders every row by default and removes the editor result height cap', () => {
    const container = document.createElement('div');
    container.style.maxHeight = '480px';
    container.style.overflow = 'auto';
    const cleanup = createTableRenderer().render(container, data(600));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(600);
    expect(container.style.maxHeight).toBe('none');
    expect(container.style.overflow).toBe('visible');
    expect(viewport(container).style.maxHeight).toBe('');
    expect(viewport(container).onscroll).toBeNull();
    if (typeof cleanup === 'function') cleanup();
    expect(container.style.maxHeight).toBe('480px');
    expect(container.style.overflow).toBe('auto');
  });

  it('constrains small results as well when scrolling is explicitly requested', () => {
    const container = document.createElement('div');
    createTableRenderer({ scroll: true, viewportHeight: 320 }).render(
      container,
      data(10),
    );
    expect(viewport(container).style.maxHeight).toBe('320px');
    expect(viewport(container).style.overflowY).toBe('auto');
    expect(viewport(container).tabIndex).toBe(0);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(10);
  });

  it('virtualizes large results only in scroll mode and keeps all rows searchable', () => {
    const container = document.createElement('div');
    createTableRenderer({ scroll: true, viewportHeight: 240 }).render(
      container,
      data(600),
    );
    expect(container.querySelectorAll('tbody tr').length).toBeLessThan(40);
    const search = container.querySelector<HTMLInputElement>('input');
    if (!search) throw new Error('Missing search');
    search.value = '599';
    search.dispatchEvent(new Event('input'));
    expect(container.querySelector('tbody')?.textContent).toBe('599');
  });

  it('lets query configuration override host defaults in either direction', () => {
    const container = document.createElement('div');
    const scrollCleanup = createTableRenderer().render(container, data(600), {
      locale: 'en',
      directives: { 'table-scroll': 'true', 'table-height': '300' },
    });
    expect(viewport(container).style.maxHeight).toBe('300px');
    expect(container.querySelectorAll('tbody tr').length).toBeLessThan(40);
    if (typeof scrollCleanup === 'function') scrollCleanup();
    createTableRenderer({ scroll: true }).render(container, data(600), {
      locale: 'en',
      directives: { 'table-scroll': 'false' },
    });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(600);
    expect(viewport(container).style.maxHeight).toBe('');
  });

  it('warns about invalid query configuration and falls back to host settings', () => {
    const container = document.createElement('div');
    createTableRenderer({ scroll: true, viewportHeight: 240 }).render(
      container,
      data(5),
      {
        locale: 'en',
        directives: { 'table-scroll': 'yes', 'table-height': 'NaN' },
      },
    );
    expect(container.querySelector('[role=alert]')?.textContent).toContain(
      'Invalid table setting',
    );
    expect(viewport(container).style.maxHeight).toBe('240px');
  });

  it('validates heights, enforces the minimum and exposes both controls in the wizard', () => {
    expect(() => createTableRenderer({ viewportHeight: Infinity })).toThrow(
      'positive finite',
    );
    const container = document.createElement('div');
    const renderer = createTableRenderer({ scroll: true, viewportHeight: 80 });
    renderer.render(container, data(1));
    expect(viewport(container).style.maxHeight).toBe('120px');
    expect(
      renderer.wizard?.options?.find((option) => option.key === 'table-scroll')
        ?.defaultValue,
    ).toBe('true');
    expect(
      renderer.wizard?.options?.find((option) => option.key === 'table-height'),
    ).toBeDefined();
  });
});
