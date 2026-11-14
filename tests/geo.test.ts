import { describe, expect, it, vi } from 'vitest';
import { createGeoRenderer, parseWkt } from '@ldforge/geo';
import type { GeoFeature, GeoLibrary } from '@ldforge/geo';
import type { QueryResult } from '@ldforge/core';
import { buildGeoFeatures } from '../packages/geo/src/model.js';

function result(
  wkt = 'Point(4.9 52.3)',
  label = '<img src=x onerror=alert(1)>',
): QueryResult {
  return {
    kind: 'bindings',
    variables: ['geometry', 'geometryLabel'],
    bindings: [
      {
        geometry: { type: 'literal', value: wkt },
        geometryLabel: { type: 'literal', value: label },
      },
    ],
  };
}
function mockLibrary() {
  const map = {
    fitBounds: vi.fn(),
    remove: vi.fn(),
    invalidateSize: vi.fn(),
    getZoom: vi.fn(() => 8),
    getSize: vi.fn(() => ({ x: 600, y: 420 })),
    latLngToContainerPoint: vi.fn(() => ({ x: 100, y: 100 })),
    on: vi.fn(),
    off: vi.fn(),
    setView: vi.fn(),
  };
  const layer = {
    addTo: vi.fn().mockReturnThis(),
    getBounds: vi.fn(() => 'bounds'),
    remove: vi.fn(),
  };
  const L: GeoLibrary = {
    map: vi.fn(() => map),
    circleMarker: vi.fn(),
    tileLayer: vi.fn(() => layer),
    geoJSON: vi.fn(() => layer),
  };
  return { L, map, layer };
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

describe('WKT geodata', () => {
  it.each([
    ['POINT (4 52)', 'Point'],
    ['LINESTRING (4 52, 5 53)', 'LineString'],
    [
      'POLYGON ((4 52,5 52,5 53,4 52),(4.1 52.1,4.2 52.1,4.2 52.2,4.1 52.1))',
      'Polygon',
    ],
    ['MULTIPOINT ((4 52),(5 53))', 'MultiPoint'],
    ['MULTIPOINT (4 52,5 53)', 'MultiPoint'],
    ['MULTILINESTRING ((4 52,5 53))', 'MultiLineString'],
    ['MULTIPOLYGON (((4 52,5 52,5 53,4 52)))', 'MultiPolygon'],
    [
      '<http://www.opengis.net/def/crs/OGC/1.3/CRS84> Point(4e0 5.2e1)',
      'Point',
    ],
  ])('parses %s', (wkt, type) => {
    expect(parseWkt(wkt).type).toBe(type);
  });
  it.each([
    'POINT(181 52)',
    'POINT(4 91)',
    'POINT(NaN 52)',
    'POINT(4 52 1)',
    'POINT EMPTY',
    'SRID=28992;POINT(4 52)',
    '<http://unknown> POINT(4 52)',
    'LINESTRING(4 52)',
    'POLYGON((4 52,5 52,5 53,4 53))',
    'POINT(4 52) garbage',
    'POINT(4,52)',
    'POINT(4.9.2)',
    'POINT(4-52)',
    'POINT(4 52,)',
  ])('rejects %s', (wkt) => expect(() => parseWkt(wkt)).toThrow());
  it('reports the invalid row without silently dropping it', () => {
    expect(() => buildGeoFeatures(result('broken'))).toThrow('row 1');
    expect(buildGeoFeatures(result())[0]?.geometry).toEqual({
      type: 'Point',
      coordinates: [4.9, 52.3],
    });
  });
});
describe('lazy map lifecycle', () => {
  it('loads only on activation, fits bounds, uses safe popups, and removes maps', async () => {
    const { L, map } = mockLibrary();
    const loadLibrary = vi.fn(async () => ({ default: L }));
    const plugin = createGeoRenderer({
      loadLibrary,
      stylesheetUrl: false,
      tileUrl: false,
    });
    expect(plugin.supports(result())).toBe(true);
    expect(plugin.supports({ kind: 'boolean', value: true })).toBe(false);
    expect(loadLibrary).not.toHaveBeenCalled();
    const container = document.createElement('div');
    const cleanup = plugin.render(container, result(), { locale: 'nl' });
    await flush();
    expect(loadLibrary).toHaveBeenCalledTimes(1);
    expect(map.fitBounds).toHaveBeenCalledWith('bounds', {
      padding: [24, 24],
      maxZoom: 14,
    });
    expect(L.tileLayer).not.toHaveBeenCalled();
    const config = vi.mocked(L.geoJSON).mock.calls[0]?.[1];
    const bindPopup = vi.fn();
    config?.onEachFeature(buildGeoFeatures(result())[0] as GeoFeature, {
      bindPopup,
      bindTooltip: vi.fn(),
      on: vi.fn(),
      getLatLng: vi.fn(),
    });
    expect(bindPopup.mock.calls[0]?.[0].textContent).toContain('<img');
    expect(bindPopup.mock.calls[0]?.[0].querySelector('img')).toBeNull();
    config?.pointToLayer(
      buildGeoFeatures(result())[0] as GeoFeature,
      [52.3, 4.9],
    );
    expect(L.circleMarker).toHaveBeenCalled();
    if (typeof cleanup === 'function') cleanup();
    expect(map.remove).toHaveBeenCalledTimes(1);
  });
  it('does not load for empty or invalid bindings', () => {
    const loadLibrary = vi.fn();
    const plugin = createGeoRenderer({ loadLibrary });
    const node = document.createElement('div');
    plugin.render(node, result('invalid'));
    expect(node.querySelector('[role=alert]')?.textContent).toContain('row 1');
    plugin.render(node, {
      kind: 'bindings',
      variables: ['geometry'],
      bindings: [],
    });
    expect(node.textContent).toContain('No geometry');
    expect(loadLibrary).not.toHaveBeenCalled();
  });
  it('discards a late library completion after cleanup', async () => {
    const { L } = mockLibrary();
    let resolve!: (value: unknown) => void;
    const plugin = createGeoRenderer({
      stylesheetUrl: false,
      loadLibrary: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    const cleanup = plugin.render(document.createElement('div'), result());
    await flush();
    if (typeof cleanup === 'function') cleanup();
    resolve(L);
    await flush();
    expect(L.map).not.toHaveBeenCalled();
  });
  it('retries a failed loader and adds the attributed basemap', async () => {
    const { L, map } = mockLibrary();
    const loadLibrary = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(L);
    const node = document.createElement('div');
    const cleanup = createGeoRenderer({
      loadLibrary,
      stylesheetUrl: false,
    }).render(node, result());
    await flush();
    expect(node.textContent).toContain('Could not load');
    node
      .querySelector<HTMLButtonElement>('button:not([data-geo-mode])')
      ?.click();
    await flush();
    expect(loadLibrary).toHaveBeenCalledTimes(2);
    expect(L.tileLayer).toHaveBeenCalledWith(
      expect.stringContaining('openstreetmap.org'),
      expect.objectContaining({
        attribution: expect.stringContaining('OpenStreetMap'),
      }),
    );
    expect(map.fitBounds).toHaveBeenCalled();
    if (typeof cleanup === 'function') cleanup();
  });
});

describe('map display modes', () => {
  it('loads clustering only when grouped is selected and removes event handlers on switching', async () => {
    const { L, map } = mockLibrary();
    const index = {
      load: vi.fn(),
      getClusters: vi.fn(() => [
        {
          geometry: { type: 'Point', coordinates: [4.9, 52.3] },
          properties: { cluster: true, cluster_id: 7, point_count: 2 },
        },
      ]),
      getClusterExpansionZoom: vi.fn(() => 12),
    };
    const loadClusterLibrary = vi.fn(async () => ({
      default: class {
        constructor() {
          return index;
        }
      },
    }));
    const loadHeatLibrary = vi.fn();
    const node = document.createElement('div');
    const cleanup = createGeoRenderer({
      loadLibrary: async () => L,
      stylesheetUrl: false,
      tileUrl: false,
      loadClusterLibrary,
      loadHeatLibrary,
    }).render(node, result());
    await flush();
    expect(loadClusterLibrary).not.toHaveBeenCalled();
    node.querySelector<HTMLButtonElement>('[data-geo-mode="grouped"]')?.click();
    await flush();
    expect(loadClusterLibrary).toHaveBeenCalledTimes(1);
    expect(loadHeatLibrary).not.toHaveBeenCalled();
    expect(index.load).toHaveBeenCalled();
    expect(map.on).toHaveBeenCalledWith('zoomend', expect.any(Function));
    const config = vi.mocked(L.geoJSON).mock.calls.at(-1)?.[1];
    const feature = vi.mocked(L.geoJSON).mock.calls.at(-1)?.[0]
      .features[0] as GeoFeature;
    const bindTooltip = vi.fn();
    const on = vi.fn();
    config?.onEachFeature(feature, {
      bindPopup: vi.fn(),
      bindTooltip,
      on,
      getLatLng: () => [52.3, 4.9],
    });
    expect(bindTooltip).toHaveBeenCalled();
    on.mock.calls[0]?.[1]();
    expect(map.setView).toHaveBeenCalledWith([52.3, 4.9], 12);
    node.querySelector<HTMLButtonElement>('[data-geo-mode="normal"]')?.click();
    await flush();
    expect(map.off).toHaveBeenCalledWith('zoomend', expect.any(Function));
    if (typeof cleanup === 'function') cleanup();
  });
  it.each(['mode', 'geo-mode'])(
    'accepts %s for the initial heatmap and cleans it up',
    async (directive) => {
      const { L, map } = mockLibrary();
      const heat = {
        data: vi.fn().mockReturnThis(),
        max: vi.fn().mockReturnThis(),
        radius: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        draw: vi.fn().mockReturnThis(),
      };
      const loadHeatLibrary = vi.fn(async () => ({ default: () => heat }));
      const node = document.createElement('div');
      const cleanup = createGeoRenderer({
        loadLibrary: async () => L,
        stylesheetUrl: false,
        tileUrl: false,
        loadHeatLibrary,
      }).render(node, result(), {
        locale: 'en',
        directives: { [directive]: 'heatmap' },
      });
      await flush();
      expect(loadHeatLibrary).toHaveBeenCalledTimes(1);
      expect(node.querySelector('canvas')).not.toBeNull();
      expect(heat.data).toHaveBeenCalledWith([[100, 100, 1]]);
      expect(map.on).toHaveBeenCalledWith(
        'move zoom resize',
        expect.any(Function),
      );
      if (typeof cleanup === 'function') cleanup();
      expect(node.querySelector('canvas')).toBeNull();
      expect(map.off).toHaveBeenCalledWith(
        'move zoom resize',
        expect.any(Function),
      );
    },
  );
  it('discards a late mode load after switching back to normal', async () => {
    const { L } = mockLibrary();
    let resolve!: (value: unknown) => void;
    const node = document.createElement('div');
    const cleanup = createGeoRenderer({
      loadLibrary: async () => L,
      stylesheetUrl: false,
      tileUrl: false,
      loadClusterLibrary: () =>
        new Promise((done) => {
          resolve = done;
        }),
    }).render(node, result());
    await flush();
    node.querySelector<HTMLButtonElement>('[data-geo-mode="grouped"]')?.click();
    await flush();
    node.querySelector<HTMLButtonElement>('[data-geo-mode="normal"]')?.click();
    await flush();
    const calls = vi.mocked(L.geoJSON).mock.calls.length;
    const getClusters = vi.fn();
    resolve({
      default: class {
        load() {}
        getClusters = getClusters;
      },
    });
    await flush();
    expect(vi.mocked(L.geoJSON).mock.calls.length).toBe(calls);
    expect(getClusters).not.toHaveBeenCalled();
    if (typeof cleanup === 'function') cleanup();
  });
});
