import type { GeoFeature, Position } from './model.js';
import type { GeoLayerHandle, GeoMapHandle } from './index.js';

export type GeoMode = 'normal' | 'grouped' | 'heatmap' | '3d';
export interface ClusterIndex {
  load(features: GeoFeature[]): unknown;
  getClusters(
    bounds: [number, number, number, number],
    zoom: number,
  ): {
    geometry: { type: 'Point'; coordinates: Position };
    properties: {
      cluster?: boolean;
      cluster_id?: number;
      point_count?: number;
      label?: string;
      image?: string;
      description?: string;
      link?: string;
      height?: number;
    };
  }[];
  getClusterExpansionZoom(id: number): number;
}
export interface ClusterConstructor {
  new (options: { radius: number; maxZoom: number }): ClusterIndex;
}
export interface HeatHandle {
  data(points: [number, number, number][]): HeatHandle;
  max(value: number): HeatHandle;
  radius(value: number, blur: number): HeatHandle;
  resize(): void;
  draw(opacity: number): HeatHandle;
}
export type HeatFactory = (canvas: HTMLCanvasElement) => HeatHandle;
export type ModeRenderer = (
  map: GeoMapHandle,
  frame: HTMLElement,
  draw: (features: GeoFeature[]) => GeoLayerHandle,
) => () => void;

export function splitPoints(features: GeoFeature[]): {
  points: GeoFeature[];
  shapes: GeoFeature[];
} {
  const points: GeoFeature[] = [];
  const shapes: GeoFeature[] = [];
  for (const feature of features) {
    if (feature.geometry.type === 'Point') points.push(feature);
    else if (feature.geometry.type === 'MultiPoint')
      for (const coordinates of feature.geometry.coordinates)
        points.push({ ...feature, geometry: { type: 'Point', coordinates } });
    else shapes.push(feature);
  }
  return { points, shapes };
}
function defaultExport(module: unknown): unknown {
  return (module as { default?: unknown } | null)?.default ?? module;
}

/** Load before mutating the live map, so stale mode requests can be discarded. */
export async function prepareMode(
  mode: Exclude<GeoMode, '3d'>,
  features: GeoFeature[],
  loadCluster: () => Promise<unknown>,
  loadHeat: () => Promise<unknown>,
): Promise<ModeRenderer> {
  const { points, shapes } = splitPoints(features);
  if (mode === 'normal' || !points.length)
    return (_map, _frame, draw) => {
      const layer = draw(features);
      return () => layer.remove();
    };
  if (mode === 'grouped') {
    const Constructor = defaultExport(await loadCluster());
    if (typeof Constructor !== 'function')
      throw new Error('Expected Supercluster module.');
    const index = new (Constructor as ClusterConstructor)({
      radius: 50,
      maxZoom: 18,
    });
    index.load(points);
    return (map, _frame, draw) => {
      const shapesLayer = draw(shapes);
      let clusters: GeoLayerHandle | undefined;
      const refresh = () => {
        clusters?.remove();
        clusters = draw(
          index
            .getClusters([-180, -90, 180, 90], Math.floor(map.getZoom()))
            .map((feature) => ({
              type: 'Feature',
              geometry: feature.geometry,
              properties: feature.properties.cluster
                ? {
                    label: String(feature.properties.point_count),
                    count: feature.properties.point_count ?? 1,
                    expansionZoom: index.getClusterExpansionZoom(
                      feature.properties.cluster_id ?? 0,
                    ),
                  }
                : {
                    ...feature.properties,
                    label: feature.properties.label ?? '',
                  },
            })),
        );
      };
      try {
        refresh();
        map.on('zoomend', refresh);
      } catch (error) {
        shapesLayer.remove();
        clusters?.remove();
        throw error;
      }
      return () => {
        map.off('zoomend', refresh);
        shapesLayer.remove();
        clusters?.remove();
      };
    };
  }
  const factory = defaultExport(await loadHeat());
  if (typeof factory !== 'function')
    throw new Error('Expected simpleheat module.');
  return (map, frame, draw) => {
    const shapesLayer = draw(shapes);
    const canvas = frame.ownerDocument.createElement('canvas');
    canvas.className = 'ldforge-geo-heatmap';
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '450',
    });
    canvas.setAttribute('aria-hidden', 'true');
    frame.append(canvas);
    let heat: HeatHandle;
    const refresh = () => {
      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;
      const data: [number, number, number][] = points
        .map((feature): [number, number, number] => {
          const [lng, lat] = feature.geometry.coordinates as Position;
          const position = map.latLngToContainerPoint([lat, lng]);
          return [position.x, position.y, 1];
        })
        .filter(
          ([x, y]) =>
            x >= -50 && y >= -50 && x <= size.x + 50 && y <= size.y + 50,
        );
      heat.resize();
      heat.data(data).max(5).radius(20, 15).draw(0.15);
    };
    try {
      heat = (factory as HeatFactory)(canvas);
      refresh();
      map.on('move zoom resize', refresh);
    } catch (error) {
      canvas.remove();
      shapesLayer.remove();
      throw error;
    }
    return () => {
      map.off('move zoom resize', refresh);
      canvas.remove();
      shapesLayer.remove();
    };
  };
}
