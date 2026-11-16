import { createTimelineImage } from './image.js';
import { createSvgIcon } from '@ldforge/core';
import type { ResultRendererPlugin } from '@ldforge/core';
import { buildTimelineModel, TimelineDataError } from './model.js';
import { control, lazyLoader, mountLazyView, safeLink } from './runtime.js';
import type { LazyOptions } from './runtime.js';
export {
  buildTimelineModel,
  parseTimelineDate,
  TimelineDataError,
} from './model.js';
export type { TimelineItem } from './model.js';
export type TimelineRendererOptions = LazyOptions;
export interface TimelineHandle {
  destroy(): void;
  fit(options: { animation: boolean }): void;
  zoomIn(percentage: number): void;
  zoomOut(percentage: number): void;
  on(event: string, callback: (event: { items?: string[] }) => void): void;
}
export interface TimelineVisualItem {
  id: string;
  content: HTMLElement;
  start: Date;
  end?: Date;
  group?: string;
  type: 'range' | 'point';
}
export interface TimelineConstructor {
  new (
    container: HTMLElement,
    items: TimelineVisualItem[],
    groups: { id: string; content: HTMLElement }[] | null,
    options: Record<string, unknown>,
  ): TimelineHandle;
}
export const DEFAULT_TIMELINE_LIBRARY_URL =
  'https://cdn.jsdelivr.net/npm/vis-timeline@8.5.6/standalone/esm/vis-timeline-graph2d.min.mjs';
export const DEFAULT_TIMELINE_STYLESHEET_URL =
  'https://cdn.jsdelivr.net/npm/vis-timeline@8.5.6/styles/vis-timeline-graph2d.min.css';
