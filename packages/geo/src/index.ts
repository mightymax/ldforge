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
export interface GeoRendererOptions {
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
            ? `${text.invalid} ${error.row}.`
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
      const modeLabel = doc.createElement('label');
      modeLabel.textContent = text.mode;
      const select = doc.createElement('select');
      select.setAttribute('aria-label', text.mode);
      for (const mode of ['normal', 'grouped', 'heatmap'] as const) {
        const option = doc.createElement('option');
        option.value = mode;
        option.textContent = text[mode];
        select.append(option);
      }
      const initialMode =
        context?.directives?.['geo-mode'] ?? options.mode ?? 'normal';
      select.value = ['normal', 'grouped', 'heatmap'].includes(initialMode)
        ? initialMode
        : 'normal';
      modeLabel.append(select);
      const frame = doc.createElement('div');
      frame.style.height = '420px';
      frame.style.isolation = 'isolate';
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
        item.textContent = `${feature.properties.label}: ${feature.geometry.type} ${JSON.stringify(feature.geometry.coordinates)}`;
        list.append(item);
      }
      details.append(summary, list);
      section.append(heading, modeLabel, frame, status, retry, details);
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
                } else layer.bindPopup(label);
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
          const render = await prepareMode(
            select.value as GeoMode,
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
      select.disabled = true;
      select.addEventListener('change', () => {
        void updateMode();
      });
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
          select.disabled = false;
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
