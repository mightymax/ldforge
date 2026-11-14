import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeoRenderer } from '@ldforge/geo';
import type { QueryResult } from '@ldforge/core';
import type { GeoFeature, ThreeDMapEvent } from '@ldforge/geo';
import { buildGeoFeatures } from '../packages/geo/src/model.js';
import {
  createThreeDMap,
  featureBounds,
  hasExtrusions,
  threeDStyle,
} from '../packages/geo/src/three-dimensional.js';

function result(height?: string, type = 'literal'): QueryResult {
  return {
    kind: 'bindings',
    variables: ['geometry', 'geometryLabel', 'geometryHeight'],
    bindings: [
      {
        geometry: { type: 'literal', value: 'POLYGON((5 52,6 52,6 53,5 52))' },
        geometryLabel: { type: 'literal', value: '<img src=x>' },
        ...(height === undefined
          ? {}
          : { geometryHeight: { type, value: height } }),
      },
    ],
  } as QueryResult;
}
function mockThreeD() {
  const events = new Map<string, (event: ThreeDMapEvent) => void>();
  const map = {
    on: vi.fn((name, callback) => events.set(name, callback)),
    off: vi.fn((name, callback) => {
      if (events.get(name) === callback) events.delete(name);
    }),
    remove: vi.fn(),
    resize: vi.fn(),
    addControl: vi.fn(),
    queryRenderedFeatures: vi.fn(() => [
      { properties: { label: '<img src=x>', height: 10 } },
    ]),
  };
  const popup = {
    remove: vi.fn(),
    setLngLat: vi.fn().mockReturnThis(),
    setDOMContent: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
  };
  const library = {
    Map: vi.fn(function () {
      return map;
    }),
    NavigationControl: vi.fn(function () {
      return {};
    }),
    Popup: vi.fn(function () {
      return popup;
    }),
  };
  return { library, map, popup, events };
}
const features = () => buildGeoFeatures(result('10'));
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
afterEach(() => vi.useRealTimers());

describe('building height contract', () => {
  it('retains optional meter heights and selects 3D only for elevated polygons', () => {
    expect(features()[0]?.properties.height).toBe(10);
    expect(buildGeoFeatures(result())[0]?.properties).not.toHaveProperty(
      'height',
    );
    expect(hasExtrusions(features())).toBe(true);
    expect(hasExtrusions(buildGeoFeatures(result('0')))).toBe(false);
    expect(
      hasExtrusions([
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [5, 52] },
          properties: { label: 'Point', height: 10 },
        },
      ]),
    ).toBe(false);
    expect(
      buildGeoFeatures(result('1e2', 'typed-literal'))[0]?.properties.height,
    ).toBe(100);
  });
  it.each(['-1', 'NaN', 'Infinity', '1e999', '', ' ', '10m', '0x10'])(
    'rejects invalid height %s with a row error',
    (height) => {
      expect(() => buildGeoFeatures(result(height))).toThrow(
        'geometryHeight at row 1',
      );
    },
  );
  it('rejects a nonliteral height before loading any map', () => {
    expect(() => buildGeoFeatures(result('10', 'uri'))).toThrow(
      'geometryHeight',
    );
    const loadLibrary = vi.fn();
    const container = document.createElement('div');
    createGeoRenderer({ loadLibrary }).render(container, result('-1'), {
      locale: 'nl',
    });
    expect(container.querySelector('[role=alert]')?.textContent).toContain(
      'geometryHeight',
    );
    expect(loadLibrary).not.toHaveBeenCalled();
  });
});

