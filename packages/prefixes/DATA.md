# Catalog data

The compact catalog contains the existing 32 common namespace mappings. The extended catalog contains 3,623 mappings imported from the user-supplied `/tmp/prefixes.json` snapshot on 2026-11-13. Neither catalog contains vocabulary labels or descriptions.

The source snapshot required these syntactic repairs:

- Decode HTML entities in the four malformed `da`, `imr`, `iev`, and `vwdms` rows (`&quot;` and `&amp;`).
- Remove an accidental space between the URI scheme colon and `//` for `da`, `imr`, `iev`, and `vwdms`.

No mappings were discarded, merged with compact defaults, or otherwise rewritten. Source order is preserved. Do not treat the extended catalog as a superset with identical bindings: for example, compact `geo` identifies WGS84, while extended `geo` identifies GeoSPARQL. Compact `schema` uses HTTPS; extended `schema` uses HTTP. Namespace identifiers are preserved exactly after the documented syntax repairs.

The catalogs are bundled snapshots, not a live registry. Selecting a namespace does not fetch it or establish that it is authoritative, reachable, or suitable for a particular endpoint. Project-specific choices can override mappings through editor configuration.
