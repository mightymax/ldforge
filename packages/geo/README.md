# @ldforge/geo

Optional LDForge map renderer for WGS84 WKT points, lines and polygons, including their Multi variants and polygon holes. Leaflet JavaScript and CSS are loaded from pinned external URLs only when the Map tab opens. Neither is bundled or installed as a runtime dependency.

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

Supported WKT: `POINT`, `LINESTRING`, `POLYGON`, `MULTIPOINT`, `MULTILINESTRING`, `MULTIPOLYGON`, case insensitive. Bare WKT and the GeoSPARQL `<http://www.opengis.net/def/crs/OGC/1.3/CRS84>` prefix are accepted. Other CRSs, SRIDs, dimensions, EMPTY and geometry collections are rejected. Reproject other coordinate systems before returning results. Geometry validation checks finite geographic coordinates, minimum line/ring lengths and ring closure; it does not validate polygon topology.

Choose **Normal**, **Grouped**, or **Heatmap** in the map's display selector. Grouped clusters nearby points, displays counts and zooms into a cluster when clicked. Heatmap shows point density (one equal-weight observation per point). MultiPoint geometries contribute their individual points. Lines and polygons remain visible in every mode; they are not converted to centroids or heat values. With no points, both alternative modes display the original shapes without downloading an extra library.

Use `# view=geo; geo-mode=grouped` or `geo-mode=heatmap` to choose the initial mode. `mode` supplies a host default. Invalid query mode values fall back to Normal. Switching modes preserves the map position.

Options:

- `mode`: initial `normal` (default), `grouped`, or `heatmap`; the query directive takes precedence.
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

See the [full guide](https://github.com/mightymax/ldforge/blob/main/docs/renderers.md#geo) for a live Wikidata query. LDForge is EUPL-1.2; Leaflet is independently BSD-2-Clause licensed and map tiles/data have their own terms.
