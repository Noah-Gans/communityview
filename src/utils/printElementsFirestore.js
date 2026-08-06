/**
 * Firestore cannot store arrays whose elements are arrays (GeoJSON rings/lines).
 * We persist coordinate pairs as { lng, lat } and normalize back to [lng, lat] in memory.
 */

import {
  normalizePhotoEntry,
  sanitizePhotoGalleryForFirestore,
} from './mapPhotoStorage';

function isNumericPair(arr) {
  return (
    Array.isArray(arr) &&
    arr.length >= 2 &&
    typeof arr[0] === 'number' &&
    typeof arr[1] === 'number' &&
    Number.isFinite(arr[0]) &&
    Number.isFinite(arr[1])
  );
}

function pairToFirestore(p) {
  if (!p) return null;
  if (typeof p === 'object' && !Array.isArray(p) && Number.isFinite(p.lng) && Number.isFinite(p.lat)) {
    return { lng: p.lng, lat: p.lat };
  }
  if (isNumericPair(p)) {
    return { lng: p[0], lat: p[1] };
  }
  return null;
}

function lngLatObjToPair(o) {
  if (!o) return null;
  if (Array.isArray(o) && isNumericPair(o)) {
    return [o[0], o[1]];
  }
  if (typeof o === 'object' && !Array.isArray(o) && Number.isFinite(o.lng) && Number.isFinite(o.lat)) {
    return [o.lng, o.lat];
  }
  return null;
}

export function sanitizeGeometryForFirestore(geom) {
  if (!geom || typeof geom !== 'object') return geom;
  const { type, coordinates } = geom;
  if (type === 'Point' && Array.isArray(coordinates) && coordinates.length >= 2) {
    // Flat number array is Firestore-safe (not nested arrays).
    return {
      type: 'Point',
      coordinates: [Number(coordinates[0]), Number(coordinates[1])],
    };
  }
  if (
    type === 'Point' &&
    coordinates &&
    typeof coordinates === 'object' &&
    !Array.isArray(coordinates) &&
    Number.isFinite(coordinates.lng) &&
    Number.isFinite(coordinates.lat)
  ) {
    return {
      type: 'Point',
      coordinates: [Number(coordinates.lng), Number(coordinates.lat)],
    };
  }
  if (type === 'LineString' && Array.isArray(coordinates)) {
    const pts = coordinates.map(pairToFirestore).filter(Boolean);
    return { type: 'LineString', coordinates: pts };
  }
  if (type === 'Polygon' && Array.isArray(coordinates)) {
    // Firestore forbids "array of arrays"; each ring is stored as a map { points: [{lng,lat}, ...] }.
    const rings = coordinates
      .map((ring) => {
        if (ring && typeof ring === 'object' && !Array.isArray(ring) && Array.isArray(ring.points)) {
          const pts = ring.points.map(pairToFirestore).filter(Boolean);
          return pts.length >= 3 ? { points: pts } : null;
        }
        if (!Array.isArray(ring)) return null;
        const pts = ring.map(pairToFirestore).filter(Boolean);
        if (pts.length < 3) return null;
        return { points: pts };
      })
      .filter(Boolean);
    return { type: 'Polygon', coordinates: rings };
  }
  if (type === 'MultiPolygon' && Array.isArray(coordinates)) {
    const polygons = coordinates
      .map((poly) => {
        if (!poly) return null;
        // Already { rings: [...] }
        if (typeof poly === 'object' && !Array.isArray(poly) && Array.isArray(poly.rings)) {
          const rings = poly.rings
            .map((ring) => {
              if (ring && typeof ring === 'object' && !Array.isArray(ring) && Array.isArray(ring.points)) {
                const pts = ring.points.map(pairToFirestore).filter(Boolean);
                return pts.length >= 3 ? { points: pts } : null;
              }
              return null;
            })
            .filter(Boolean);
          return rings.length ? { rings } : null;
        }
        if (!Array.isArray(poly)) return null;
        const rings = poly
          .map((ring) => {
            if (!Array.isArray(ring)) return null;
            const pts = ring.map(pairToFirestore).filter(Boolean);
            if (pts.length < 3) return null;
            return { points: pts };
          })
          .filter(Boolean);
        return rings.length ? { rings } : null;
      })
      .filter(Boolean);
    return { type: 'MultiPolygon', coordinates: polygons };
  }
  return geom;
}

