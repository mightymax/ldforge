import type { QueryResult } from '@ldforge/core';

export type Position = [number, number];
export type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'LineString' | 'MultiPoint'; coordinates: Position[] }
  | { type: 'Polygon' | 'MultiLineString'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };
export interface GeoFeature {
  type: 'Feature';
  geometry: Geometry;
  properties: {
    label: string;
    height?: number;
    image?: string;
    description?: string;
    link?: string;
    count?: number;
    expansionZoom?: number;
  };
}
export class GeoDataError extends Error {
  constructor(
    readonly row: number,
    readonly field: 'geometry' | 'geometryHeight' = 'geometry',
  ) {
    super(
      field === 'geometryHeight'
        ? `Invalid geometryHeight at row ${row}.`
        : `Invalid WGS84 WKT geometry at row ${row}.`,
    );
  }
}

/** Strict two-dimensional WKT, longitude first. No projection is guessed. */
export function parseWkt(input: string): Geometry {
  const source = input
    .trim()
    .replace(
      /^<http:\/\/www\.opengis\.net\/def\/crs\/OGC\/1\.3\/CRS84>\s+/,
      '',
    );
  const match =
    /^(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON)\s*(\(.*\))$/is.exec(
      source,
    );
  if (!match?.[1] || !match[2]) throw new Error('Unsupported WKT or CRS.');
  const rawTokens = [...match[2].matchAll(/[(),]|[^\s(),]+/g)];
  const tokens = rawTokens.map((token) => token[0]);
  let cursor = 0;
  function take(expected: string): void {
    if (tokens[cursor++] !== expected) throw new Error('Invalid WKT.');
  }
  function position(): Position {
    const values = [tokens[cursor++], tokens[cursor++]];
    if (
      values.some(
        (value) =>
          !value || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value),
      )
    )
      throw new Error('Invalid position.');
    const x = Number(values[0]);
    const y = Number(values[1]);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      Math.abs(x) > 180 ||
      Math.abs(y) > 90
    )
      throw new Error('Invalid WGS84 position.');
    return [x, y];
  }
  function list<T>(read: () => T): T[] {
    take('(');
    const items = [read()];
    while (tokens[cursor] === ',') {
      cursor++;
      items.push(read());
    }
    take(')');
    return items;
  }
  function line(): Position[] {
    const points = list(position);
    if (points.length < 2) throw new Error('Line needs two positions.');
    return points;
  }
  function ring(): Position[] {
    const points = line();
    if (
      points.length < 4 ||
      points[0]?.[0] !== points.at(-1)?.[0] ||
      points[0]?.[1] !== points.at(-1)?.[1]
    )
      throw new Error('Ring must close.');
    return points;
  }
  let geometry: Geometry;
  switch (match[1].toUpperCase()) {
    case 'POINT': {
      take('(');
      const coordinates = position();
      take(')');
      geometry = { type: 'Point', coordinates };
      break;
    }
    case 'LINESTRING':
      geometry = { type: 'LineString', coordinates: line() };
      break;
    case 'POLYGON':
      geometry = { type: 'Polygon', coordinates: list(ring) };
      break;
    case 'MULTIPOINT':
      geometry = {
        type: 'MultiPoint',
        coordinates: list(() => {
          if (tokens[cursor] !== '(') return position();
          take('(');
          const point = position();
          take(')');
          return point;
        }),
      };
      break;
    case 'MULTILINESTRING':
      geometry = { type: 'MultiLineString', coordinates: list(line) };
      break;
    default:
      geometry = { type: 'MultiPolygon', coordinates: list(() => list(ring)) };
  }
  if (cursor !== tokens.length) throw new Error('Trailing WKT data.');
  return geometry;
}

export function buildGeoFeatures(result: QueryResult): GeoFeature[] {
  if (result.kind !== 'bindings') return [];
  return result.bindings.map((row, index) => {
    try {
      const term = row.geometry;
      if (!term || !['literal', 'typed-literal'].includes(term.type))
        throw new Error('Missing geometry.');
      const heightTerm = row.geometryHeight;
      let height: number | undefined;
      if (heightTerm) {
        if (
          !['literal', 'typed-literal'].includes(heightTerm.type) ||
          !/^[+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(
            heightTerm.value.trim(),
          )
        )
          throw new GeoDataError(index + 1, 'geometryHeight');
        height = Number(heightTerm.value);
        if (!Number.isFinite(height) || height < 0)
          throw new GeoDataError(index + 1, 'geometryHeight');
      }
      return {
        type: 'Feature',
        geometry: parseWkt(term.value),
        properties: {
          label: row.geometryLabel?.value ?? `#${index + 1}`,
          ...(height === undefined ? {} : { height }),
          ...(row.geoImage?.value ? { image: row.geoImage.value } : {}),
          ...(row.geoDescription?.value
            ? { description: row.geoDescription.value }
            : {}),
          ...(row.geoLink?.value ? { link: row.geoLink.value } : {}),
        },
      };
    } catch (error) {
      if (error instanceof GeoDataError) throw error;
      throw new GeoDataError(index + 1);
    }
  });
}
