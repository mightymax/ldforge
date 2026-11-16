import { createGeoPopup } from './popup.js';
import { createThreeDMap, hasExtrusions } from './three-dimensional.js';
export type {
  ThreeDLibrary,
  ThreeDMapHandle,
  ThreeDMapEvent,
} from './three-dimensional.js';
import { createSvgIcon } from '@ldforge/core';
import type { ResultRendererPlugin } from '@ldforge/core';
import { prepareMode } from './modes.js';
import type { GeoMode } from './modes.js';
export type {
  GeoMode,
  ClusterConstructor,
  ClusterIndex,
  HeatFactory,
  HeatHandle,
} from './modes.js';
import { buildGeoFeatures, GeoDataError } from './model.js';
import type { GeoFeature } from './model.js';
export { parseWkt, GeoDataError } from './model.js';
export type { Geometry, GeoFeature, Position } from './model.js';

export const DEFAULT_GEO_LIBRARY_URL =
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm';
export const DEFAULT_GEO_STYLESHEET_URL =
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
export interface GeoMapHandle {
  fitBounds(
    bounds: unknown,
    options: { padding: [number, number]; maxZoom: number },
  ): void;
  remove(): void;
  invalidateSize(): void;
  getZoom(): number;
  getSize(): { x: number; y: number };
  latLngToContainerPoint(latlng: [number, number]): { x: number; y: number };
  on(events: string, callback: () => void): void;
  off(events: string, callback: () => void): void;
  setView(latlng: unknown, zoom: number): void;
}
export interface GeoLayerHandle {
  addTo(map: GeoMapHandle): GeoLayerHandle;
  getBounds(): unknown;
  remove(): void;
}
/** Structural interface: Leaflet types are not required by consumers. */
export interface GeoLibrary {
  map(container: HTMLElement): GeoMapHandle;
  tileLayer(
    url: string,
    options: { attribution: string; maxZoom: number },
  ): { addTo(map: GeoMapHandle): unknown };
  circleMarker(latlng: unknown, options: { radius: number }): unknown;
  geoJSON(
    data: { type: 'FeatureCollection'; features: GeoFeature[] },
    options: {
      pointToLayer(feature: GeoFeature, latlng: unknown): unknown;
      onEachFeature(
        feature: GeoFeature,
        layer: {
          bindPopup(content: HTMLElement): unknown;
          getPopup?(): { update(): void } | undefined;
          bindTooltip(
            content: HTMLElement,
            options: { permanent: boolean; direction: string },
          ): unknown;
          on(event: string, callback: () => void): unknown;
          getLatLng(): unknown;
        },
      ): void;
    },
  ): GeoLayerHandle;
}
export const DEFAULT_THREE_D_LIBRARY_URL =
  'https://cdn.jsdelivr.net/npm/maplibre-gl@6.18.0/dist/maplibre-gl.mjs';
export const DEFAULT_THREE_D_STYLESHEET_URL =
  'https://cdn.jsdelivr.net/npm/maplibre-gl@6.18.0/dist/maplibre-gl.css';
