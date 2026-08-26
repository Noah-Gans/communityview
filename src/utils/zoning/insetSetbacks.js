import * as turf from '@turf/turf';

function angularDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Classify an outward normal bearing (0=N, 90=E, 180=S, 270=W) into yard type.
 */
export function classifyOutwardNormal(outwardBearing, primaryStreetBearing = 180, secondaryStreetBearing = null) {
  const norm = ((outwardBearing % 360) + 360) % 360;
  const primary = ((primaryStreetBearing % 360) + 360) % 360;
  const rear = (primary + 180) % 360;
  if (angularDistance(norm, primary) <= 45) return 'primaryStreet';
  if (
    secondaryStreetBearing != null &&
    angularDistance(norm, ((secondaryStreetBearing % 360) + 360) % 360) <= 45
  ) {
    return 'secondaryStreet';
  }
  if (angularDistance(norm, rear) <= 45) return 'rear';
  return 'side';
}

function ringIsClockwise(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += (x2 - x1) * (y2 + y1);
  }
  return sum > 0;
}

function lineIntersection(a1, a2, b1, b2) {
  const [x1, y1] = a1;
  const [x2, y2] = a2;
  const [x3, y3] = b1;
  const [x4, y4] = b2;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-12) return null;
  const px =
    ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den;
  const py =
    ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den;
  return [px, py];
}

function localProjection(parcelFeature) {
  const center = turf.centroid(parcelFeature);
  const [clon, clat] = center.geometry.coordinates;
  const metersPerDegLat =
    turf.distance([clon, clat], [clon, clat + 0.01], { units: 'meters' }) / 0.01;
  const metersPerDegLon =
    turf.distance([clon, clat], [clon + 0.01, clat], { units: 'meters' }) / 0.01;
  return {
    clon,
    clat,
    toLocal: ([lon, lat]) => [(lon - clon) * metersPerDegLon, (lat - clat) * metersPerDegLat],
    toLonLat: ([x, y]) => [clon + x / metersPerDegLon, clat + y / metersPerDegLat],
  };
}

function getExteriorRing(parcelFeature) {
  const g = parcelFeature?.geometry;
  if (!g) return null;
  let ring;
  if (g.type === 'Polygon') ring = g.coordinates?.[0];
  else if (g.type === 'MultiPolygon') ring = g.coordinates?.[0]?.[0];
  if (!ring || ring.length < 4) return null;
  const out = ring.map((c) => [c[0], c[1]]);
  if (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1]) {
    out.push(out[0]);
  }
  return out;
}

/**
 * Build edge descriptors with robust outward normals (point-in-polygon tested).
 */
export function analyzeParcelEdges(parcelFeature) {
  const ring = getExteriorRing(parcelFeature);
  if (!ring) return { edges: [], error: 'Invalid polygon ring' };
  const { toLocal, toLonLat } = localProjection(parcelFeature);
  const local = ring.map(toLocal);
  const clockwise = ringIsClockwise(local);
  const edges = [];

  for (let i = 0; i < local.length - 1; i += 1) {
    const a = local[i];
    const b = local[i + 1];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const lenM = Math.hypot(ex, ey) || 1e-9;
    let nx = clockwise ? -ey / lenM : ey / lenM;
    let ny = clockwise ? ex / lenM : -ex / lenM;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

    // Flip if a short outward probe lands inside the parcel.
    const probe = toLonLat([mid[0] + nx * 1.0, mid[1] + ny * 1.0]);
    if (turf.booleanPointInPolygon(turf.point(probe), parcelFeature)) {
      nx = -nx;
      ny = -ny;
    }

    const outwardBearing = ((Math.atan2(nx, ny) * 180) / Math.PI + 360) % 360;
    edges.push({
      index: i,
      a,
      b,
      mid,
      nx,
      ny,
      lenM,
      lenFt: lenM / 0.3048,
      outwardBearing,
      midLonLat: toLonLat(mid),
      outwardProbeLonLat: toLonLat([mid[0] + nx * 8, mid[1] + ny * 8]),
    });
  }

  return { edges, toLocal, toLonLat, local };
}

