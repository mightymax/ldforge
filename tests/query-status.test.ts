import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatQueryStatus,
} from '../packages/editor/src/query-status.js';

describe('query status', () => {
  it.each([
    [0, '0 ms'],
    [124.6, '125 ms'],
    [999.4, '999 ms'],
    [999.6, '1 s'],
    [1_250, '1.25 s'],
    [59_999, '60 s'],
    [60_000, '1 min 0 s'],
    [125_000, '2 min 5 s'],
    [3_661_000, '1 h 1 min'],
  ])('formats %s ms as %s', (milliseconds, text) => {
    expect(formatDuration(milliseconds)).toBe(text);
  });
  it.each([0, 1, 3])('reports %s SELECT results', (count) => {
    expect(
      formatQueryStatus({
        status: 'success',
        durationMs: 124,
        result: {
          kind: 'bindings',
          variables: ['x'],
          bindings: Array.from({ length: count }, () => ({})),
        },
      }),
    ).toBe(`${count} result${count === 1 ? '' : 's'} in 124 ms`);
  });
  it.each([true, false])('reports ASK %s', (value) => {
    expect(
      formatQueryStatus({
        status: 'success',
        durationMs: 18,
        result: { kind: 'boolean', value },
      }),
    ).toBe(`${value ? 'True' : 'False'} in 18 ms`);
  });
});
