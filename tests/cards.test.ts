import { describe, expect, it } from 'vitest';
import { createCardsRenderer } from '@ldforge/renderers';
import { parseQueryViewDirectives } from '@ldforge/core';
import type { QueryResult } from '@ldforge/core';

const result: QueryResult = {
  kind: 'bindings',
  variables: [
    'card_title',
    'card_text',
    'card_image',
    'card_button',
    'card_button_url',
  ],
  bindings: [
    {
      card_title: { type: 'literal', value: 'Amsterdam' },
      card_text: { type: 'literal', value: 'A city\nwith canals.' },
      card_image: { type: 'uri', value: 'https://example.org/image.jpg' },
      card_button: { type: 'literal', value: 'Explore' },
      card_button_url: { type: 'uri', value: 'https://example.org/city' },
    },
  ],
};

describe('query view headers', () => {
  it('reads leading comments, preserves CSS semicolons/equalities and uses the last key', () => {
    const directives = parseQueryViewDirectives(
      '\uFEFF\n# A description\n# view=table\n# VIEW="cards"\n# css=max-width=100px; color: red;\n# custom=foo=bar\nPREFIX ex: <https://example.org/>\n# view=json\nSELECT * {}',
    );
    expect(directives).toEqual({
      view: 'cards',
      css: 'max-width=100px; color: red;',
      custom: 'foo=bar',
    });
    expect(Object.isFrozen(directives)).toBe(true);
  });
  it('does not treat query strings, body comments or incomplete comments as metadata', () => {
    expect(
      parseQueryViewDirectives(
        'SELECT * {\n# view=cards\nBIND("# css=color:red" AS ?text)}',
      ),
    ).toEqual({});
    expect(parseQueryViewDirectives('# view=\n# note\nASK {}')).toEqual({});
  });
});

describe('cards renderer', () => {
  it('renders all five bindings, scopes styles and uses safe links and images', () => {
    const container = document.createElement('div');
    const renderer = createCardsRenderer();
    expect(renderer.supports(result)).toBe(true);
    expect(renderer.supports({ kind: 'boolean', value: true })).toBe(false);
    expect(
      renderer.supports({
        kind: 'bindings',
        variables: ['title'],
        bindings: [],
      }),
    ).toBe(false);
    renderer.render(container, result, {
      locale: 'en',
      directives: {
        css: 'max-width=100px; color: red; position: fixed; background-image: url(https://example.org/track)',
      },
    });
    expect(container.querySelector('h3')?.textContent).toBe('Amsterdam');
    expect(container.querySelector('p')?.textContent).toBe(
      'A city\nwith canals.',
    );
    expect(container.querySelector('a')?.href).toBe('https://example.org/city');
    expect(container.querySelector('a')?.rel).toContain('noopener');
    const image = container.querySelector('img');
    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(image?.getAttribute('src')).toBe('https://example.org/image.jpg');
    const card = container.querySelector<HTMLElement>('.ldforge-card');
    expect(card?.style.maxWidth).toBe('100px');
    expect(card?.style.color).toBe('red');
    expect(card?.style.position).toBe('');
    expect(card?.style.backgroundImage).toBe('');
    image?.dispatchEvent(new Event('error'));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('h3')?.textContent).toBe('Amsterdam');
  });
  it('treats HTML as text and omits invalid or unsafe URLs and incomplete buttons', () => {
    const container = document.createElement('div');
    createCardsRenderer().render(container, {
      kind: 'bindings',
      variables: result.variables,
      bindings: [
        {
          card_title: {
            type: 'literal',
            value: '<img src=x onerror=alert(1)>',
          },
          card_image: { type: 'uri', value: 'javascript:alert(1)' },
          card_button: { type: 'literal', value: '<script>bad</script>' },
          card_button_url: { type: 'literal', value: 'data:text/html,bad' },
        },
        { card_button_url: { type: 'literal', value: 'https://example.org' } },
      ],
    });
    expect(container.querySelectorAll('article')).toHaveLength(2);
    expect(container.querySelector('h3')?.textContent).toContain('<img');
    expect(container.querySelector('img, script, a')).toBeNull();
    expect(container.textContent).toContain('No content for this card.');
  });
  it('handles optional fields, empty results, unsupported results and disabled query styling', () => {
    const container = document.createElement('div');
    const renderer = createCardsRenderer({ allowQueryStyles: false });
    renderer.render(container, result, {
      locale: 'nl',
      directives: { css: 'width: 100px' },
    });
    expect(
      container.querySelector<HTMLElement>('.ldforge-card')?.style.width,
    ).toBe('');
    renderer.render(container, {
      kind: 'bindings',
      variables: ['card_text'],
      bindings: [{ card_text: { type: 'literal', value: 'Text only' } }],
    });
    expect(container.querySelector('h3, img, a')).toBeNull();
    expect(container.textContent).toBe('Text only');
    renderer.render(container, { kind: 'boolean', value: true });
    expect(container.textContent).toBe('Text only');
    renderer.render(
      container,
      { kind: 'bindings', variables: ['card_title'], bindings: [] },
      { locale: 'nl' },
    );
    expect(container.textContent).toBe('Geen kaarten om te tonen.');
  });
});