/**
 * Detect primary street bearing from Mapbox road line layers near outward edge probes.
 * @returns {number|null} bearing degrees, or null if no roads found
 */
export function detectPrimaryStreetBearingFromMap(map, parcelFeature) {
  if (!map) return null;
  if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return null;
  let style;
  try {
    style = map.getStyle?.();
  } catch {
    return null;
  }
  const roadLayerIds = (style?.layers || [])
    .filter(
      (l) =>
        l.type === 'line' &&
        /road|street|bridge|motorway|trunk|primary|secondary|tertiary|residential|service/i.test(
          l.id
        )
    )
    .map((l) => l.id);
  if (!roadLayerIds.length) return null;

  const { edges } = analyzeParcelEdges(parcelFeature);
  if (!edges.length) return null;

  let best = null;
  for (const edge of edges) {
    const [lon, lat] = edge.outwardProbeLonLat;
    // ~40ft search around the outward probe
    const pad = 0.00012;
    let hits = [];
    try {
      hits = map.queryRenderedFeatures(
        [
          map.project([lon - pad, lat - pad]),
          map.project([lon + pad, lat + pad]),
        ],
        { layers: roadLayerIds }
      );
    } catch {
      continue;
    }
    if (!hits.length) continue;
    const score = hits.length * 10 + (60 - Math.min(edge.lenFt, 60));
    if (!best || score > best.score) {
      best = { bearing: edge.outwardBearing, score, index: edge.index };
    }
  }
  return best ? best.bearing : null;
}

/**
 * Heuristic when roads aren't available: prefer a shorter edge as street frontage.
 * If two short edges are similar, prefer the one closest to a geocode/front hint point.
 */
export function detectPrimaryStreetBearingHeuristic(parcelFeature, frontHintLonLat = null) {
  const { edges } = analyzeParcelEdges(parcelFeature);
  if (!edges.length) return 180;

  const minLen = Math.min(...edges.map((e) => e.lenFt));
  const shortEdges = edges.filter((e) => e.lenFt <= minLen * 1.25);

  if (frontHintLonLat) {
    let closest = shortEdges[0] || edges[0];
    let bestD = Infinity;
    for (const e of shortEdges) {
      const d = turf.distance(turf.point(e.midLonLat), turf.point(frontHintLonLat), {
        units: 'feet',
      });
      if (d < bestD) {
        bestD = d;
        closest = e;
      }
    }
    return closest.outwardBearing;
  }

  // Prefer southernmost short-edge midpoint (common for E-W streets in Jackson).
  const bySouth = [...shortEdges].sort((a, b) => a.midLonLat[1] - b.midLonLat[1]);
  return bySouth[0]?.outwardBearing ?? edges[0].outwardBearing;
}

/**
 * Inset a parcel polygon by primary/side/rear setbacks (feet).
 * Distances are applied in a local meters frame and verified along each edge normal.
 *
 * @returns {{
 *   envelope: object|null,
 *   edgeClassifications: object[],
 *   primaryStreetBearing: number,
 *   dimensionFeatures: object[],
 *   error?: string
 * }}
 */