describe('3D map adapter', () => {
  it('fits every geometry including MultiPolygons and keeps holes and basemap configuration', () => {
    const multi: GeoFeature = {
      type: 'Feature',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [4, 51],
              [7, 51],
              [7, 54],
              [4, 51],
            ],
          ],
        ],
      },
      properties: { label: 'Multi', height: 15 },
    };
    expect(featureBounds([...features(), multi])).toEqual([
      [4, 51],
      [7, 54],
    ]);
    const style = threeDStyle([...features(), multi], { tileUrl: false });
    expect(style.sources).not.toHaveProperty('basemap');
    expect(style.sources).toHaveProperty('results.data.features', [
      ...features(),
      multi,
    ]);
    expect(style.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'fill-extrusion',
          paint: expect.objectContaining({
            'fill-extrusion-height': ['coalesce', ['get', 'height'], 0],
          }),
        }),
      ]),
    );
    expect(threeDStyle(features(), {}).sources).toHaveProperty(
      'basemap.tiles',
      ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    );
    expect(
      threeDStyle(features(), {
        tileUrl: 'https://tiles.example/{z}/{x}/{y}',
        tileAttribution: 'Custom',
      }).sources,
    ).toHaveProperty('basemap.attribution', 'Custom');
  });
  it('renders safe label/height popups, settles on load and removes event handlers on cleanup', async () => {
    const { library, map, popup, events } = mockThreeD();
    const handle = createThreeDMap(
      document.createElement('div'),
      features(),
      { default: library },
      {},
    );
    expect(library.Map).toHaveBeenCalledWith(
      expect.objectContaining({
        pitch: 55,
        bounds: [
          [5, 52],
          [6, 53],
        ],
      }),
    );
    events.get('load')?.({});
    await handle.ready;
    events.get('click')?.({ point: [0, 0], lngLat: [5, 52] });
    const label = popup.setDOMContent.mock.calls[0]?.[0] as HTMLElement;
    expect(label.textContent).toBe('<img src=x> (10 m)');
    expect(label.querySelector('img')).toBeNull();
    expect(popup.addTo).toHaveBeenCalledWith(map);
    events.get('click')?.({ point: [0, 0], lngLat: [5, 52] });
    expect(popup.remove).toHaveBeenCalledTimes(1);
    map.queryRenderedFeatures.mockReturnValueOnce([]);
    events.get('click')?.({ point: [0, 0] });
    handle.destroy();
    handle.destroy();
    expect(map.remove).toHaveBeenCalledTimes(1);
    expect(events.size).toBe(0);
  });
  it('ignores basemap errors but rejects geometry/style failures', async () => {
    const { library, events, map } = mockThreeD();
    const handle = createThreeDMap(
      document.createElement('div'),
      features(),
      library,
      {},
    );
    events.get('error')?.({
      sourceId: 'basemap',
      error: new Error('Tile missing'),
    });
    expect(events.has('load')).toBe(true);
    const failed = expect(handle.ready).rejects.toThrow('Data failed');
    events.get('error')?.({
      sourceId: 'results',
      error: new Error('Data failed'),
    });
    await failed;
    handle.destroy();
    expect(map.remove).toHaveBeenCalledTimes(1);
  });
  it('times out stalled initialization, supports cancellation, and rejects invalid modules', async () => {
    vi.useFakeTimers();
    const first = mockThreeD();
    const handle = createThreeDMap(
      document.createElement('div'),
      features(),
      first.library,
      {},
    );
    const failed = expect(handle.ready).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(15000);
    await failed;
    handle.destroy();
    const second = mockThreeD();
    const cancelled = createThreeDMap(
      document.createElement('div'),
      features(),
      second.library,
      {},
    );
    cancelled.destroy();
    await cancelled.ready;
    expect(() =>
      createThreeDMap(document.createElement('div'), features(), null, {}),
    ).toThrow('Expected MapLibre');
  });
});