const messages = {
  en: {
    label: 'Timeline',
    loading: 'Loading timeline…',
    failed: 'Could not load or render the timeline.',
    retry: 'Retry loading timeline',
    data: 'Timeline data',
    empty: 'No timeline data to display.',
    invalid: 'Invalid timeline binding at row',
    fit: 'Fit timeline',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    hint: 'Drag to move through time. Ctrl + scroll to zoom.',
  },
  nl: {
    label: 'Tijdlijn',
    loading: 'Tijdlijn laden…',
    failed: 'De tijdlijn kon niet geladen of getoond worden.',
    retry: 'Tijdlijn opnieuw laden',
    data: 'Tijdlijngegevens',
    empty: 'Geen tijdlijngegevens om te tonen.',
    invalid: 'Ongeldige tijdlijnbinding op rij',
    fit: 'Alles tonen',
    zoomIn: 'Inzoomen',
    zoomOut: 'Uitzoomen',
    hint: 'Sleep om door de tijd te bewegen. Ctrl + scroll om te zoomen.',
  },
};
export function createTimelineRenderer(
  options: TimelineRendererOptions = {},
): ResultRendererPlugin {
  const load = lazyLoader(
    options,
    DEFAULT_TIMELINE_LIBRARY_URL,
    DEFAULT_TIMELINE_STYLESHEET_URL,
    'Timeline',
  );
  return {
    id: 'timeline',
    wizard: {
      description: {
        en: 'Display dated events and intervals on an interactive timeline.',
        nl: 'Toon gebeurtenissen en periodes op een interactieve tijdlijn.',
      },
      bindings: [
        {
          variable: 'timelineLabel',
          required: true,
          description: { en: 'Event label', nl: 'Naam van de gebeurtenis' },
        },
        {
          variable: 'timelineStart',
          required: true,
          description: {
            en: 'ISO date or timezone-qualified dateTime',
            nl: 'ISO-datum of dateTime met tijdzone',
          },
        },
        {
          variable: 'timelineEnd',
          required: false,
          description: {
            en: 'ISO end date; must not precede start',
            nl: 'ISO-einddatum; mag niet vóór het begin liggen',
          },
        },
        {
          variable: 'timelineGroup',
          required: false,
          description: { en: 'Group name', nl: 'Groepsnaam' },
        },
        {
          variable: 'timelineDescription',
          required: false,
          description: {
            en: 'Plain-text description',
            nl: 'Beschrijving als platte tekst',
          },
        },
        {
          variable: 'timelineImage',
          required: false,
          description: {
            en: 'HTTP(S) image URL',
            nl: 'HTTP(S)-URL van afbeelding',
          },
        },
        {
          variable: 'timelineLink',
          required: false,
          description: {
            en: 'HTTP(S) label link',
            nl: 'HTTP(S)-link op het label',
          },
        },
      ],
      options: [
        {
          key: 'timeline-title',
          label: { en: 'Title', nl: 'Titel' },
          type: 'text',
          defaultValue: '',
        },
      ],
    },
    label: { en: 'Timeline', nl: 'Tijdlijn' },
    documentationUrl: 'https://ldforge.nl/plugins.html#timeline',
    icon: createSvgIcon(['M3 12h18M6 8v8M12 5v14M18 8v8']),
    supports: (result) =>
      result.kind === 'bindings' &&
      ['timelineLabel', 'timelineStart'].every((key) =>
        result.variables.includes(key),
      ),
    render(container, result, context) {
      const locale = context?.locale ?? 'en';
      const text = messages[locale];
      const doc = container.ownerDocument;
      let items;
      try {
        items = buildTimelineModel(result);
      } catch (error) {
        const alert = doc.createElement('p');
        alert.setAttribute('role', 'alert');
        alert.textContent =
          error instanceof TimelineDataError
            ? `${text.invalid} ${error.row}.`
            : text.failed;
        container.replaceChildren(alert);
        return;
      }
      if (!items.length) {
        container.textContent = text.empty;
        return;
      }
      const title = context?.directives?.['timeline-title'] ?? text.label;
      const format = (date: Date) =>
        new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeZone: 'UTC',
        }).format(date);
      const table = doc.createElement('table');
      table.style.overflowWrap = 'anywhere';
      const caption = table.createCaption();
      caption.textContent = title;
      const head = table.createTHead().insertRow();
      for (const value of locale === 'nl'
        ? ['Gebeurtenis', 'Begin', 'Einde', 'Groep']
        : ['Event', 'Start', 'End', 'Group']) {
        const cell = doc.createElement('th');
        cell.scope = 'col';
        cell.textContent = value;
        head.append(cell);
      }
      const body = table.createTBody();
      for (const item of items) {
        const row = body.insertRow();
        row.insertCell().append(safeLink(doc, item.label, item.link));
        row.insertCell().textContent = format(item.start);
        row.insertCell().textContent = item.end ? format(item.end) : '';
        row.insertCell().textContent = item.group ?? '';
      }
      return mountLazyView(
        container,
        'timeline',
        title,
        text,
        table,
        load,
        (module, frame, controls) => {
          const exports = module as {
            Timeline?: unknown;
            default?: { Timeline?: unknown };
          } | null;
          const Constructor = exports?.Timeline ?? exports?.default?.Timeline;
          if (typeof Constructor !== 'function')
            throw new Error('Expected vis-timeline module.');
          let timeline: TimelineHandle | undefined;
          try {
            const groups = new Map<string, string>();
            for (const item of items)
              if (item.group && !groups.has(item.group))
                groups.set(item.group, `group-${groups.size}`);
            if (groups.size && items.some((item) => !item.group))
              groups.set('', 'ungrouped');
            // All library content is DOM, never query-supplied HTML strings.
            const visual: TimelineVisualItem[] = items.map((item) => ({
              id: item.id,
              content: (() => {
                const content = safeLink(doc, item.label, item.link);
                const image = createTimelineImage(
                  doc,
                  item.image,
                  item.label,
                  true,
                );
                if (image) {
                  Object.assign(content.style, {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                  });
                  content.prepend(image);
                }
                return content;
              })(),
              start: item.start,
              ...(item.end ? { end: item.end } : {}),
              ...(groups.size
                ? { group: groups.get(item.group ?? '') ?? '' }
                : {}),
              type: item.end ? 'range' : 'point',
            }));
            const groupData = [...groups].map(([name, id]) => {
              const content = doc.createElement('span');
              content.textContent =
                name || (locale === 'nl' ? 'Overig' : 'Other');
              return { id, content };
            });
            const style = doc.createElement('style');
            style.textContent = `.ldforge-timeline .vis-item { border-color:var(--ldforge-border-strong, #90b5ab); background:var(--ldforge-hover, #e0eeea); color:var(--ldforge-text, #183c35); border-radius:4px; }
.ldforge-timeline .vis-item a { color:inherit; text-decoration:none; }
.ldforge-timeline .vis-item a:hover { text-decoration:underline; }
.ldforge-timeline .vis-item.vis-selected { background:var(--ldforge-accent-fill, #087f73); border-color:var(--ldforge-accent,#075e55); color:var(--ldforge-on-accent,#fff); }
.ldforge-timeline .vis-labelset .vis-label, .ldforge-timeline .vis-time-axis .vis-text { color:var(--ldforge-muted, #405c57); }
.ldforge-timeline .vis-timeline { border-color:var(--ldforge-border, #d4dfdd); }`;
            controls.append(style);
            timeline = new (Constructor as TimelineConstructor)(
              frame,
              visual,
              groupData.length ? groupData : null,
              {
                height: '420px',
                maxHeight: '420px',
                stack: true,
                editable: false,
                selectable: true,
                showCurrentTime: false,
                horizontalScroll: true,
                verticalScroll: true,
                zoomKey: 'ctrlKey',
                orientation: 'top',
                locale,
                margin: { item: 8, axis: 12 },
                tooltip: { followMouse: false },
              },
            );
            timeline.fit({ animation: false });
            controls.append(
              control(doc, text.fit, () => timeline?.fit({ animation: false })),
              control(doc, text.zoomIn, () => timeline?.zoomIn(0.3)),
              control(doc, text.zoomOut, () => timeline?.zoomOut(0.3)),
            );
            const hint = doc.createElement('span');
            hint.textContent = text.hint;
            hint.style.fontSize = '12px';
            controls.append(hint);
            const selected = doc.createElement('div');
            selected.className = 'ldforge-timeline-selection';
            selected.setAttribute('role', 'status');
            selected.style.flexBasis = '100%';
            controls.append(selected);
            timeline.on('select', (event) => {
              selected.replaceChildren();
              const item = items.find((item) => item.id === event.items?.[0]);
              if (!item) return;
              selected.append(
                safeLink(doc, item.label, item.link),
                ` · ${format(item.start)}${item.end ? ` – ${format(item.end)}` : ''}`,
              );
              const image = createTimelineImage(doc, item.image, item.label);
              if (image) selected.append(image);
              if (item.description) {
                const description = doc.createElement('p');
                description.textContent = item.description;
                selected.append(description);
              }
            });
            return () => {
              timeline?.destroy();
              timeline = undefined;
            };
          } catch (error) {
            timeline?.destroy();
            throw error;
          }
        },
      );
    },
  };
}