export interface GeoRendererOptions {
  readonly threeDLibraryUrl?: string;
  readonly loadThreeDLibrary?: () => Promise<unknown>;
  readonly threeDStylesheetUrl?: string | false;
  readonly libraryUrl?: string;
  readonly loadLibrary?: () => Promise<unknown>;
  readonly clusterLibraryUrl?: string;
  readonly heatLibraryUrl?: string;
  readonly loadClusterLibrary?: () => Promise<unknown>;
  readonly loadHeatLibrary?: () => Promise<unknown>;
  readonly mode?: GeoMode;
  /** false when the host supplies Leaflet CSS itself. */
  readonly stylesheetUrl?: string | false;
  /** false to disable basemap requests. */
  readonly tileUrl?: string | false;
  /** Trusted host configuration; Leaflet renders attribution as HTML. */
  readonly tileAttribution?: string;
}
const messages = {
  en: {
    label: 'Map',
    loading: 'Loading map…',
    failed: 'Could not load or render the map.',
    retry: 'Retry loading map',
    empty: 'No geometry to display.',
    invalid: 'Invalid WGS84 WKT geometry at row',
    invalidHeight:
      'Invalid geometryHeight (expected a nonnegative height in meters) at row',
    '3d': '3D',
    data: 'Map data',
    mode: 'Map display',
    normal: 'Normal',
    grouped: 'Grouped',
    heatmap: 'Heatmap',
  },
  nl: {
    label: 'Kaart',
    loading: 'Kaart laden…',
    failed: 'De kaart kon niet geladen of getoond worden.',
    retry: 'Kaart opnieuw laden',
    empty: 'Geen geometrie om te tonen.',
    invalid: 'Ongeldige WGS84 WKT-geometrie op rij',
    invalidHeight:
      'Ongeldige geometryHeight (verwacht een niet-negatieve hoogte in meters) op rij',
    '3d': '3D',
    data: 'Kaartgegevens',
    mode: 'Kaartweergave',
    normal: 'Normaal',
    grouped: 'Gegroepeerd',
    heatmap: 'Heatmap',
  },
};
export const DEFAULT_CLUSTER_LIBRARY_URL =
  'https://cdn.jsdelivr.net/npm/supercluster@8.0.1/+esm';
export const DEFAULT_HEAT_LIBRARY_URL =
  'https://cdn.jsdelivr.net/npm/simpleheat@0.4.0/+esm';
const modules = new Map<string, Promise<unknown>>();
function httpUrl(value: string, base: string): string {
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Expected HTTP(S) URL.');
  return url.href;
}
function externalModule(url: string): Promise<unknown> {
  let promise = modules.get(url);
  if (!promise) {
    promise = import(/* @vite-ignore */ url).catch((error: unknown) => {
      modules.delete(url);
      throw error;
    });
    modules.set(url, promise);
  }
  return promise;
}
const styles = new WeakMap<Document, Map<string, Promise<void>>>();
function stylesheet(doc: Document, url: string): Promise<void> {
  let entries = styles.get(doc);
  if (!entries) {
    entries = new Map();
    styles.set(doc, entries);
  }
  let promise = entries.get(url);
  if (!promise) {
    promise = new Promise<void>((resolve, reject) => {
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      const timer = setTimeout(() => fail(), 15000);
      function fail(): void {
        clearTimeout(timer);
        entries?.delete(url);
        link.remove();
        reject(new Error('Map CSS failed.'));
      }
      link.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      link.onerror = fail;
      doc.head.append(link);
    });
    entries.set(url, promise);
  }
  return promise;
}
function library(module: unknown): GeoLibrary {
  const exports = module as { default?: unknown } | null;
  const candidate = (exports?.default ?? module) as GeoLibrary | null;
  if (
    !candidate ||
    ['map', 'tileLayer', 'circleMarker', 'geoJSON'].some(
      (key) => typeof candidate[key as keyof GeoLibrary] !== 'function',
    )
  )
    throw new Error('Expected Leaflet ESM module.');
  return candidate;
}

