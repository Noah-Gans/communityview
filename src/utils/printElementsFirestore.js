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
    return {
      type: 'Point',
      coordinates: [Number(coordinates[0]), Number(coordinates[1])],
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
        if (!Array.isArray(ring)) return null;
        const pts = ring.map(pairToFirestore).filter(Boolean);
        if (pts.length < 3) return null;
        return { points: pts };
      })
      .filter(Boolean);
    return { type: 'Polygon', coordinates: rings };
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
  return geom;
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
