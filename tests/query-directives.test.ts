import { describe, expect, it } from 'vitest';
import { parseQueryViewDirectives } from '@ldforge/core';

describe('combined plugin query headers', () => {
  it('parses the complete charts configuration on one line', () => {
    expect(
      parseQueryViewDirectives(
        '# view=charts; chart=bar; chart-title=Example city populations\nSELECT * {}',
      ),
    ).toEqual({
      view: 'charts',
      chart: 'bar',
      'chart-title': 'Example city populations',
    });
  });
  it('keeps CSS declarations on their own line intact', () => {
    expect(
      parseQueryViewDirectives(
        '# view=cards; custom=yes\n# css=max-width=100px; color: red; border-radius: 8px;\nSELECT * {}',
      ),
    ).toEqual({
      view: 'cards',
      custom: 'yes',
      css: 'max-width=100px; color: red; border-radius: 8px;',
    });
  });
  it('supports quoted semicolons, escaped quotes and unquoted apostrophes', () => {
    expect(
      parseQueryViewDirectives(
        String.raw`# view=charts; chart-title="Cities; \"populations\""; chart=bar`,
      ),
    ).toEqual({
      view: 'charts',
      chart: 'bar',
      'chart-title': 'Cities; "populations"',
    });
    expect(
      parseQueryViewDirectives("# chart-title=People's cities; chart=line"),
    ).toEqual({ 'chart-title': "People's cities", chart: 'line' });
    expect(
      parseQueryViewDirectives(
        "# chart-title='Cities; populations'; chart=pie",
      ),
    ).toEqual({ 'chart-title': 'Cities; populations', chart: 'pie' });
  });
  it('supports existing separate lines, CRLF and last-wins overrides', () => {
    const result = parseQueryViewDirectives(
      '\uFEFF# VIEW=charts; CHART=bar; chart=line;\r\n# chart=pie\r\n# css="max-width: 100px; color: red;"\r\nSELECT * {}',
    );
    expect(result).toEqual({
      view: 'charts',
      chart: 'pie',
      css: 'max-width: 100px; color: red;',
    });
    expect(Object.isFrozen(result)).toBe(true);
  });
  it('ignores misplaced inline CSS, incomplete assignments and body comments', () => {
    expect(
      parseQueryViewDirectives(
        '# view=charts; css=color:red; chart=bar; empty=; note\nSELECT * {\n# chart=pie\n}',
      ),
    ).toEqual({ view: 'charts', chart: 'bar' });
  });
});
