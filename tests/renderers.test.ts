import { describe, expect, it } from 'vitest';
import {
  createBooleanRenderer,
  createJsonRenderer,
  createTableRenderer,
} from '@ldforge/renderers';
import type { QueryResult } from '@ldforge/core';

const result: QueryResult = {
  kind: 'bindings',
  variables: ['label', 'missing', 'number', 'link'],
  bindings: [
    {
      label: {
        type: 'literal',
        value: '<img src=x onerror=alert(1)>',
        'xml:lang': 'en',
      },
      number: {
        type: 'literal',
        value: '42',
        datatype: 'http://www.w3.org/2001/XMLSchema#integer',
      },
      link: { type: 'uri', value: 'javascript:alert(1)' },
    },
  ],
};

describe('result renderers', () => {
  it('renders literal data safely and preserves columns for unbound variables', () => {
    const container = document.createElement('div');
    const renderer = createTableRenderer();
    expect(renderer.supports(result)).toBe(true);
    expect(renderer.supports({ kind: 'boolean', value: true })).toBe(false);
    renderer.render(container, result);
    expect(container.querySelectorAll('th')).toHaveLength(4);
    expect(container.querySelectorAll('td')).toHaveLength(4);
    expect(container.querySelectorAll('td')[1]?.textContent).toBe('');
    expect(container.querySelector('td')?.title).toBe('Language: en');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('<img');
    expect(container.querySelector('caption')?.textContent).toBe('1 result');
  });
  it('handles empty bindings and ignores unsupported result kinds', () => {
    const container = document.createElement('div');
    createTableRenderer().render(container, {
      kind: 'bindings',
      variables: [],
      bindings: [],
    });
    expect(container.querySelector('caption')?.textContent).toBe('0 results');
    createTableRenderer().render(container, { kind: 'boolean', value: true });
    expect(container.querySelector('caption')).not.toBeNull();
  });
  it.each([true, false])('renders ASK %s', (value) => {
    const container = document.createElement('div');
    const renderer = createBooleanRenderer();
    expect(renderer.supports({ kind: 'boolean', value })).toBe(true);
    expect(renderer.supports(result)).toBe(false);
    renderer.render(container, { kind: 'boolean', value });
    expect(container.textContent).toBe(value ? 'True' : 'False');
    renderer.render(container, result);
    expect(container.textContent).toBe(value ? 'True' : 'False');
  });
  it('renders normalized JSON as text', () => {
    const container = document.createElement('div');
    const renderer = createJsonRenderer();
    expect(renderer.supports(result)).toBe(true);
    renderer.render(container, result);
    expect(JSON.parse(container.textContent ?? '')).toEqual(result);
    expect(container.querySelector('img')).toBeNull();
  });
});