export function normalizeGeometryFromFirestore(geom) {
  if (!geom || typeof geom !== 'object') return geom;
  const { type, coordinates } = geom;
  if (type === 'Point' && coordinates && typeof coordinates === 'object' && !Array.isArray(coordinates)) {
    if (Number.isFinite(coordinates.lng) && Number.isFinite(coordinates.lat)) {
      return { type: 'Point', coordinates: [coordinates.lng, coordinates.lat] };
    }
  }
  if (type === 'Point' && Array.isArray(coordinates) && coordinates.length >= 2) {
    return { type: 'Point', coordinates: [Number(coordinates[0]), Number(coordinates[1])] };
  }
  if (type === 'LineString' && Array.isArray(coordinates) && coordinates.length) {
    const first = coordinates[0];
    if (first && typeof first === 'object' && !Array.isArray(first) && Number.isFinite(first.lng)) {
      const pairs = coordinates.map(lngLatObjToPair).filter(Boolean);
      return { type: 'LineString', coordinates: pairs };
    }
  }
  if (type === 'Polygon' && Array.isArray(coordinates) && coordinates.length) {
    const ring0 = coordinates[0];
    if (ring0 && typeof ring0 === 'object' && !Array.isArray(ring0) && Array.isArray(ring0.points)) {
      return {
        type: 'Polygon',
        coordinates: coordinates.map((r) =>
          r && Array.isArray(r.points) ? r.points.map(lngLatObjToPair).filter(Boolean) : []
        ),
      };
    }
    // In-memory GeoJSON: each ring is an array of [lng, lat] pairs
    if (ring0?.length && Array.isArray(ring0[0])) {
      return geom;
    }
  }
  if (type === 'MultiPolygon' && Array.isArray(coordinates) && coordinates.length) {
    const poly0 = coordinates[0];
    if (poly0 && typeof poly0 === 'object' && !Array.isArray(poly0) && Array.isArray(poly0.rings)) {
      return {
        type: 'MultiPolygon',
        coordinates: coordinates.map((poly) =>
          poly && Array.isArray(poly.rings)
            ? poly.rings.map((r) =>
                r && Array.isArray(r.points) ? r.points.map(lngLatObjToPair).filter(Boolean) : []
              )
            : []
        ),
      };
    }
    // In-memory GeoJSON MultiPolygon
    if (Array.isArray(poly0) && Array.isArray(poly0[0])) {
      return geom;
    }
  }
  return geom;
}

/**
 * Sanitize listing parcel Feature refs (same nested-array rules as print geometry).
 */
export function sanitizeListingParcelRefsForFirestore(refs) {
  if (!Array.isArray(refs)) return [];
  return refs
    .map((f) => {
      if (!f?.geometry) return null;
      const p = f.properties || {};
      return {
        type: 'Feature',
        geometry: sanitizeGeometryForFirestore(f.geometry),
        properties: {
          ll_uuid: p.ll_uuid || null,
          path: p.path || null,
          owner: p.owner || p.owner2 || null,
          address: p.address || p.situs_address || p.physaddr || null,
          parcelnumb: p.parcelnumb || p.county_parcel_id || p.apn || null,
          apn: p.apn || p.parcelnumb || null,
          zip: p.zip || p.situs_zip || p.mail_zip || null,
        },
      };
    })
    .filter(Boolean)
    .slice(0, 40);
}

export function normalizeListingParcelRefsFromFirestore(refs) {
  if (!Array.isArray(refs)) return [];
  return refs
    .map((f) => {
      if (!f?.geometry) return null;
      return {
        type: 'Feature',
        geometry: normalizeGeometryFromFirestore(f.geometry),
        properties: f.properties && typeof f.properties === 'object' ? { ...f.properties } : {},
      };
    })
    .filter(Boolean);
}

export function sanitizePrintElementsForFirestore(printElements) {
  if (!Array.isArray(printElements)) return [];
  return printElements.map((el) => {
    if (!el || typeof el !== 'object') return el;
    const next = { ...el };
    if (next.geometry) {
      next.geometry = sanitizeGeometryForFirestore(next.geometry);
    }
    if (Array.isArray(next.photoGallery) && next.photoGallery.length) {
      next.photoGallery = sanitizePhotoGalleryForFirestore(next.photoGallery);
      delete next.photoDataUrl;
    } else if (typeof next.photoDataUrl === 'string' && next.photoDataUrl.trim()) {
      const legacy = normalizePhotoEntry(next.photoDataUrl);
      if (legacy && !legacy.url.startsWith('data:')) {
        next.photoGallery = sanitizePhotoGalleryForFirestore([legacy]);
      }
      delete next.photoDataUrl;
    }
    return next;
  });
}

export function normalizePrintElementsFromFirestore(printElements) {
  if (!Array.isArray(printElements)) return [];
  return printElements.map((el) => {
    if (!el || typeof el !== 'object') return el;
    const next = {
      ...el,
      geometry: el.geometry ? normalizeGeometryFromFirestore(el.geometry) : el.geometry,
    };
    const gallery = sanitizePhotoGalleryForFirestore(
      Array.isArray(el.photoGallery) && el.photoGallery.length
        ? el.photoGallery
        : el.photoDataUrl
          ? [el.photoDataUrl]
          : []
    );
    if (gallery.length) {
      next.photoGallery = gallery;
    }
    delete next.photoDataUrl;
    return next;
  });
}
