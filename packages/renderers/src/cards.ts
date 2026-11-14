import { createSvgIcon, resolveLocale, translate } from '@ldforge/core';
import type { ResultRendererPlugin } from '@ldforge/core';

export interface CardsRendererOptions {
  /** Allow the leading # css= directive to style individual cards. Defaults to true. */
  readonly allowQueryStyles?: boolean;
}
const bindings = [
  'card_title',
  'card_text',
  'card_image',
  'card_button',
  'card_button_url',
];
const allowedProperties = new Set([
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'border',
  'border-width',
  'border-style',
  'border-color',
  'border-radius',
  'background-color',
  'color',
  'box-shadow',
  'font-size',
  'font-weight',
  'line-height',
  'text-align',
]);
function applyStyles(card: HTMLElement, css: string): void {
  for (const declaration of css.split(';')) {
    const match = /^\s*([a-z-]+)\s*[:=]\s*(.+?)\s*$/i.exec(declaration);
    if (!match?.[1] || !match[2]) continue;
    const property = match[1].toLowerCase();
    const value = match[2];
    if (
      allowedProperties.has(property) &&
      !/url\s*\(|expression\s*\(|[{}@!\\]/i.test(value)
    )
      card.style.setProperty(property, value);
  }
}
function webUrl(
  value: string | undefined,
  document: Document,
): string | undefined {
  if (!value?.trim()) return;
  try {
    const url = new URL(value, document.baseURI);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    /* Invalid RDF values are omitted, not interpreted as HTML or script. */
  }
}

/** One card per SELECT binding; absent fields are optional and rendered as text. */
export function createCardsRenderer(
  options: CardsRendererOptions = {},
): ResultRendererPlugin {
  return {
    id: 'cards',
    wizard: {
      description: {
        en: 'Return at least one of the optional card fields.',
        nl: 'Geef ten minste \u00e9\u00e9n van de optionele kaartvelden terug.',
      },
      bindings: [
        {
          variable: 'card_title',
          required: false,
          description: { en: 'Card heading', nl: 'Titel van de kaart' },
        },
        {
          variable: 'card_text',
          required: false,
          description: {
            en: 'Card description',
            nl: 'Beschrijving van de kaart',
          },
        },
        {
          variable: 'card_image',
          required: false,
          description: {
            en: 'HTTP(S) image URL',
            nl: 'HTTP(S)-URL van afbeelding',
          },
        },
        {
          variable: 'card_button',
          required: false,
          description: {
            en: 'Button label; requires card_button_url',
            nl: 'Knoptekst; vereist card_button_url',
          },
        },
        {
          variable: 'card_button_url',
          required: false,
          description: {
            en: 'HTTP(S) button link',
            nl: 'HTTP(S)-link voor de knop',
          },
        },
      ],
    },
    label: { en: 'Cards', nl: 'Kaarten' },
    icon: createSvgIcon(['M3 4h7v16H3zM14 4h7v16h-7zM3 10h7M14 10h7']),
    documentationUrl: 'https://ldforge.nl/plugins.html#cards',
    supports: (result) =>
      result.kind === 'bindings' &&
      bindings.some((name) => result.variables.includes(name)),
    render(container, result, context) {
      if (result.kind !== 'bindings') return;
      const doc = container.ownerDocument;
      const locale = context?.locale ?? resolveLocale();
      const grid = doc.createElement('div');
      grid.className = 'ldforge-cards';
      grid.setAttribute('role', 'list');
      grid.setAttribute('aria-label', translate(locale, 'cards'));
      for (const binding of result.bindings) {
        const card = doc.createElement('article');
        card.className = 'ldforge-card';
        card.setAttribute('role', 'listitem');
        if (options.allowQueryStyles !== false && context?.directives?.css)
          applyStyles(card, context.directives.css);
        const title = binding.card_title?.value;
        const text = binding.card_text?.value;
        const imageUrl = webUrl(binding.card_image?.value, doc);
        if (imageUrl) {
          const image = doc.createElement('img');
          image.src = imageUrl;
          image.alt = title ? '' : translate(locale, 'cardImage');
          image.setAttribute('loading', 'lazy');
          image.decoding = 'async';
          image.referrerPolicy = 'no-referrer';
          image.addEventListener('error', () => image.remove(), { once: true });
          card.append(image);
        }
        const body = doc.createElement('div');
        body.className = 'ldforge-card-body';
        if (title) {
          const heading = doc.createElement('h3');
          heading.textContent = title;
          body.append(heading);
        }
        if (text) {
          const paragraph = doc.createElement('p');
          paragraph.textContent = text;
          body.append(paragraph);
        }
        const buttonUrl = webUrl(binding.card_button_url?.value, doc);
        const buttonLabel = binding.card_button?.value;
        if (buttonUrl && buttonLabel) {
          const button = doc.createElement('a');
          button.className = 'ldforge-card-button';
          button.href = buttonUrl;
          button.textContent = buttonLabel;
          button.target = '_blank';
          button.rel = 'noopener noreferrer';
          body.append(button);
        }
        if (!imageUrl && !body.childElementCount)
          body.textContent = translate(locale, 'cardEmpty');
        card.append(body);
        grid.append(card);
      }
      if (!result.bindings.length) {
        const empty = doc.createElement('p');
        empty.textContent = translate(locale, 'cardsEmpty');
        container.replaceChildren(empty);
      } else container.replaceChildren(grid);
    },
  };
}