function mockLeaflet() {
  const layer = {
    addTo: vi.fn().mockReturnThis(),
    getBounds: vi.fn(),
    remove: vi.fn(),
  };
  return {
    map: vi.fn(() => ({
      fitBounds: vi.fn(),
      remove: vi.fn(),
      invalidateSize: vi.fn(),
    })),
    tileLayer: vi.fn(() => layer),
    circleMarker: vi.fn(),
    geoJSON: vi.fn(() => layer),
  };
}
describe('3D renderer lifecycle', () => {
  it('automatically selects 3D for polygon heights and restores 2D on switching', async () => {
    const threeD = mockThreeD();
    const node = document.createElement('div');
    const loadThreeDLibrary = vi.fn(async () => threeD.library);
    const cleanup = createGeoRenderer({
      loadLibrary: async () => mockLeaflet(),
      stylesheetUrl: false,
      tileUrl: false,
      threeDStylesheetUrl: false,
      loadThreeDLibrary,
    }).render(node, result('10'));
    await flush();
    expect(
      node.querySelector('[data-geo-mode="3d"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(loadThreeDLibrary).toHaveBeenCalledTimes(1);
    threeD.events.get('load')?.({});
    await flush();
    expect(node.querySelector('section')?.getAttribute('aria-busy')).toBe(
      'false',
    );
    node.querySelector<HTMLButtonElement>('[data-geo-mode="normal"]')?.click();
    await flush();
    expect(threeD.map.remove).toHaveBeenCalledTimes(1);
    expect(node.querySelector<HTMLElement>('.ldforge-geo-3d')?.hidden).toBe(
      true,
    );
    if (typeof cleanup === 'function') cleanup();
  });
  it('does not load 3D when a query explicitly chooses normal mode', async () => {
    const loadThreeDLibrary = vi.fn();
    const cleanup = createGeoRenderer({
      loadLibrary: async () => mockLeaflet(),
      stylesheetUrl: false,
      tileUrl: false,
      loadThreeDLibrary,
    }).render(document.createElement('div'), result('10'), {
      locale: 'en',
      directives: { mode: 'normal' },
    });
    await flush();
    expect(loadThreeDLibrary).not.toHaveBeenCalled();
    if (typeof cleanup === 'function') cleanup();
  });
  it('ignores a late 3D download after switching or disposal', async () => {
    let resolve: (module: unknown) => void = () => {};
    const threeD = mockThreeD();
    const node = document.createElement('div');
    const cleanup = createGeoRenderer({
      loadLibrary: async () => mockLeaflet(),
      stylesheetUrl: false,
      tileUrl: false,
      threeDStylesheetUrl: false,
      loadThreeDLibrary: () =>
        new Promise((done) => {
          resolve = done;
        }),
    }).render(node, result('10'));
    await flush();
    node.querySelector<HTMLButtonElement>('[data-geo-mode="normal"]')?.click();
    await flush();
    if (typeof cleanup === 'function') cleanup();
    resolve(threeD.library);
    await flush();
    expect(threeD.library.Map).not.toHaveBeenCalled();
  });
  it('allows retrying a 3D load failure and cleans up pending initialization', async () => {
    const threeD = mockThreeD();
    const loadThreeDLibrary = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(threeD.library);
    const node = document.createElement('div');
    const cleanup = createGeoRenderer({
      loadLibrary: async () => mockLeaflet(),
      stylesheetUrl: false,
      tileUrl: false,
      threeDStylesheetUrl: false,
      loadThreeDLibrary,
    }).render(node, result('10'));
    await flush();
    expect(node.textContent).toContain('Could not load');
    node
      .querySelector<HTMLButtonElement>('button:not([data-geo-mode])')
      ?.click();
    await flush();
    expect(loadThreeDLibrary).toHaveBeenCalledTimes(2);
    if (typeof cleanup === 'function') cleanup();
    await flush();
    expect(threeD.map.remove).toHaveBeenCalledTimes(1);
  });
  it('reports map initialization failure and permits a switch back to normal', async () => {
    const threeD = mockThreeD();
    const node = document.createElement('div');
    const cleanup = createGeoRenderer({
      loadLibrary: async () => mockLeaflet(),
      stylesheetUrl: false,
      tileUrl: false,
      threeDStylesheetUrl: false,
      loadThreeDLibrary: async () => threeD.library,
    }).render(node, result('10'));
    await flush();
    threeD.events.get('error')?.({ error: new Error('WebGL failed') });
    await flush();
    expect(node.textContent).toContain('Could not load');
    expect(threeD.map.remove).toHaveBeenCalledTimes(1);
    expect(node.querySelector<HTMLElement>('.ldforge-geo-3d')?.hidden).toBe(
      true,
    );
    node.querySelector<HTMLButtonElement>('[data-geo-mode="normal"]')?.click();
    await flush();
    expect(node.querySelector('section')?.getAttribute('aria-busy')).toBe(
      'false',
    );
    if (typeof cleanup === 'function') cleanup();
  });
});
