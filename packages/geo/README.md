# @ldforge/geo

Optional LDForge map renderer for WGS84 WKT points, lines and polygons, including their Multi variants and polygon holes. Optional `geometryHeight` bindings extrude polygons in 3D using lazily loaded MapLibre GL JS. Leaflet JavaScript and CSS are loaded from pinned external URLs only when the Map tab opens. Neither is bundled or installed as a runtime dependency.

```ts
import { createGeoRenderer } from '@ldforge/geo';
// Add to the renderers passed to createEditor():
const renderers = [createGeoRenderer()];
```

Return a literal `?geometry` containing two-dimensional WKT in longitude/latitude order, and optional `?geometryLabel` for plain-text popups. The leading comment `# view=geo; geo-title=My map` selects the map. Existing queries returning `?geometry`, including GeoSPARQL `geo:asWKT`, work without renaming. Invalid or missing bindings report their row; no rows are silently discarded. Empty results do not load external assets.

```sparql
# view=geo; geo-title=Points, lines and polygons
SELECT ?geometryLabel ?geometry WHERE {
  VALUES (?geometryLabel ?geometry) {
    ("Point" "POINT(4.9 52.37)")
    ("Line" "LINESTRING(4.88 52.36,4.92 52.38)")
    ("Area" "POLYGON((4.86 52.35,4.89 52.35,4.89 52.38,4.86 52.35))")
  }
}
```

## Popup bindings

All of these bindings are optional; features still render without them in 2D or 3D:

| Binding           | Content                                                                        |
| ----------------- | ------------------------------------------------------------------------------ |
| `?geometryLabel`  | Plain-text title, falling back to the row number.                              |
| `?geometryHeight` | Nonnegative numeric height in meters for polygon extrusion.                    |
| `?geoImage`       | Absolute HTTP(S) image URL, either a URI or a literal.                         |
| `?geoDescription` | Plain-text description. Line breaks are preserved.                             |
| `?geoLink`        | Absolute HTTP(S) URL, either a URI or a literal; links the label in a new tab. |

Images are limited to the popup width and 160 px high; failed images are removed.
Links use `noopener noreferrer`. Only absolute HTTP(S) image/link URLs are accepted;
invalid URLs are omitted without dropping the geometry. Labels and descriptions
are text, never HTML. Individual point popups retain these fields in Grouped mode;
cluster bubbles show their count. The castles demo queries Wikidata directly for
castles in North Holland with coordinates and an image, without OPTIONAL, and links each
label to its Wikidata item. Only castles with an image appear.

Supported WKT: `POINT`, `LINESTRING`, `POLYGON`, `MULTIPOINT`, `MULTILINESTRING`, `MULTIPOLYGON`, case insensitive. Bare WKT and the GeoSPARQL `<http://www.opengis.net/def/crs/OGC/1.3/CRS84>` prefix are accepted. Other CRSs, SRIDs, dimensions, EMPTY and geometry collections are rejected. Reproject other coordinate systems before returning results. Geometry validation checks finite geographic coordinates, minimum line/ring lengths and ring closure; it does not validate polygon topology.

Choose **Normal**, **Grouped**, **Heatmap**, or **3D** using the compact map display buttons. Grouped clusters nearby points, displays counts and zooms into a cluster when clicked. Heatmap shows point density (one equal-weight observation per point). MultiPoint geometries contribute their individual points. Lines and polygons remain visible in every mode; they are not converted to centroids or heat values. With no points, both alternative modes display the original shapes without downloading an extra library.

Use `# view=geo; mode=grouped` or `mode=heatmap` to choose the initial mode. `mode` supplies a host default. `geo-mode` remains supported as an alias; `mode` takes precedence when both are supplied. Invalid query mode values fall back to Normal. Switching between Leaflet modes preserves the map position. Entering 3D fits the query geometry with a tilted camera; returning to 2D restores the Leaflet view.

## 3D buildings