export function insetParcelBySetbacks(
  parcelFeature,
  setbacksFt,
  primaryStreetBearing = 180,
  options = {}
) {
  if (!parcelFeature?.geometry) {
    return {
      envelope: null,
      edgeClassifications: [],
      primaryStreetBearing,
      dimensionFeatures: [],
      error: 'Missing parcel geometry',
    };
  }

  const {
    primaryStreet = 0,
    secondaryStreet = primaryStreet,
    side = 0,
    rear = 0,
  } = setbacksFt || {};
  const setbackFor = { primaryStreet, secondaryStreet, side, rear };
  const secondaryStreetBearing = options.secondaryStreetBearing ?? null;

  const analyzed = analyzeParcelEdges(parcelFeature);
  if (analyzed.error) {
    return {
      envelope: null,
      edgeClassifications: [],
      primaryStreetBearing,
      dimensionFeatures: [],
      error: analyzed.error,
    };
  }

  const { edges, toLonLat } = analyzed;
  const edgeClassifications = [];
  const offsetLines = [];

  for (const edge of edges) {
    const kind = classifyOutwardNormal(
      edge.outwardBearing,
      primaryStreetBearing,
      secondaryStreetBearing
    );
    const insetFt = setbackFor[kind] ?? side;
    const insetM = insetFt * 0.3048;
    edgeClassifications.push({
      index: edge.index,
      kind,
      insetFt,
      outwardBearing: Math.round(edge.outwardBearing),
      lengthFt: Math.round(edge.lenFt * 10) / 10,
    });
    offsetLines.push({
      edge,
      insetFt,
      insetM,
      kind,
      a: [edge.a[0] - edge.nx * insetM, edge.a[1] - edge.ny * insetM],
      b: [edge.b[0] - edge.nx * insetM, edge.b[1] - edge.ny * insetM],
    });
  }

  const newLocal = [];
  for (let i = 0; i < offsetLines.length; i += 1) {
    const e1 = offsetLines[i];
    const e2 = offsetLines[(i + 1) % offsetLines.length];
    const hit = lineIntersection(e1.a, e1.b, e2.a, e2.b);
    if (!hit) {
      return {
        envelope: null,
        edgeClassifications,
        primaryStreetBearing,
        dimensionFeatures: [],
        error: 'Setback inset failed (edge intersection)',
      };
    }
    newLocal.push(hit);
  }
  newLocal.push(newLocal[0]);

  let envelope;
  try {
    envelope = turf.polygon([newLocal.map(toLonLat)], {
      kind: 'primaryBuildingEnvelope',
      setbacksFt: { primaryStreet, secondaryStreet, side, rear },
      primaryStreetBearing,
    });
    if (!turf.area(envelope)) {
      return {
        envelope: null,
        edgeClassifications,
        primaryStreetBearing,
        dimensionFeatures: [],
        error: 'Envelope has no area',
      };
    }
  } catch (err) {
    return {
      envelope: null,
      edgeClassifications,
      primaryStreetBearing,
      dimensionFeatures: [],
      error: err?.message || 'Failed to build envelope polygon',
    };
  }

  // Verify measured setback along each outward→inward normal and build dimension labels.
  const dimensionFeatures = [];
  const envelopeLine = turf.polygonToLine(envelope);

  offsetLines.forEach((ol, i) => {
    const { edge, insetFt, insetM, kind } = ol;
    const start = edge.midLonLat;
    const inwardEnd = toLonLat([
      edge.mid[0] - edge.nx * insetM * 2.5,
      edge.mid[1] - edge.ny * insetM * 2.5,
    ]);
    const ray = turf.lineString([start, inwardEnd]);
    let measuredFt = insetFt;
    try {
      const hits = turf.lineIntersect(ray, envelopeLine);
      if (hits.features.length) {
        measuredFt =
          Math.round(
            turf.distance(turf.point(start), hits.features[0], { units: 'feet' }) * 10
          ) / 10;
      }
    } catch {
      /* keep nominal */
    }
    edgeClassifications[i].measuredFt = measuredFt;

    const labelAt = toLonLat([
      edge.mid[0] - edge.nx * (insetM * 0.5),
      edge.mid[1] - edge.ny * (insetM * 0.5),
    ]);
    const tickEnd = toLonLat([
      edge.mid[0] - edge.nx * insetM,
      edge.mid[1] - edge.ny * insetM,
    ]);

    dimensionFeatures.push(
      turf.lineString([start, tickEnd], {
        kind,
        insetFt,
        measuredFt,
        label: `${measuredFt}'`,
      })
    );
    dimensionFeatures.push(
      turf.point(labelAt, {
        kind,
        insetFt,
        measuredFt,
        label: `${Math.round(measuredFt)}' ${kind === 'primaryStreet' ? 'front' : kind === 'secondaryStreet' ? '2nd' : kind}`,
      })
    );
  });

  return {
    envelope,
    edgeClassifications,
    primaryStreetBearing,
    dimensionFeatures,
  };
}
