import { describe, expect, it, vi } from 'vitest';
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
    const cleanup = renderer.render(container, result);
    expect(
      JSON.parse(container.querySelector('.cm-content')?.textContent ?? ''),
    ).toEqual(result);
    expect(container.querySelector('img')).toBeNull();
    cleanup?.();
  });
});

it('uses equal fixed-layout widths by default and accepts configured/header percentages', () => {
  const container = document.createElement('div');
  const three: QueryResult = {
    kind: 'bindings',
    variables: ['a', 'b', 'c'],
    bindings: [
      { c: { type: 'literal', value: 'Very long value '.repeat(100) } },
    ],
  };
  createTableRenderer().render(container, three);
  expect(container.querySelector('table')?.style.tableLayout).toBe('fixed');
  for (const column of container.querySelectorAll('col'))
    expect(parseFloat(column.style.width)).toBeCloseTo(100 / 3, 3);
  expect(container.querySelector('td')?.style.overflowWrap).toBe('anywhere');
  createTableRenderer({ columnWidths: [20, 30, 50] }).render(container, three);
  expect(
    [...container.querySelectorAll('col')].map((column) => column.style.width),
  ).toEqual(['20%', '30%', '50%']);
  for (const key of ['columns', 'colums']) {
    createTableRenderer().render(container, three, {
      locale: 'en',
      directives: { [key]: '40%,40%,20%' },
    });
    expect(
      [...container.querySelectorAll('col')].map(
        (column) => column.style.width,
      ),
    ).toEqual(['40%', '40%', '20%']);
  }
  createTableRenderer().render(container, three, {
    locale: 'en',
    directives: { columns: '10%,20%,70%', colums: '40%,40%,20%' },
  });
  expect(container.querySelector('col')?.style.width).toBe('10%');
});
it.each([
  '50%,50%',
  '0%,40%,60%',
  '40,40,20',
  '40%,40%,30%',
  '40%,40%,20%;color:red',
  '-10%,50%,60%',
  'NaN%,40%,60%',
])(
  'falls back to equal columns with a useful warning for invalid %s',
  (columns) => {
    const container = document.createElement('div');
    const data: QueryResult = {
      kind: 'bindings',
      variables: ['a', 'b', 'c'],
      bindings: [],
    };
    createTableRenderer().render(container, data, {
      locale: 'nl',
      directives: { columns },
    });
    expect(container.querySelector('[role=alert]')?.textContent).toContain(
      'Gelijke breedtes',
    );
    expect(container.querySelectorAll('col')).toHaveLength(3);
    expect(
      parseFloat(container.querySelector('col')?.style.width ?? '0'),
    ).toBeCloseTo(100 / 3, 3);
  },
);
it('validates host widths and makes column widths discoverable in the plugin wizard', () => {
  expect(() => createTableRenderer({ columnWidths: [50, 40] })).toThrow(
    'totaling 100',
  );
  expect(
    createTableRenderer().wizard?.options?.find(
      (option) => option.key === 'columns',
    ),
  ).toMatchObject({
    key: 'columns',
    aliases: ['colums'],
    type: 'text',
  });
});

it('copies complete JSON and confirms success, then restores the copy button', async () => {
  vi.useFakeTimers();
  const writeText = vi.fn().mockResolvedValue(undefined);
  const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  const container = document.createElement('div');
  const cleanup = createJsonRenderer().render(container, result, {
    locale: 'nl',
  });
  try {
    container.querySelector<HTMLButtonElement>('button')?.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
    expect(container.querySelector('button')?.dataset.copied).toBe('true');
    expect(container.querySelector('button')?.textContent).toBe('Gekopieerd!');
    await vi.advanceTimersByTimeAsync(1800);
    expect(container.querySelector('button')?.textContent).toBe(
      'JSON kopiëren',
    );
    writeText.mockRejectedValueOnce(new Error('denied'));
    container.querySelector<HTMLButtonElement>('button')?.click();
    await Promise.resolve();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'mislukt',
    );
  } finally {
    cleanup?.();
    if (previous) Object.defineProperty(navigator, 'clipboard', previous);
    else Reflect.deleteProperty(navigator, 'clipboard');
    vi.useRealTimers();
  }
});