Return optional `?geometryHeight` as a finite, nonnegative numeric literal in
**meters**. Polygon and MultiPolygon geometries are extruded from ground level;
polygon holes remain open. Points and lines stay visible in 3D without extrusion.
Missing heights render polygons flat. Invalid bound heights report the row and do
not silently drop features. Positive polygon heights select 3D automatically unless
a host option or query directive chooses another mode. Use `# view=geo; mode=3d`
to explicitly activate it. The underlying WKT remains two-dimensional WGS84.

MapLibre GL JS 6.18.0 JavaScript and CSS are downloaded only when 3D is selected,
never for ordinary Leaflet modes or the Table tab. WebGL is required. If it is
unavailable or assets fail to load, the retry action and the 2D mode buttons remain
available. A single height creates a building volume, not a detailed roof/model.
Click a feature for its plain-text label and height. Use the navigation control or
right-drag to rotate/tilt. A Map data section also exposes the height in meters.

Options:

- `threeDLibraryUrl`: default `https://cdn.jsdelivr.net/npm/maplibre-gl@6.18.0/dist/maplibre-gl.mjs`.
- `threeDStylesheetUrl`: matching `dist/maplibre-gl.css`; set `false` if the host provides it.
- `loadThreeDLibrary`: custom lazy loader overriding `threeDLibraryUrl`; return a module implementing the exported `ThreeDLibrary` structural interface.
- `tileUrl` and `tileAttribution` apply to both 2D and 3D. MapLibre uses a raster basemap plus a local GeoJSON source; no API key is needed with the default OSM tiles.
- MapLibre is BSD-3-Clause licensed and remains an optional external asset. The root development dependency supplies its real library to browser tests; it is not a runtime dependency of `@ldforge/geo`.

For a live example, select **Paleis het Loo (3D)** in the demo's Examples menu.

## Configuration

Options:

- `mode`: initial `normal`, `grouped`, `heatmap`, or `3d`; the query directive takes precedence. With no configured/directive mode, positive polygon heights select 3D, otherwise Normal.
- `clusterLibraryUrl`: default `https://cdn.jsdelivr.net/npm/supercluster@8.0.1/+esm`.
- `heatLibraryUrl`: default `https://cdn.jsdelivr.net/npm/simpleheat@0.4.0/+esm`.
- `loadClusterLibrary`, `loadHeatLibrary`: custom lazy loaders overriding their respective URLs. Modules must have the default constructor/factory described by the exported structural types. These libraries load only when the corresponding mode is selected. Supercluster is ISC licensed; simpleheat is BSD-2-Clause licensed.

- `libraryUrl`: HTTP(S) ESM module, default `https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm`.
- `loadLibrary`: custom lazy loader returning a Leaflet module (named exports or default). Overrides `libraryUrl`.
- `stylesheetUrl`: CSS URL, default `https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css`. Set `false` when the host already supplies Leaflet CSS. A custom JavaScript loader does not override CSS.
- `tileUrl`: basemap template, default `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Set `false` to display geometry without basemap requests.
- `tileAttribution`: trusted host-supplied attribution HTML for a custom tile provider. Default credits OpenStreetMap contributors.

For self-hosting, supply your own library/CSS URLs and tile provider. A loader such as `loadLibrary: () => import('leaflet')` (install Leaflet in the host) produces a local lazy chunk; the default external URL keeps Leaflet out of build output entirely. Configure CSP for external scripts and styles from jsDelivr and images from the chosen tile provider. Map navigation requests tiles only while the map is active. Respect your provider's usage policy; the default OSM tiles are intended for ordinary interactive viewing, not bulk/offline downloads.

Maps are removed on cleanup, pending library completions are ignored after disposal, and failed loads can be retried. An expandable text representation remains available while loading or after failure. Labels use DOM text nodes, never HTML. Library and tile URLs are host configuration and cannot be changed through query comments.

See the [full guide](https://github.com/mightymax/ldforge/blob/main/docs/renderers.md#geo) for live Wikidata castles and OpenStreetMap 3D building queries. LDForge is EUPL-1.2; Leaflet is independently BSD-2-Clause licensed and map tiles/data have their own terms.
