import { createGeoPopup } from './popup.js';
import type { GeoPopupRenderer } from './popup.js';
import type { GeoFeature, Position } from './model.js';

export interface ThreeDMapHandle {
  on(event: string, callback: (event: ThreeDMapEvent) => void): void;
  off(event: string, callback: (event: ThreeDMapEvent) => void): void;
  remove(): void;
  resize(): void;
  addControl(control: unknown): void;
  queryRenderedFeatures(
    point: unknown,
    options: { layers: string[] },
  ): {
    properties?: {
      label?: unknown;
      height?: unknown;
      image?: unknown;
      description?: unknown;
      link?: unknown;
    };
  }[];
}
export interface ThreeDMapEvent {
  point?: unknown;
  lngLat?: unknown;
  error?: unknown;
  sourceId?: string;
}
/** Structural interfaces: hosts do not need MapLibre installed for type checking. */
export interface ThreeDLibrary {
  Map: new (options: {
    container: HTMLElement;
    style: Record<string, unknown>;
    bounds: [Position, Position];
    fitBoundsOptions: { padding: number; maxZoom: number };
    pitch: number;
    bearing: number;
    canvasContextAttributes: { preserveDrawingBuffer: boolean };
  }) => ThreeDMapHandle;
  NavigationControl: new (options: { visualizePitch: boolean }) => unknown;
  Popup: new () => {
    setLngLat(position: unknown): {
      setDOMContent(content: HTMLElement): {
        addTo(map: ThreeDMapHandle): unknown;
      };
    };
    remove(): void;
  };
}
export interface ThreeDOptions {
  renderPopup?: GeoPopupRenderer;
  tileUrl?: string | false;
  tileAttribution?: string;
}

export function hasExtrusions(features: GeoFeature[]): boolean {
  return features.some(
    (feature) =>
      ['Polygon', 'MultiPolygon'].includes(feature.geometry.type) &&
      (feature.properties.height ?? 0) > 0,
  );
}

export function featureBounds(features: GeoFeature[]): [Position, Position] {
  const min: Position = [180, 90];
  const max: Position = [-180, -90];
  function visit(
    coordinates: Position | Position[] | Position[][] | Position[][][],
  ): void {
    if (typeof coordinates[0] === 'number') {
      const [lng, lat] = coordinates as Position;
      min[0] = Math.min(min[0], lng);
      min[1] = Math.min(min[1], lat);
      max[0] = Math.max(max[0], lng);
      max[1] = Math.max(max[1], lat);
    } else {
      for (const child of coordinates)
        visit(child as Position | Position[] | Position[][]);
    }
  }
  for (const feature of features) visit(feature.geometry.coordinates);
  return [min, max];
}

/** All geometry lives in one GeoJSON source; polygon holes and Multi geometries stay intact. */
export function threeDStyle(
  features: GeoFeature[],
  options: ThreeDOptions,
): Record<string, unknown> {
  const tiles = options.tileUrl !== false;
  return {
    version: 8,
    sources: {
      ...(tiles
        ? {
            basemap: {
              type: 'raster',
              tiles: [
                options.tileUrl ??
                  'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              ],
              tileSize: 256,
              maxzoom: 19,
              attribution:
                options.tileAttribution ??
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
          }
        : {}),
      results: {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#e9eee7' },
      },
      ...(tiles ? [{ id: 'basemap', type: 'raster', source: 'basemap' }] : []),
      {
        id: 'buildings',
        type: 'fill-extrusion',
        source: 'results',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-extrusion-color': '#3e8c7d',
          'fill-extrusion-height': ['coalesce', ['get', 'height'], 0],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.9,
        },
      },
      {
        id: 'lines',
        type: 'line',
        source: 'results',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#176b5c', 'line-width': 3 },
      },
      {
        id: 'points',
        type: 'circle',
        source: 'results',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': '#176b5c',
          'circle-radius': 6,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1,
        },
      },
    ],
  };
}

export function createThreeDMap(
  container: HTMLElement,
  features: GeoFeature[],
  module: unknown,
  options: ThreeDOptions,
): { ready: Promise<void>; destroy(): void } {
  const exports = module as { default?: unknown } | null;
  const library = (exports?.default ?? module) as ThreeDLibrary | null;
  if (
    !library ||
    typeof library.Map !== 'function' ||
    typeof library.NavigationControl !== 'function' ||
    typeof library.Popup !== 'function'
  )
    throw new Error('Expected MapLibre module.');
  const map = new library.Map({
    container,
    style: threeDStyle(features, options),
    bounds: featureBounds(features),
    fitBoundsOptions: { padding: 48, maxZoom: 18 },
    pitch: 55,
    bearing: -20,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  let disposed = false;
  let popup: InstanceType<ThreeDLibrary['Popup']> | undefined;
  let observer: ResizeObserver | undefined;
  let settle: (error?: unknown) => void = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const loaded = () => settle();
  // Missing basemap tiles must not prevent the user's own geometry from rendering.
  const failed = (event: ThreeDMapEvent) => {
    if (!event.sourceId || event.sourceId === 'results')
      settle(event.error ?? new Error('3D map failed.'));
  };
  const ready = new Promise<void>((resolve, reject) => {
    settle = (error) => {
      clearTimeout(timer);
      map.off('load', loaded);
      map.off('error', failed);
      if (error) reject(error);
      else resolve();
    };
    timer = setTimeout(() => settle(new Error('3D map timed out.')), 15000);
  });
  const click = (event: ThreeDMapEvent) => {
    const feature = map.queryRenderedFeatures(event.point, {
      layers: ['buildings', 'lines', 'points'],
    })[0];
    if (!feature || !event.lngLat || disposed) return;
    const content =
      options.renderPopup?.(
        container.ownerDocument,
        feature.properties ?? {},
      ) ?? createGeoPopup(container.ownerDocument, feature.properties);
    popup?.remove();
    popup = new library.Popup();
    popup.setLngLat(event.lngLat).setDOMContent(content).addTo(map);
  };
  function destroy(): void {
    if (disposed) return;
    disposed = true;
    settle();
    map.off('click', click);
    observer?.disconnect();
    popup?.remove();
    map.remove();
  }
  try {
    map.on('load', loaded);
    map.on('error', failed);
    map.on('click', click);
    map.addControl(new library.NavigationControl({ visualizePitch: true }));
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => map.resize());
      observer.observe(container);
    }
  } catch (error) {
    settle(error);
    destroy();
  }
  return { ready, destroy };
}