export function createGeoRenderer(
  options: GeoRendererOptions = {},
): ResultRendererPlugin {
  let loaded: Promise<GeoLibrary> | undefined;
  function load(doc: Document): Promise<GeoLibrary> {
    loaded ??= Promise.resolve()
      .then(() =>
        options.loadLibrary
          ? options.loadLibrary()
          : externalModule(
              httpUrl(
                options.libraryUrl ?? DEFAULT_GEO_LIBRARY_URL,
                doc.baseURI,
              ),
            ),
      )
      .then(library)
      .catch((error: unknown) => {
        loaded = undefined;
        throw error;
      });
    return loaded;
  }
  return {
    id: 'geo',
    wizard: {
      description: {
        en: 'Explore geographic results on maps, heatmaps and in 3D.',
        nl: 'Verken geografische resultaten op kaarten, heatmaps en in 3D.',
      },
      bindings: [
        {
          variable: 'geometry',
          required: true,
          description: {
            en: 'WGS84 WKT; longitude first, latitude second',
            nl: 'WGS84 WKT; eerst lengtegraad, dan breedtegraad',
          },
        },
        {
          variable: 'geometryLabel',
          required: false,
          description: { en: 'Feature label', nl: 'Naam van het object' },
        },
        {
          variable: 'geometryHeight',
          required: false,
          description: {
            en: 'Polygon height in meters; nonnegative number',
            nl: 'Polygoonhoogte in meters; niet-negatief getal',
          },
        },
        {
          variable: 'geoImage',
          required: false,
          description: {
            en: 'HTTP(S) image URL',
            nl: 'HTTP(S)-URL van afbeelding',
          },
        },
        {
          variable: 'geoDescription',
          required: false,
          description: {
            en: 'Plain-text description',
            nl: 'Beschrijving als platte tekst',
          },
        },
        {
          variable: 'geoLink',
          required: false,
          description: {
            en: 'HTTP(S) label link',
            nl: 'HTTP(S)-link op het label',
          },
        },
      ],
      options: [
        {
          key: 'mode',
          label: { en: 'Map display', nl: 'Kaartweergave' },
          type: 'select',
          defaultValue: '',
          choices: [
            { value: '', label: { en: 'Automatic', nl: 'Automatisch' } },
            { value: 'normal', label: { en: 'Normal', nl: 'Normaal' } },
            { value: 'grouped', label: { en: 'Grouped', nl: 'Gegroepeerd' } },
            { value: 'heatmap', label: { en: 'Heatmap', nl: 'Heatmap' } },
            { value: '3d', label: { en: '3D', nl: '3D' } },
          ],
        },
        {
          key: 'geo-title',
          label: { en: 'Title', nl: 'Titel' },
          type: 'text',
          defaultValue: '',
        },
      ],
    },
    label: { en: 'Map', nl: 'Kaart' },
    documentationUrl: 'https://ldforge.nl/plugins.html#geo',
    icon: createSvgIcon([
      'M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3zM9 3v15M15 6v15',
    ]),
    supports: (result) =>
      result.kind === 'bindings' && result.variables.includes('geometry'),
    render(container, result, context) {
      const text = messages[context?.locale ?? 'en'];
      const doc = container.ownerDocument;
      let features: GeoFeature[];
      try {
        features = buildGeoFeatures(result);
      } catch (error) {
        const alert = doc.createElement('p');
        alert.setAttribute('role', 'alert');
        alert.textContent =
          error instanceof GeoDataError
            ? `${error.field === 'geometryHeight' ? text.invalidHeight : text.invalid} ${error.row}.`
            : text.failed;
        container.replaceChildren(alert);
        return;
      }
      if (!features.length) {
        container.textContent = text.empty;
        return;
      }
      const section = doc.createElement('section');
      section.className = 'ldforge-geo';
      const heading = doc.createElement('h3');
      heading.textContent = context?.directives?.['geo-title'] ?? text.label;
      const header = doc.createElement('div');
      header.className = 'ldforge-geo-header';
      const modes = doc.createElement('div');
      modes.className = 'ldforge-geo-modes';
      modes.setAttribute('role', 'group');
      modes.setAttribute('aria-label', text.mode);
      const initialMode =
        context?.directives?.mode ??
        context?.directives?.['geo-mode'] ??
        options.mode ??
        (hasExtrusions(features) ? '3d' : 'normal');
      let selectedMode: GeoMode = [
        'normal',
        'grouped',
        'heatmap',
        '3d',
      ].includes(initialMode)
        ? (initialMode as GeoMode)
        : 'normal';
      const buttons = new Map<GeoMode, HTMLButtonElement>();
      function reflectMode(): void {
        for (const [mode, button] of buttons)
          button.setAttribute('aria-pressed', String(mode === selectedMode));
      }
      for (const mode of ['normal', 'grouped', 'heatmap', '3d'] as const) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.textContent = text[mode];
        button.dataset.geoMode = mode;
        button.disabled = true;
        button.addEventListener('click', () => {
          if (selectedMode === mode) return;
          selectedMode = mode;
          reflectMode();
          void updateMode();
        });
        buttons.set(mode, button);
        modes.append(button);
      }
      reflectMode();
      const style = doc.createElement('style');
      style.textContent = `
.ldforge-geo-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:12px; }
.ldforge-geo-header h3 { margin:0; }
.ldforge-geo-modes { display:inline-flex; flex-wrap:wrap; gap:3px; padding:3px; border:1px solid var(--ldforge-border, #d4dfdd); border-radius:9px; background:var(--ldforge-surface-tinted, #f1f5f4); }
.ldforge-geo-modes button { appearance:none; border:0; border-radius:6px; background:transparent; color:var(--ldforge-muted, #405c57); padding:7px 12px; font:500 13px/1.3 system-ui,sans-serif; cursor:pointer; }
.ldforge-geo-modes button[aria-pressed="true"] { background:#fff; color:var(--ldforge-text, #183d35); box-shadow:0 1px 3px var(--ldforge-shadow, #183d3526); }
.ldforge-geo-modes button:hover:not(:disabled) { background:var(--ldforge-hover, #e4eeeb); }
.ldforge-geo-modes button:focus-visible { outline:2px solid var(--ldforge-focus, #087f73); outline-offset:2px; }
.ldforge-geo-modes button:disabled { opacity:.55; cursor:wait; }
`;
      header.append(heading, modes);
      const frame = doc.createElement('div');
      frame.style.height = '420px';
      frame.style.isolation = 'isolate';
      const threeDFrame = doc.createElement('div');
      threeDFrame.className = 'ldforge-geo-3d';
      threeDFrame.style.height = '420px';
      threeDFrame.hidden = true;
      threeDFrame.setAttribute('role', 'region');
      threeDFrame.setAttribute('aria-label', `${heading.textContent} 3D`);
      frame.setAttribute('role', 'region');
      frame.setAttribute('aria-label', heading.textContent);
      const status = doc.createElement('p');
      status.setAttribute('role', 'status');
      const retry = doc.createElement('button');
      retry.type = 'button';
      retry.textContent = text.retry;
      const details = doc.createElement('details');
      const summary = doc.createElement('summary');
      summary.textContent = text.data;
      const list = doc.createElement('ul');
      list.style.overflowWrap = 'anywhere';
      for (const feature of features) {
        const item = doc.createElement('li');
        item.textContent = `${feature.properties.label}: ${feature.geometry.type} ${JSON.stringify(feature.geometry.coordinates)}${feature.properties.height === undefined ? '' : ` (${feature.properties.height} m)`}`;
        list.append(item);
      }
      details.append(summary, list);
      section.append(style, header, frame, threeDFrame, status, retry, details);
      container.replaceChildren(section);
      let disposed = false;
      let map: GeoMapHandle | undefined;
      let observer: ResizeObserver | undefined;
      let clearMode: (() => void) | undefined;
      let generation = 0;
      let activeLibrary: GeoLibrary | undefined;
      function draw(features: GeoFeature[]): GeoLayerHandle {
        if (!map || !activeLibrary) throw new Error('Map unavailable.');
        return activeLibrary
          .geoJSON(
            { type: 'FeatureCollection', features },
            {
              pointToLayer: (feature, latlng) =>
                activeLibrary?.circleMarker(latlng, {
                  radius: feature.properties.count ? 16 : 6,
                }),
              onEachFeature(feature, layer) {
                const label = doc.createElement('span');
                label.textContent = feature.properties.label;
                if (feature.properties.count) {
                  layer.bindTooltip(label, {
                    permanent: true,
                    direction: 'center',
                  });
                  layer.on('click', () =>
                    map?.setView(
                      layer.getLatLng(),
                      feature.properties.expansionZoom ?? 19,
                    ),
                  );
                } else
                  layer.bindPopup(
                    createGeoPopup(doc, feature.properties, () =>
                      layer.getPopup?.()?.update(),
                    ),
                  );
              },
            },
          )
          .addTo(map);
      }
      async function updateMode(): Promise<void> {
        const version = ++generation;
        status.textContent = text.loading;
        retry.hidden = true;
        section.setAttribute('aria-busy', 'true');
        try {
          if (selectedMode === '3d') {
            const [module] = await Promise.all([
              options.loadThreeDLibrary
                ? options.loadThreeDLibrary()
                : externalModule(
                    httpUrl(
                      options.threeDLibraryUrl ?? DEFAULT_THREE_D_LIBRARY_URL,
                      doc.baseURI,
                    ),
                  ),
              options.threeDStylesheetUrl === false
                ? Promise.resolve()
                : stylesheet(
                    doc,
                    httpUrl(
                      options.threeDStylesheetUrl ??
                        DEFAULT_THREE_D_STYLESHEET_URL,
                      doc.baseURI,
                    ),
                  ),
            ]);
            if (disposed || version !== generation) return;
            clearMode?.();
            clearMode = undefined;
            frame.hidden = true;
            threeDFrame.hidden = false;
            try {
              const threeD = createThreeDMap(
                threeDFrame,
                features,
                module,
                options,
              );
              clearMode = () => {
                threeD.destroy();
                threeDFrame.hidden = true;
                frame.hidden = false;
                map?.invalidateSize();
              };
              await threeD.ready;
            } catch (error) {
              if (!disposed && version === generation) {
                clearMode?.();
                clearMode = undefined;
                threeDFrame.hidden = true;
                frame.hidden = false;
              }
              throw error;
            }
            if (!disposed && version === generation) status.textContent = '';
            return;
          }
          const render = await prepareMode(
            selectedMode,
            features,
            () =>
              options.loadClusterLibrary
                ? options.loadClusterLibrary()
                : externalModule(
                    httpUrl(
                      options.clusterLibraryUrl ?? DEFAULT_CLUSTER_LIBRARY_URL,
                      doc.baseURI,
                    ),
                  ),
            () =>
              options.loadHeatLibrary
                ? options.loadHeatLibrary()
                : externalModule(
                    httpUrl(
                      options.heatLibraryUrl ?? DEFAULT_HEAT_LIBRARY_URL,
                      doc.baseURI,
                    ),
                  ),
          );
          if (disposed || version !== generation || !map) return;
          clearMode?.();
          clearMode = undefined;
          clearMode = render(map, frame, draw);
          status.textContent = '';
        } catch {
          if (disposed || version !== generation) return;
          status.textContent = text.failed;
          retry.hidden = false;
        } finally {
          if (!disposed && version === generation)
            section.setAttribute('aria-busy', 'false');
        }
      }
      async function activate(): Promise<void> {
        retry.hidden = true;
        status.textContent = text.loading;
        frame.hidden = true;
        section.setAttribute('aria-busy', 'true');
        try {
          const [L] = await Promise.all([
            load(doc),
            options.stylesheetUrl === false
              ? Promise.resolve()
              : stylesheet(
                  doc,
                  httpUrl(
                    options.stylesheetUrl ?? DEFAULT_GEO_STYLESHEET_URL,
                    doc.baseURI,
                  ),
                ),
          ]);
          if (disposed) return;
          frame.hidden = false;
          map = L.map(frame);
          if (options.tileUrl !== false)
            L.tileLayer(
              options.tileUrl ??
                'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              {
                attribution:
                  options.tileAttribution ??
                  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
              },
            ).addTo(map);
          activeLibrary = L;
          const bounds = draw(features);
          map.fitBounds(bounds.getBounds(), { padding: [24, 24], maxZoom: 14 });
          bounds.remove();
          for (const button of buttons.values()) button.disabled = false;
          await updateMode();
          if (disposed) return;
          if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => map?.invalidateSize());
            observer.observe(frame);
          }
        } catch {
          map?.remove();
          map = undefined;
          if (disposed) return;
          frame.hidden = true;
          status.textContent = text.failed;
          retry.hidden = false;
        } finally {
          if (!disposed) section.setAttribute('aria-busy', 'false');
        }
      }
      retry.addEventListener('click', () => {
        if (map) void updateMode();
        else void activate();
      });
      void activate();
      return () => {
        disposed = true;
        generation++;
        clearMode?.();
        observer?.disconnect();
        map?.remove();
      };
    },
  };
}
