/**
 * Capture the neighborhood map frame (streets basemap + home + numbered pins).
 * Ownership layers stay off — parcel is shown via boundary + home icon only.
 */
import * as turf from '@turf/turf';
import { captureMapStackToPngDataUrl } from '../mapExportCapture';
import { buildNeighborhoodPrintElements } from './buildNeighborhoodPrintElements';

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitMapIdle(map) {
  if (!map) return;
  try {
    await Promise.race([
      new Promise((resolve) => {
        if (typeof map.once === 'function') map.once('idle', resolve);
        else resolve();
      }),
      sleep(1400),
    ]);
  } catch (_) {
    /* ignore */
  }
  await sleep(200);
}

function bboxFromSnapshotsAndAmenities(snapshots, amenities) {
  const pts = [];
  (snapshots || []).forEach((s) => {
    if (!s?.geometry) return;
    try {
      const b = turf.bbox(turf.feature(s.geometry));
      pts.push([b[0], b[1]], [b[2], b[3]]);
    } catch (_) {
      /* ignore */
    }
  });
  (amenities || []).forEach((a) => {
    if (Number.isFinite(a.lng) && Number.isFinite(a.lat)) pts.push([a.lng, a.lat]);
  });
  if (!pts.length) return null;
  try {
    return turf.bbox(turf.multiPoint(pts));
  } catch (_) {
    return null;
  }
}

function expandBbox(bbox, factor) {
  if (!bbox) return null;
  const [minX, minY, maxX, maxY] = bbox;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // Tiny floor so a single pin still has a visible frame — not a big empty ring.
  const halfW = Math.max((maxX - minX) / 2, 0.00035) * factor;
  const halfH = Math.max((maxY - minY) / 2, 0.00035) * factor;
  return [cx - halfW, cy - halfH, cx + halfW, cy + halfH];
}

function forceOwnershipLayersHidden(map) {
  if (!map || typeof map.getLayer !== 'function') return;
  ['regrid-parcels-layer', 'regrid-parcels-outline', 'regrid-parcels-line'].forEach((id) => {
    try {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    } catch (_) {
      /* ignore */
    }
  });
}

async function setBasemap(id) {
  try {
    if (typeof window.applyBasemapById === 'function') {
      window.applyBasemapById(id);
      await sleep(1200);
      await waitMapIdle(window.mapRef?.current || window.__mapRef?.current || null);
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * @returns {Promise<string>} PNG data URL of the map frame only
 */
export async function captureNeighborhoodMapFrame({
  map,
  snapshots,
  amenities,
  basemapId = 'streets-v11',
  onStatus,
} = {}) {
  if (!map) throw new Error('Map is not ready for neighborhood capture.');
  const report = typeof onStatus === 'function' ? onStatus : () => {};

  report('Framing home + amenities on Streets…');
  await setBasemap(basemapId);

  try {
    window.dispatchEvent(new CustomEvent('cv-force-print-parcels', { detail: { visible: false } }));
  } catch (_) {
    /* ignore */
  }

  forceOwnershipLayersHidden(map);

  const printElements = buildNeighborhoodPrintElements(snapshots, amenities, {
    forShare: false,
    zoom: typeof map.getZoom === 'function' ? map.getZoom() : 14.5,
  });

  // Fit parcel(s) + amenity pins tightly — small padding only for pin/label bleed.
  const rawBbox = bboxFromSnapshotsAndAmenities(snapshots, amenities);
  const bbox = expandBbox(rawBbox, 1.04);
  if (bbox) {
    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: 48, duration: 0, maxZoom: 16 }
    );
  }
  await waitMapIdle(map);
  forceOwnershipLayersHidden(map);
  await sleep(1100);

  // Rebuild pins at the *fitted* zoom so circle size matches the final frame.
  const fittedZoom = typeof map.getZoom === 'function' ? map.getZoom() : 14.5;
  const sizedElements = buildNeighborhoodPrintElements(snapshots, amenities, {
    forShare: false,
    zoom: fittedZoom,
  });

  if (typeof map.triggerRepaint === 'function') map.triggerRepaint();
  await sleep(300);

  report('Capturing neighborhood map…');
  return captureMapStackToPngDataUrl(map, {
    includeNotesOverlay: false,
    preferOffscreen: false,
    printElements: sizedElements,
    basemapId,
  });
}
