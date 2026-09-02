import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as turf from '@turf/turf';
import {
  applyRegridParcelOutlineForBasemap,
  getRegridParcelOutlineColorForBasemap,
} from '../components/map/mapStyles';
import { buildMapLabelDisplayText, labelUsesGeoOffset } from '../pages/print/mapLabelUtils';
import { getPrintPixelScale } from '../pages/map/mapPrintHitTest';
import { regridStyleBasemapRef } from '../pages/map/regridParcelMapLayer';
import {
  arrowHeadPolygon,
  segmentIndexTowardTip,
  transmissionTickSegments,
} from '../pages/print/polylineDecorationUtils';
import {
  loadFirmLogoDrawableForPdf,
  loadProfilePhotoDrawableForPdf,
} from './profileBrandingImages';

function waitFrames(count) {
  return new Promise((resolve) => {
    let n = 0;
    const tick = () => {
      n += 1;
      if (n >= count) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function waitMs(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitForMapIdleOrTimeout(map, timeoutMs = 1200) {
  return new Promise((resolve) => {
    if (!map || typeof map.once !== 'function') {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      map.once('idle', finish);
    } catch (_) {
      finish();
      return;
    }
    window.setTimeout(finish, timeoutMs);
  });
}

function isCanvasLikelyBlank(canvas) {
  if (!canvas) return true;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const { width, height } = canvas;
  if (!width || !height) return true;
  const sampleCols = 6;
  const sampleRows = 4;
  let nonTransparent = 0;
  for (let yi = 0; yi < sampleRows; yi += 1) {
    for (let xi = 0; xi < sampleCols; xi += 1) {
      const x = Math.min(width - 1, Math.floor((xi / (sampleCols - 1 || 1)) * (width - 1)));
      const y = Math.min(height - 1, Math.floor((yi / (sampleRows - 1 || 1)) * (height - 1)));
      const px = ctx.getImageData(x, y, 1, 1).data;
      if (px[3] > 3) nonTransparent += 1;
    }
  }
  return nonTransparent < 4;
}

const REGRID_PARCELS_OUTLINE_LAYER_ID = 'regrid-parcels-outline';

function restorePaintSnapshot(map, snapshot) {
  if (!map || !Array.isArray(snapshot)) return;
  for (const entry of snapshot) {
    if (!entry?.layerId || !entry.key) continue;
    try {
      map.setPaintProperty(entry.layerId, entry.key, entry.value);
    } catch (_) {
      // ignore
    }
  }
}

/**
 * Regrid parcel outlines interpolate to thin strokes at low zoom; crop/fitBounds for PDF also
 * often lowers zoom — combined, ownership looks like faint orange hairlines in the export.
 */
function computeParcelLineBoostFactor(sourceScale = 1, zoom = 15) {
  const s = Number(sourceScale);
  const safe = Number.isFinite(s) ? Math.max(1, Math.min(4, s)) : 1;
  const z = Number.isFinite(zoom) ? zoom : 15;
  const zoomPenalty = z < 14.5 ? (14.5 - z) * 3.6 : 0;
  return Math.min(24, 14 + 2.1 * Math.max(0, safe - 1) + zoomPenalty);
}

const PARCEL_EXPORT_MIN_LINE_WIDTH_EXPR = [
  'interpolate',
  ['linear'],
  ['zoom'],
  10,
  2.4,
  12,
  3.0,
  14,
  3.6,
  16,
  4.2,
];

/**
 * Temporarily widens `regrid-parcels-outline` and reduces line simplification for raster/PDF export
 * (thin strokes + heavy zoom-based simplify read as hairline / broken “streaks”).
 * @returns restore fn — must run after capture when mutating the live map.
 */
function applyParcelOutlineBoostForPdf(map, factor = 2.75) {
  const layerId = REGRID_PARCELS_OUTLINE_LAYER_ID;
  const snapshot = [];
  if (!map || typeof map.getLayer !== 'function' || !map.getLayer(layerId)) {
    return () => {};
  }
  try {
    const vis = map.getLayoutProperty(layerId, 'visibility');
    if (vis === 'none') return () => {};
  } catch (_) {
    // assume visible
  }

  const lineWidthKey = 'line-width';
  let val;
  try {
    val = map.getPaintProperty(layerId, lineWidthKey);
  } catch (_) {
    return () => {};
  }
  if (val === undefined || val === null) return () => {};
  snapshot.push({ layerId, key: lineWidthKey, value: val });

  const simplifyKey = 'line-simplify';
  try {
    const simp = map.getPaintProperty(layerId, simplifyKey);
    if (simp !== undefined && simp !== null) {
      snapshot.push({ layerId, key: simplifyKey, value: simp });
    }
  } catch (_) {
    // property may be absent on some GL versions
  }

  try {
    const f = Math.max(1.35, Math.min(24, Number(factor) || 2.75));
    if (typeof val === 'number' && Number.isFinite(val)) {
      map.setPaintProperty(layerId, lineWidthKey, Math.max(val * f, 3.2));
    } else {
      map.setPaintProperty(layerId, lineWidthKey, [
        'max',
        ['*', f, val],
        PARCEL_EXPORT_MIN_LINE_WIDTH_EXPR,
      ]);
    }
    try {
      if (snapshot.some((e) => e.key === simplifyKey)) {
        map.setPaintProperty(layerId, simplifyKey, 0);
      }
    } catch (_) {
      // ignore
    }
    map.triggerRepaint?.();
  } catch (err) {
    console.warn('mapExportCapture: parcel outline boost failed', err);
    restorePaintSnapshot(map, snapshot);
    return () => {};
  }

  return () => restorePaintSnapshot(map, snapshot);
}

function parseDashArray(val) {
  if (!val || typeof val !== 'string') return [];
  return val
    .trim()
    .split(/\s+/)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Dash lengths must use the same scale as stroke width (scale × overlayScale).
 * Round caps extend into gaps; enforce a minimum clear gap so dots do not chain solid.
 */
function scaleDashPatternForExport(rawDash, lineWidth, paintScale, lineCap = 'round') {
  const parts = parseDashArray(rawDash);
  if (!parts.length) return [];
  const lw = Math.max(1, lineWidth);
  const ps = Math.max(1, Number(paintScale) || 1);
  const cap = lineCap === 'square' ? 'square' : lineCap === 'butt' ? 'butt' : 'round';
  return parts.map((n, i) => {
    const scaled = Math.max(1, n * ps);
    if (i % 2 === 1) {
      if (cap === 'round') {
        return Math.max(scaled, lw * 1.12);
      }
      if (cap === 'square') {
        return Math.max(scaled, lw * 0.35);
      }
    }
    return scaled;
  });
}

function resolveLayerLegendColor(layerKey, fallbackColor, basemapId) {
  if (layerKey === 'ownership') {
    return getRegridParcelOutlineColorForBasemap(basemapId);
  }
  return fallbackColor || '#94a3b8';
}

function syncParcelOutlineColorForExport(map, basemapId) {
  if (!map) return;
  const id = String(basemapId || regridStyleBasemapRef.current || '').trim();
  applyRegridParcelOutlineForBasemap(map, id);
  map.triggerRepaint?.();
}

function projectLinePointsForExport(map, coords, sx, sy) {
  return coords
    .map((c) => {
      try {
        const p = map.project(c);
        return [p.x * sx, p.y * sy];
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function strokeOpenPathForExport(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
}

function exportStrokeWidth(el, scale, overlayScale) {
  return Math.max(1, (Number(el.strokeWidth) || 3) * scale * overlayScale);
}

/**
 * html2canvas often rasterizes SVG <image> + <filter> (feComposite tint) as empty/white.
 * Clone pass: drop filters and resolve relative /logos_for_print URLs so icons paint like the legend.
 */
function prepareClonedNotesOverlayForExport(clonedDoc) {
  if (!clonedDoc || typeof window === 'undefined') return;
  const overlay = clonedDoc.getElementById('notes-overlay');
  if (!overlay) return;
  const origin = window.location.origin || '';
  overlay.querySelectorAll('svg image').forEach((img) => {
    img.removeAttribute('filter');
    const href =
      img.getAttribute('href') ||
      img.getAttribute('xlink:href') ||
      img.getAttributeNS?.('http://www.w3.org/1999/xlink', 'href');
    if (href && href.startsWith('/') && origin) {
      const abs = `${origin}${href}`;
      img.setAttribute('href', abs);
      img.removeAttribute('xlink:href');
    }
  });
  overlay.querySelectorAll('svg defs filter').forEach((f) => f.remove());
  // Geo vectors + labels are painted on the export canvas; hide DOM copies to avoid double strokes.
  overlay.querySelectorAll('.print-map-feature-label').forEach((n) => {
    n.style.visibility = 'hidden';
  });
  overlay.querySelectorAll('svg polyline, svg polygon, svg line').forEach((n) => {
    n.style.visibility = 'hidden';
  });
}

export function sanitizeMapExportBasename(name) {
  const s = String(name || 'map')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim();
  return (s || 'map').slice(0, 80);
}

/**
 * Raster export: Mapbox WebGL canvas (full internal resolution) + optional DOM overlay (#notes-overlay).
 * Avoids browser print layout bugs (Firefox, Chrome clip).
 */
export async function captureMapStackToPngDataUrl(
  map,
  {
    includeNotesOverlay = true,
    cropRectCss = null,
    printElements = [],
    preferOffscreen = false,
    targetPixelWidth = null,
    targetPixelHeight = null,
    overlayScale = 1,
    basemapId = '',
    paintTextNotes = true,
    textNotes = null,
  } = {}
) {
  if (!map || typeof map.getCanvas !== 'function') {
    throw new Error('Map is not ready yet.');
  }
  const notesForExport =
    Array.isArray(textNotes) && textNotes.length
      ? textNotes
      : collectTextNotesForExport(map, printElements);
  const hasTextNotes = notesForExport.some((el) => el && isTextNoteElement(el));
  await waitForExportFonts();

  if (preferOffscreen && !hasTextNotes) {
    try {
      const hasNonGeo = (printElements || []).some(
        (el) => el && !el.hiddenOnMap && (!el.geometry || !el.geometry.type)
      );
      if (!hasNonGeo) {
        const offscreenData = await captureOffscreenHighResMapToDataUrl(map, {
          printElements,
          cropRectCss,
          targetPixelWidth,
          targetPixelHeight,
          overlayScale,
          basemapId,
          paintTextNotes,
          textNotes: notesForExport,
        });
        if (offscreenData) return offscreenData;
      }
    } catch (err) {
      console.warn('offscreen export fallback to live capture', err);
    }
  }

  const liveCanvas = map.getCanvas();
  const liveRect = liveCanvas.getBoundingClientRect();
  const liveSx = liveCanvas.width / Math.max(1, liveRect.width || liveCanvas.width);
  const liveSy = liveCanvas.height / Math.max(1, liveRect.height || liveCanvas.height);
  const liveSourceScale = Math.max(1, Math.min(3, (liveSx + liveSy) / 2));
  let restoreParcelOutline = () => {};
  try {
    syncParcelOutlineColorForExport(map, basemapId);
    restoreParcelOutline = applyParcelOutlineBoostForPdf(
      map,
      computeParcelLineBoostFactor(liveSourceScale, map.getZoom?.())
    );

    const mapCanvas = map.getCanvas();
    const w = mapCanvas.width;
    const h = mapCanvas.height;
    if (!w || !h) {
      throw new Error('Map canvas has no size.');
    }

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) {
      throw new Error('Could not create export canvas.');
    }

    // Browser tab wake / style swap can race canvas capture; retry until map pixels are present.
    let captured = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      map.resize();
      if (typeof map.triggerRepaint === 'function') map.triggerRepaint();
      await waitFrames(2 + attempt);
      await waitForMapIdleOrTimeout(map, 900 + attempt * 400);
      ctx.clearRect(0, 0, out.width, out.height);
      ctx.drawImage(mapCanvas, 0, 0);
      if (!isCanvasLikelyBlank(out)) {
        captured = true;
        break;
      }
      await waitMs(120 + attempt * 80);
    }
    if (!captured) {
      // Last best effort draw before continuing; legend/footer still render even if basemap fails.
      ctx.clearRect(0, 0, out.width, out.height);
      ctx.drawImage(mapCanvas, 0, 0);
    }

    if (includeNotesOverlay) {
      const overlay = document.getElementById('notes-overlay');
      const rect = mapCanvas.getBoundingClientRect();
      if (overlay && rect.width >= 4 && rect.height >= 4) {
        try {
          const scale = Math.min(3, w / rect.width);
          const shot = await html2canvas(overlay, {
            backgroundColor: null,
            scale,
            width: Math.ceil(rect.width),
            height: Math.ceil(rect.height),
            useCORS: true,
            logging: false,
            onclone: (clonedDoc) => prepareClonedNotesOverlayForExport(clonedDoc),
          });
          ctx.drawImage(shot, 0, 0, w, h);
        } catch (err) {
          console.warn('mapExportCapture: overlay skipped', err);
        }
      }
    }
    const destW = out.width;
    const destH = out.height;
    await drawPointShapeLogosForExport(ctx, map, mapCanvas, printElements, overlayScale, destW, destH);
    drawVectorElementsForExport(ctx, map, mapCanvas, printElements, overlayScale, destW, destH);
    drawMapLabelsForExport(ctx, map, mapCanvas, printElements, overlayScale, destW, destH);
    if (paintTextNotes) {
      drawTextNotesForExport(
        ctx,
        map,
        mapCanvas,
        notesForExport,
        overlayScale,
        destW,
        destH,
        null,
        cropRectCss
      );
    }

    let finalCanvas = out;
    if (
      cropRectCss &&
      Number.isFinite(cropRectCss.x) &&
      Number.isFinite(cropRectCss.y) &&
      Number.isFinite(cropRectCss.width) &&
      Number.isFinite(cropRectCss.height)
    ) {
      const rect = mapCanvas.getBoundingClientRect();
      const sx = out.width / Math.max(1, rect.width);
      const sy = out.height / Math.max(1, rect.height);
      const cx = Math.max(0, Math.round(cropRectCss.x * sx));
      const cy = Math.max(0, Math.round(cropRectCss.y * sy));
      const cw = Math.max(8, Math.round(cropRectCss.width * sx));
      const ch = Math.max(8, Math.round(cropRectCss.height * sy));
      const clippedW = Math.min(cw, out.width - cx);
      const clippedH = Math.min(ch, out.height - cy);
      const crop = document.createElement('canvas');
      crop.width = Math.max(8, clippedW);
      crop.height = Math.max(8, clippedH);
      const cropCtx = crop.getContext('2d');
      if (cropCtx) {
        cropCtx.drawImage(out, cx, cy, clippedW, clippedH, 0, 0, crop.width, crop.height);
        finalCanvas = crop;
      }
    }

    try {
      return finalCanvas.toDataURL('image/png');
    } catch (err) {
      const msg =
        err && (err.name === 'SecurityError' || String(err.message || '').includes('tainted'))
          ? 'The map image is blocked for export (cross-origin tiles). Try another basemap or a Chromium-based browser.'
          : err?.message || 'Could not encode map as PNG.';
      throw new Error(msg);
    }
  } finally {
    restoreParcelOutline();
  }
}

async function captureOffscreenHighResMapToDataUrl(
  sourceMap,
  {
    printElements = [],
    cropRectCss = null,
    targetPixelWidth = null,
    targetPixelHeight = null,
    overlayScale = 1,
    basemapId = '',
    paintTextNotes = true,
    textNotes = null,
  } = {}
) {
  const srcCanvas = sourceMap.getCanvas();
  const srcRect = srcCanvas.getBoundingClientRect();
  const w = Math.max(800, Math.round(Number(targetPixelWidth) || srcCanvas.width || 1920));
  const h = Math.max(600, Math.round(Number(targetPixelHeight) || srcCanvas.height || 1200));
  const sourceScaleX = w / Math.max(1, srcRect.width || srcCanvas.width || w);
  const sourceScaleY = h / Math.max(1, srcRect.height || srcCanvas.height || h);
  const sourceScale = Math.max(1, Math.min(3, (sourceScaleX + sourceScaleY) / 2));
  // Icon/label sizing only — positions come from project() + dest/layout scale.
  const exportOverlayScale = overlayScale * Math.pow(sourceScale, 0.55);
  const holder = document.createElement('div');
  holder.style.position = 'fixed';
  holder.style.left = '-100000px';
  holder.style.top = '-100000px';
  holder.style.width = `${w}px`;
  holder.style.height = `${h}px`;
  holder.style.opacity = '0';
  holder.style.pointerEvents = 'none';
  document.body.appendChild(holder);

  let offMap = null;
  let restoreParcelOutline = () => {};
  try {
    const style = sourceMap.getStyle?.();
    const center = sourceMap.getCenter?.();
    const zoom = sourceMap.getZoom?.();
    const bearing = sourceMap.getBearing?.() || 0;
    const pitch = sourceMap.getPitch?.() || 0;
    const MapCtor = sourceMap.constructor;
    offMap = new MapCtor({
      container: holder,
      style,
      center: center ? [center.lng, center.lat] : undefined,
      zoom: Number.isFinite(zoom) ? zoom : undefined,
      bearing,
      pitch,
      preserveDrawingBuffer: true,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      pixelRatio: 1,
    });
    offMap.resize();
    await waitForMapIdleOrTimeout(offMap, 7000);

    const hasCrop =
      cropRectCss &&
      Number.isFinite(cropRectCss.x) &&
      Number.isFinite(cropRectCss.y) &&
      Number.isFinite(cropRectCss.width) &&
      Number.isFinite(cropRectCss.height) &&
      srcRect.width > 0 &&
      srcRect.height > 0;

    if (hasCrop) {
      const p1 = sourceMap.unproject([cropRectCss.x, cropRectCss.y]);
      const p2 = sourceMap.unproject([
        cropRectCss.x + cropRectCss.width,
        cropRectCss.y + cropRectCss.height,
      ]);
      offMap.fitBounds(
        [
          [Math.min(p1.lng, p2.lng), Math.min(p1.lat, p2.lat)],
          [Math.max(p1.lng, p2.lng), Math.max(p1.lat, p2.lat)],
        ],
        { padding: 0, duration: 0, maxZoom: 22 }
      );
      await waitForMapIdleOrTimeout(offMap, 4500);
    } else {
      fitOffscreenMapToSourceViewport(sourceMap, offMap, srcRect);
      await waitForMapIdleOrTimeout(offMap, 4500);
    }

    syncParcelOutlineColorForExport(offMap, basemapId);
    restoreParcelOutline = applyParcelOutlineBoostForPdf(
      offMap,
      computeParcelLineBoostFactor(sourceScale, offMap.getZoom?.())
    );

    holder.style.width = `${w}px`;
    holder.style.height = `${h}px`;
    offMap.resize();
    offMap.triggerRepaint?.();
    await waitFrames(2);
    await waitForMapIdleOrTimeout(offMap, 1200);

    const offCanvas = offMap.getCanvas();
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('offscreen canvas context unavailable');
    ctx.drawImage(offCanvas, 0, 0, w, h);
    const layoutFallback = { width: w, height: h };
    drawVectorElementsForExport(
      ctx,
      offMap,
      offCanvas,
      printElements,
      exportOverlayScale,
      w,
      h,
      layoutFallback
    );
    await drawPointShapeLogosForExport(
      ctx,
      offMap,
      offCanvas,
      printElements,
      exportOverlayScale,
      w,
      h,
      layoutFallback
    );
    drawMapLabelsForExport(
      ctx,
      offMap,
      offCanvas,
      printElements,
      exportOverlayScale,
      w,
      h,
      layoutFallback,
      { width: srcRect.width, height: srcRect.height }
    );
    if (paintTextNotes) {
      drawTextNotesForExport(
        ctx,
        offMap,
        offCanvas,
        textNotes && textNotes.length ? textNotes : printElements,
        exportOverlayScale,
        w,
        h,
        layoutFallback,
        cropRectCss
      );
    }
    return out.toDataURL('image/png');
  } finally {
    restoreParcelOutline();
    try {
      offMap?.remove?.();
    } catch (_) {
      // ignore
    }
    holder.remove();
  }
}

/**
 * Mapbox `project()` is in map-container CSS pixels. When the export bitmap is
 * stretched (offscreen `drawImage(canvas, 0, 0, destW, destH)`), scale to dest size.
 */
function getExportMapPixelScale(mapCanvas, destWidth, destHeight, layoutFallback = null) {
  const rect = mapCanvas.getBoundingClientRect();
  // Offscreen/hidden maps often report a stale or partial layout rect; trust export layout when given.
  let layoutW =
    layoutFallback && Number(layoutFallback.width) > 4
      ? layoutFallback.width
      : rect.width;
  let layoutH =
    layoutFallback && Number(layoutFallback.height) > 4
      ? layoutFallback.height
      : rect.height;
  if (!layoutW || layoutW < 4) layoutW = mapCanvas.width;
  if (!layoutH || layoutH < 4) layoutH = mapCanvas.height;
  const dw = Number(destWidth) > 0 ? destWidth : mapCanvas.width;
  const dh = Number(destHeight) > 0 ? destHeight : mapCanvas.height;
  return {
    sx: dw / layoutW,
    sy: dh / layoutH,
    scale: (dw / layoutW + dh / layoutH) / 2,
  };
}

/** Fit offscreen map to the same geographic window as the on-screen map (handles aspect ratio changes). */
function fitOffscreenMapToSourceViewport(sourceMap, offMap, srcRect) {
  if (!sourceMap || !offMap || !srcRect?.width || !srcRect?.height) return;
  try {
    const p0 = sourceMap.unproject([0, 0]);
    const p1 = sourceMap.unproject([srcRect.width, srcRect.height]);
    offMap.fitBounds(
      [
        [Math.min(p0.lng, p1.lng), Math.min(p0.lat, p1.lat)],
        [Math.max(p0.lng, p1.lng), Math.max(p0.lat, p1.lat)],
      ],
      { padding: 0, duration: 0, maxZoom: 22 }
    );
  } catch (_) {
    // ignore
  }
}

function drawVectorElementsForExport(
  ctx,
  map,
  mapCanvas,
  printElements,
  overlayScale = 1,
  destWidth = null,
  destHeight = null,
  layoutFallback = null
) {
  if (!ctx || !map || !mapCanvas || !Array.isArray(printElements)) return;
  const px = getExportMapPixelScale(
    mapCanvas,
    destWidth ?? ctx.canvas?.width,
    destHeight ?? ctx.canvas?.height,
    layoutFallback
  );
  if (!px) return;
  const { sx, sy, scale } = px;
  const paintScale = scale * overlayScale;
  for (const el of printElements) {
    if (!el || el.hiddenOnMap || !el.geometry) continue;
    if (el.type === 'polygon' && el.geometry.type === 'Polygon' && Array.isArray(el.geometry.coordinates?.[0])) {
      const ring = el.geometry.coordinates[0];
      if (ring.length < 3) continue;
      const pts = projectLinePointsForExport(map, ring, sx, sy);
      if (pts.length < 3) continue;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.fillOpacity ?? 0.25)));
      ctx.fillStyle = el.fill || '#10b981';
      ctx.fill();
      const polyStrokeW = exportStrokeWidth(el, scale, overlayScale);
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.strokeOpacity ?? 1)));
      ctx.strokeStyle = el.stroke || '#ffffff';
      ctx.lineWidth = polyStrokeW;
      const polyCap = el.strokeLinecap || 'round';
      const polyDash = scaleDashPatternForExport(el.lineDasharray, polyStrokeW, paintScale, polyCap);
      ctx.setLineDash(polyDash.length ? polyDash : []);
      ctx.lineCap = polyCap;
      ctx.lineJoin = el.strokeLinejoin || 'round';
      ctx.stroke();
      ctx.restore();
      continue;
    }
    if ((el.type === 'polyline' || el.type === 'arrow') && el.geometry.type === 'LineString' && Array.isArray(el.geometry.coordinates)) {
      const pts = projectLinePointsForExport(map, el.geometry.coordinates, sx, sy);
      if (pts.length < 2) continue;
      const strokeCol = el.stroke || (el.type === 'arrow' ? '#d97706' : '#2563eb');
      const sw = exportStrokeWidth(el, scale, overlayScale);
      const join = el.strokeLinejoin || 'round';
      const cap = el.strokeLinecap || 'round';
      const dash = scaleDashPatternForExport(el.lineDasharray, sw, paintScale, cap);

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.strokeOpacity ?? 1)));
      ctx.lineJoin = join;

      if (el.fenceOutlineStroke) {
        ctx.strokeStyle = el.fenceOutlineStroke;
        ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.fenceOutlineOpacity ?? 0.35)));
        ctx.lineWidth = Math.max(
          1,
          (Number(el.fenceOutlineWidth) || 5) * scale * overlayScale
        );
        ctx.setLineDash([]);
        ctx.lineCap = el.strokeLinecap || 'round';
        strokeOpenPathForExport(ctx, pts);
        ctx.stroke();
        ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.strokeOpacity ?? 1)));
      }

      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = sw;
      ctx.setLineDash(dash.length ? dash : []);
      ctx.lineCap = cap;
      strokeOpenPathForExport(ctx, pts);
      ctx.stroke();

      if (el.roadMarkingStroke) {
        const markingW = Math.max(
          1,
          (Number(el.roadMarkingWidth) || 2) * scale * overlayScale
        );
        const markingCap = el.roadMarkingLinecap || 'round';
        const markingDash = scaleDashPatternForExport(
          el.roadMarkingDasharray,
          markingW,
          paintScale,
          markingCap
        );
        ctx.strokeStyle = el.roadMarkingStroke;
        ctx.lineWidth = markingW;
        ctx.setLineDash(markingDash.length ? markingDash : []);
        ctx.lineCap = markingCap;
        strokeOpenPathForExport(ctx, pts);
        ctx.stroke();
      }

      if (el.transmissionTicks) {
        const tickSegs = transmissionTickSegments(pts, 20 * scale, 7 * scale);
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = Math.max(1, 1.25 * scale);
        ctx.setLineDash([]);
        tickSegs.forEach((t) => {
          ctx.beginPath();
          ctx.moveTo(t.x1, t.y1);
          ctx.lineTo(t.x2, t.y2);
          ctx.stroke();
        });
      }

      const headMode = el.type === 'arrow' ? 'end' : el.arrowHead || 'none';
      const showEndHead = headMode === 'end' || headMode === 'both';
      const showStartHead = headMode === 'both';
      if (showEndHead || showStartHead) {
        ctx.fillStyle = strokeCol;
        ctx.setLineDash([]);
        if (showEndHead) {
          const endSeg = segmentIndexTowardTip(pts, pts.length - 1);
          if (endSeg) {
            const poly = arrowHeadPolygon(endSeg.ax1, endSeg.ay1, endSeg.ax2, endSeg.ay2, sw);
            fillPolygonPoints(ctx, poly);
          }
        }
        if (showStartHead) {
          const startSeg = segmentIndexTowardTip(pts, 0);
          if (startSeg) {
            const poly = arrowHeadPolygon(
              startSeg.ax1,
              startSeg.ay1,
              startSeg.ax2,
              startSeg.ay2,
              sw
            );
            fillPolygonPoints(ctx, poly);
          }
        }
      }

      ctx.restore();
    }
  }
}

function fillPolygonPoints(ctx, pointsStr) {
  const pairs = String(pointsStr || '')
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number))
    .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pairs.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pairs[0][0], pairs[0][1]);
  for (let i = 1; i < pairs.length; i += 1) ctx.lineTo(pairs[i][0], pairs[i][1]);
  ctx.closePath();
  ctx.fill();
}

async function drawPointShapeLogosForExport(
  ctx,
  map,
  mapCanvas,
  printElements,
  overlayScale = 1,
  destWidth = null,
  destHeight = null,
  layoutFallback = null
) {
  if (!ctx || !mapCanvas || !map || !Array.isArray(printElements) || !printElements.length) return;
  const px = getExportMapPixelScale(
    mapCanvas,
    destWidth ?? ctx.canvas?.width,
    destHeight ?? ctx.canvas?.height,
    layoutFallback
  );
  if (!px) return;
  const { sx, sy, scale: avgScale } = px;
  const iconCache = new Map();

  for (const el of printElements) {
    if (!el || el.hiddenOnMap) continue;
    if (el.type !== 'shape' || el.geometry?.type !== 'Point') continue;
    const coords = el.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const file = POINT_ICON_FILE[el.svgKey];
    if (!file) continue;
    let projected;
    try {
      projected = map.project([coords[0], coords[1]]);
    } catch (_) {
      continue;
    }
    const px = projected?.x;
    const py = projected?.y;
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

    const sizeCss = Math.max(
      12,
      (Number(el.width) || 36) * 0.58 * overlayScale,
      (Number(el.height) || 36) * 0.58 * overlayScale
    );
    const size = Math.max(14, Math.round(sizeCss * avgScale));
    const cx = px * sx;
    const cy = py * sy;
    const x = Math.round(cx - size / 2);
    const y = Math.round(cy - size / 2);

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.fillOpacity ?? 1)));
    ctx.fillStyle = el.fill || '#ffffff';
    ctx.strokeStyle = el.stroke || '#0f172a';
    ctx.lineWidth = Math.max(
      1,
      Math.round((Number(el.strokeWidth) || 2) * avgScale * Math.max(1, overlayScale * 0.92))
    );
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 - Math.max(1, ctx.lineWidth / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.strokeOpacity ?? 1)));
    ctx.stroke();
    ctx.restore();

    const absUrl = `${window.location.origin}/logos_for_print/${file}`;
    let img = iconCache.get(absUrl);
    if (!img) {
      img = await loadImage(absUrl);
      iconCache.set(absUrl, img || null);
    }
    if (!img) continue;
    const pad = Math.max(2, Math.round(size * 0.23));
    const glyphW = size - pad * 2;
    const glyphH = size - pad * 2;
    const iconColor = el.iconColor || el.logoColor || null;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.iconOpacity ?? 1)));
    if (iconColor) {
      // Tint glyph (e.g. white house on dark amenity-map home disc).
      const tint = document.createElement('canvas');
      tint.width = Math.max(1, glyphW);
      tint.height = Math.max(1, glyphH);
      const tintCtx = tint.getContext('2d');
      if (tintCtx) {
        tintCtx.drawImage(img, 0, 0, glyphW, glyphH);
        tintCtx.globalCompositeOperation = 'source-in';
        tintCtx.fillStyle = iconColor;
        tintCtx.fillRect(0, 0, glyphW, glyphH);
        ctx.drawImage(tint, x + pad, y + pad, glyphW, glyphH);
      } else {
        ctx.drawImage(img, x + pad, y + pad, glyphW, glyphH);
      }
    } else {
      ctx.drawImage(img, x + pad, y + pad, glyphW, glyphH);
    }
    ctx.restore();
  }
}

/** Matches the live note textarea in DraggableNote so PDF wrapping breaks at the same words. */
const NOTE_FONT_STACK = 'Inter, system-ui, sans-serif';
/** Canvas fillText in a production build often has no loaded Inter face and draws empty glyphs. */
const NOTE_CANVAS_FONT_STACK = 'Arial, Helvetica, sans-serif';

function canvasSafeColor(value, fallback = '#111827') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return raw;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(raw)) {
    return raw;
  }
  return fallback;
}

async function waitForExportFonts() {
  try {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await Promise.race([document.fonts.ready, waitMs(800)]);
    }
  } catch (_) {
    /* canvas will fall back to Arial */
  }
}

function hexToRgba(hex, alpha = 1) {
  const raw = String(hex || '#ffffff').replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return `rgba(255,255,255,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function roundRectPath(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapCanvasParagraphs(ctx, text, maxWidth) {
  const paragraphs = String(text ?? '').split('\n');
  const lines = [];
  paragraphs.forEach((para) => {
    if (!para) {
      lines.push('');
      return;
    }
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
  });
  return lines;
}

function isTextNoteElement(el) {
  const t = String(el?.type || '').toLowerCase();
  return t === 'note' || t === 'text';
}

function getNoteLngLat(el, map, { allowScreenFallback = true } = {}) {
  const c = el?.geometry?.coordinates;
  if (Array.isArray(c) && c.length >= 2) {
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
  }
  if (c && typeof c === 'object' && !Array.isArray(c)) {
    const lng = Number(c.lng ?? c.lon ?? c.longitude);
    const lat = Number(c.lat ?? c.latitude);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
  }
  if (
    allowScreenFallback &&
    map &&
    Number.isFinite(Number(el?.x)) &&
    Number.isFinite(Number(el?.y))
  ) {
    const s = getPrintPixelScale(map);
    const w = (Number(el.width) || 220) * s;
    const h = (Number(el.height) || 120) * s;
    try {
      const ll = map.unproject([Number(el.x) + w / 2, Number(el.y) + h / 2]);
      if (ll && Number.isFinite(ll.lng) && Number.isFinite(ll.lat)) {
        return { lng: ll.lng, lat: ll.lat };
      }
    } catch (_) {
      // ignore
    }
  }
  return null;
}

function paintNoteBox(ctx, el, x, y, boxW, boxH, fontPx, pad) {
  const radius = Math.max(3, Math.min(boxW, boxH) * 0.06);
  const fillAlpha = Number.isFinite(Number(el.fillOpacity)) ? Number(el.fillOpacity) : 1;
  const strokeAlpha = Number.isFinite(Number(el.strokeOpacity)) ? Number(el.strokeOpacity) : 0.2;
  const strokeW = Math.max(1, Number(el.strokeWidth) || 1);
  const lineHeight = fontPx * 1.4;

  ctx.save();
  roundRectPath(ctx, x, y, boxW, boxH, radius);
  const fillRaw = String(el.fill || '#ffffff');
  const fillLooksTransparent =
    /transparent/i.test(fillRaw) || /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)/i.test(fillRaw);
  ctx.fillStyle = fillLooksTransparent
    ? '#ffffff'
    : /rgba?\(/i.test(fillRaw)
      ? fillRaw
      : hexToRgba(fillRaw, fillAlpha > 0 ? fillAlpha : 1);
  ctx.fill();
  if (strokeW > 0) {
    const strokeRaw = String(el.stroke || '#111827');
    ctx.strokeStyle = /rgba?\(/i.test(strokeRaw) ? strokeRaw : hexToRgba(strokeRaw, strokeAlpha);
    ctx.lineWidth = Math.max(1, strokeW);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.rect(x + pad, y + pad, Math.max(1, boxW - pad * 2), Math.max(1, boxH - pad * 2));
  ctx.clip();

  ctx.font = `${Math.round(fontPx)}px ${NOTE_CANVAS_FONT_STACK}`;
  ctx.fillStyle = canvasSafeColor(el.fontColor, '#111827');
  ctx.textBaseline = 'top';
  const align = el.textAlign || 'left';
  ctx.textAlign = align === 'center' || align === 'right' ? align : 'left';

  const textMaxW = Math.max(8, boxW - pad * 2);
  const body = el.text != null && String(el.text).length ? el.text : el.label || '';
  const lines = wrapCanvasParagraphs(ctx, body, textMaxW);
  const textH = Math.max(lineHeight, lines.length * lineHeight);
  const vAlign = el.textVerticalAlign || 'top';
  let textY = y + pad;
  if (vAlign === 'center') textY = y + (boxH - textH) / 2;
  else if (vAlign === 'bottom') textY = y + boxH - pad - textH;

  const textX =
    align === 'center' ? x + boxW / 2 : align === 'right' ? x + boxW - pad : x + pad;

  lines.forEach((line, i) => {
    ctx.fillText(line, textX, textY + i * lineHeight);
  });
  ctx.restore();
}

/** Snapshot Text notes from the live overlay so PDF capture does not depend on html2canvas/textarea. */
function collectTextNotesForExport(map, printElements = []) {
  const fromEls = (printElements || []).filter((el) => el && !el.hiddenOnMap && isTextNoteElement(el));
  const fromDom = [];
  if (typeof document !== 'undefined' && map && typeof map.getCanvas === 'function') {
    const overlay = document.getElementById('notes-overlay');
    const canvas = map.getCanvas();
    const canvasRect = canvas?.getBoundingClientRect?.();
    if (overlay && canvasRect && canvasRect.width >= 4 && canvasRect.height >= 4) {
      const seen = new Set();
      overlay.querySelectorAll('.print-note-wrapper, [data-print-note]').forEach((node) => {
        const host = node.closest('.print-shape-rnd') || node;
        if (seen.has(host)) return;
        seen.add(host);
        const box = host.getBoundingClientRect();
        if (box.width < 2 || box.height < 2) return;
        const cx = box.left + box.width / 2 - canvasRect.left;
        const cy = box.top + box.height / 2 - canvasRect.top;
        let ll;
        try {
          ll = map.unproject([cx, cy]);
        } catch (_) {
          return;
        }
        if (!ll || !Number.isFinite(ll.lng) || !Number.isFinite(ll.lat)) return;
        const ta = node.tagName === 'TEXTAREA' ? node : node.querySelector?.('textarea');
        const wrapCs = window.getComputedStyle(host);
        const taCs = ta ? window.getComputedStyle(ta) : wrapCs;
        fromDom.push({
          id: node.getAttribute?.('data-print-note') || null,
          lng: ll.lng,
          lat: ll.lat,
          text: ta ? String(ta.value ?? '') : String(node.textContent || ''),
          screenCssWidth: box.width,
          screenCssHeight: box.height,
          fill:
            wrapCs.backgroundColor && !/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0/.test(wrapCs.backgroundColor)
              ? wrapCs.backgroundColor
              : '#ffffff',
          fontColor: canvasSafeColor(taCs.color, '#111827'),
          fontSize: parseFloat(taCs.fontSize) || 14,
          fontFamily: NOTE_FONT_STACK,
          textAlign: taCs.textAlign || 'left',
        });
      });
    }
  }
  if (!fromEls.length) {
    return fromDom.map((d) => ({
      id: d.id,
      type: 'note',
      geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
      text: d.text,
      width: d.screenCssWidth,
      height: d.screenCssHeight,
      screenCssWidth: d.screenCssWidth,
      screenCssHeight: d.screenCssHeight,
      fill: d.fill,
      fillOpacity: 1,
      stroke: '#111827',
      strokeWidth: 1,
      strokeOpacity: 0.2,
      fontColor: canvasSafeColor(d.fontColor, '#111827'),
      fontSize: d.fontSize,
      fontFamily: d.fontFamily || NOTE_FONT_STACK,
      textAlign: d.textAlign,
      textVerticalAlign: 'top',
    }));
  }
  const domById = new Map();
  fromDom.forEach((d) => {
    if (d.id != null && d.id !== '') domById.set(String(d.id), d);
  });
  return fromEls.map((el) => {
    const match = el?.id != null ? domById.get(String(el.id)) || null : null;
    return {
      ...el,
      text: match?.text || el.text || el.label || '',
      screenCssWidth: match?.screenCssWidth,
      screenCssHeight: match?.screenCssHeight,
      fill: match?.fill || el.fill || '#ffffff',
      fontColor: canvasSafeColor(el.fontColor, canvasSafeColor(match?.fontColor, '#111827')),
      fontFamily: match?.fontFamily || el.fontFamily || NOTE_FONT_STACK,
    };
  });
}

/**
 * Paint Text (note) map elements onto a captured map bitmap (PNG / offscreen).
 * Positions use map.project() like icons. Size prefers the live overlay box so
 * offscreen fitBounds still matches what the editor showed.
 */
function drawTextNotesForExport(
  ctx,
  map,
  mapCanvas,
  printElements,
  overlayScale = 1,
  destWidth = null,
  destHeight = null,
  layoutFallback = null,
  cropRectCss = null
) {
  if (!ctx || !mapCanvas || !map || !Array.isArray(printElements) || !printElements.length) return;
  const px = getExportMapPixelScale(
    mapCanvas,
    destWidth ?? ctx.canvas?.width,
    destHeight ?? ctx.canvas?.height,
    layoutFallback
  );
  if (!px) return;
  const { sx, sy } = px;
  const destW = destWidth ?? ctx.canvas?.width ?? mapCanvas.width;
  const destH = destHeight ?? ctx.canvas?.height ?? mapCanvas.height;
  const cropW =
    cropRectCss && Number(cropRectCss.width) > 4 ? Number(cropRectCss.width) : destW / Math.max(0.0001, sx);
  const cropH =
    cropRectCss && Number(cropRectCss.height) > 4 ? Number(cropRectCss.height) : destH / Math.max(0.0001, sy);

  for (const el of printElements) {
    if (!el || el.hiddenOnMap || !isTextNoteElement(el)) continue;
    const ll = getNoteLngLat(el, map, { allowScreenFallback: !layoutFallback });
    if (!ll) continue;
    let projected;
    try {
      projected = map.project([ll.lng, ll.lat]);
    } catch (_) {
      continue;
    }
    const cx = projected?.x;
    const cy = projected?.y;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;

    const liveW = Number(el.screenCssWidth);
    const liveH = Number(el.screenCssHeight);
    const boxW =
      Number.isFinite(liveW) && liveW > 2
        ? Math.max(24, (liveW / cropW) * destW)
        : Math.max(48, (Number(el.width) || 220) * sx);
    const boxH =
      Number.isFinite(liveH) && liveH > 2
        ? Math.max(18, (liveH / cropH) * destH)
        : Math.max(32, (Number(el.height) || 120) * sy);
    const x = cx * sx - boxW / 2;
    const y = cy * sy - boxH / 2;
    const fontPx = Math.max(
      10,
      (Number(el.fontSize) || 14) * (boxW / Math.max(24, Number.isFinite(liveW) ? liveW : Number(el.width) || 220))
    );
    const pad = Math.max(4, 8 * (boxW / Math.max(24, Number.isFinite(liveW) ? liveW : 220)));
    paintNoteBox(ctx, el, x, y, boxW, boxH, fontPx, pad);
  }
}

/** Match `getElementAnchorLngLat` in Map.js so PDF labels land on the same anchor as the editor. */
function getElementAnchorLngLatForExport(el) {
  const g = el?.geometry;
  if (!g) return null;
  if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    const [lng, lat] = g.coordinates;
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
    return null;
  }
  if (g.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    const mid = g.coordinates[Math.floor(g.coordinates.length / 2)];
    if (Array.isArray(mid) && Number.isFinite(mid[0]) && Number.isFinite(mid[1])) {
      return { lng: mid[0], lat: mid[1] };
    }
    return null;
  }
  if (g.type === 'Polygon' && Array.isArray(g.coordinates?.[0]) && g.coordinates[0].length >= 4) {
    const ring = g.coordinates[0];
    try {
      const poly = turf.polygon([ring]);
      const c = turf.centerOfMass(poly);
      const [lng, lat] = c.geometry.coordinates;
      if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
    } catch (_) {
      /* fall through */
    }
    const closed =
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    const open = closed ? ring.slice(0, -1) : ring;
    if (open.length < 3) return null;
    const sum = open.reduce(
      (acc, p) => ({ lng: acc.lng + (Number(p?.[0]) || 0), lat: acc.lat + (Number(p?.[1]) || 0) }),
      { lng: 0, lat: 0 }
    );
    const lng = sum.lng / open.length;
    const lat = sum.lat / open.length;
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
  }
  return null;
}

function drawMapLabelsForExport(
  ctx,
  map,
  mapCanvas,
  printElements,
  overlayScale = 1,
  destWidth = null,
  destHeight = null,
  layoutFallback = null,
  sourceLayout = null
) {
  if (!ctx || !mapCanvas || !map || !Array.isArray(printElements) || !printElements.length) return;
  const dw = destWidth ?? ctx.canvas?.width;
  const dh = destHeight ?? ctx.canvas?.height;
  const px = getExportMapPixelScale(mapCanvas, dw, dh, layoutFallback);
  if (!px) return;
  const { sx, sy, scale } = px;
  const offsetScaleX =
    sourceLayout?.width > 4 && dw > 0 ? dw / sourceLayout.width : scale;
  const offsetScaleY =
    sourceLayout?.height > 4 && dh > 0 ? dh / sourceLayout.height : scale;

  printElements.forEach((el) => {
    if (!el || el.hiddenOnMap || !el.showLabelOnMap) return;
    const text = buildMapLabelDisplayText(el);
    if (!text || !String(text).trim()) return;
    const anchor = getElementAnchorLngLatForExport(el);
    if (!anchor) return;
    let lng = anchor.lng;
    let lat = anchor.lat;
    if (labelUsesGeoOffset(el)) {
      lng += Number(el.labelOffsetDLng) || 0;
      lat += Number(el.labelOffsetDLat) || 0;
    }
    let projected;
    try {
      projected = map.project([lng, lat]);
    } catch (_) {
      return;
    }
    if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return;
    const x =
      projected.x * sx +
      (labelUsesGeoOffset(el) ? 0 : (Number(el.labelOffsetX) || 0) * offsetScaleX);
    const y =
      projected.y * sy +
      (labelUsesGeoOffset(el) ? 0 : (Number(el.labelOffsetY) || 0) * offsetScaleY);
    const fontSize = Math.max(
      10,
      Math.round((Number(el.labelFontSize) || 11) * scale * overlayScale)
    );
    const lineHeight = Math.round(fontSize * 1.25);
    const lines = String(text).split('\n').filter(Boolean);
    if (!lines.length) return;

    ctx.save();
    ctx.font = `600 ${fontSize}px ${el.labelFontFamily || 'Inter, Arial, sans-serif'}`;
    const textW = Math.max(...lines.map((ln) => ctx.measureText(ln).width));
    const padX = Math.round(8 * scale);
    const padY = Math.round(4 * scale);
    const boxW = Math.round(textW + padX * 2);
    const boxH = Math.round(lines.length * lineHeight + padY * 2);
    const alignH = el.labelAlignH || 'center';
    const alignV = el.labelAlignV || 'top';

    let bx = x;
    let by = y;
    if (alignH === 'center') bx -= boxW / 2;
    else if (alignH === 'right') bx -= boxW;
    const topGap = Math.round(6 * scale);
    const bottomGap = Math.round(6 * scale);
    if (alignV === 'top') by -= boxH + topGap;
    else if (alignV === 'middle') by -= boxH / 2;
    else by += bottomGap;

    ctx.fillStyle = el.labelBackgroundColor || '#ffffff';
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = Math.max(1, Math.round(scale));
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, Math.max(3, Math.round(4 * scale)));
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = el.labelColor || '#111827';
    lines.forEach((ln, idx) => {
      const tx =
        alignH === 'left' ? bx + padX : alignH === 'right' ? bx + boxW - padX - ctx.measureText(ln).width : bx + (boxW - ctx.measureText(ln).width) / 2;
      const ty = by + padY + lineHeight * (idx + 0.82);
      ctx.fillText(ln, tx, ty);
    });
    ctx.restore();
  });
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Single-page landscape Letter PDF from a PNG data URL (image fitted with margins).
 */
export function savePngDataUrlAsLetterLandscapePdf(dataUrl, baseName) {
  const safe = sanitizeMapExportBasename(baseName);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 28;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxW = pageW - margin * 2;
        const maxH = pageH - margin * 2;
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (!iw || !ih) {
          reject(new Error('Invalid image for PDF.'));
          return;
        }
        const scale = Math.min(maxW / iw, maxH / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const x = (pageW - dw) / 2;
        const y = margin + (maxH - dh) / 2;
        pdf.addImage(dataUrl, 'PNG', x, y, dw, dh);
        pdf.save(`${safe}.pdf`);
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Could not decode image for PDF.'));
    img.src = dataUrl;
  });
}

const COMMUNITY_VIEW_WEBSITE_URL = 'https://communityview.ai';

const PAPER_INCHES = {
  letter: { w: 8.5, h: 11 },
  legal: { w: 8.5, h: 14 },
  tabloid: { w: 11, h: 17 },
  a4: { w: 8.27, h: 11.69 },
};

const SCALE_CANDIDATES_METERS = [
  20, 50, 100, 200, 500, 1000, 1609.344, 3218.688, 8046.72, 16093.44, 32186.88,
];

function pickScaleDistanceMeters(targetPx, metersPerPx) {
  if (!Number.isFinite(targetPx) || !Number.isFinite(metersPerPx) || metersPerPx <= 0) return null;
  let best = SCALE_CANDIDATES_METERS[0];
  let bestDiff = Infinity;
  SCALE_CANDIDATES_METERS.forEach((m) => {
    const px = m / metersPerPx;
    const diff = Math.abs(px - targetPx);
    if (diff < bestDiff) {
      best = m;
      bestDiff = diff;
    }
  });
  return best;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return '';
  if (meters >= 1609.344) {
    const mi = meters / 1609.344;
    return `${Number(mi.toFixed(mi >= 10 ? 0 : 1))} mi`;
  }
  if (meters >= 1000) {
    return `${Number((meters / 1000).toFixed(1))} km`;
  }
  return `${Math.round(meters)} m`;
}

const POINT_ICON_FILE = {
  bridgeWater: 'bridge-water.svg',
  cabin: 'cabin.svg',
  camera: 'camera.svg',
  farm: 'farm.svg',
  garageCar: 'garage-car.svg',
  hiking: 'hiking.svg',
  horseSaddle: 'horse-saddle.svg',
  houseChimney: 'house-chimney.svg',
  locationPinParking: 'location-pin-parking.svg',
  planeAlt: 'plane-alt.svg',
  school: 'school.svg',
  skiing: 'skiing.svg',
  skiingNordic: 'skiing-nordic.svg',
  swimmer: 'swimmer.svg',
  tablePicnic: 'table-picnic.svg',
  // Document / tour amenity markers (same logos as tour vicinity)
  shoppingCart: 'shopping-cart.png',
  gym: 'gym.svg',
  mugHotAlt: 'mug-hot-alt.svg',
  subway: 'subway.svg',
  tools: 'tools.svg',
};

async function loadImage(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const abs = raw.startsWith('http') || raw.startsWith('data:') || raw.startsWith('blob:')
    ? raw
    : `${window.location.origin}${raw.startsWith('/') ? raw : `/${raw}`}`;

  const loadFromObjectUrl = (objectUrl) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = objectUrl;
    });

  if (abs.startsWith('data:') || abs.startsWith('blob:')) {
    return loadFromObjectUrl(abs);
  }

  try {
    const res = await fetch(abs, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
    if (res.ok) {
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const img = await loadFromObjectUrl(objectUrl);
      URL.revokeObjectURL(objectUrl);
      if (img) return img;
    }
  } catch (_) {
    // fall through to Image() with crossOrigin
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = abs;
  });
}

function drawLegendLineIcon(ctx, iconX, iconCenterY, iconSize, stroke, strokeOpacity, options = {}) {
  const {
    lineWidth,
    dasharray = null,
    lineCap = 'round',
    halo = false,
  } = options;
  const lineY = iconCenterY;
  const lineW = Math.max(2, lineWidth);
  const cap = lineCap || 'round';
  const dash = scaleDashPatternForExport(dasharray, lineW, 1, cap);
  const alpha = Math.max(0, Math.min(1, Number(strokeOpacity ?? 1)));

  if (halo || isLightLegendColor(stroke)) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(15,23,42,0.45)';
    ctx.lineWidth = lineW + Math.max(1, lineW * 0.35);
    ctx.lineCap = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(iconX, lineY);
    ctx.lineTo(iconX + iconSize, lineY);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = stroke || '#2563eb';
  ctx.lineWidth = lineW;
  ctx.setLineDash(dash.length ? dash : []);
  ctx.lineCap = cap;
  ctx.beginPath();
  ctx.moveTo(iconX, lineY);
  ctx.lineTo(iconX + iconSize, lineY);
  ctx.stroke();
  ctx.restore();
}

function isLightLegendColor(color) {
  const c = String(color || '').trim().toLowerCase();
  return c === '#ffffff' || c === '#fff' || c === 'white';
}

function getLegendRowMetrics(dpiSafe, compactFooter) {
  const iconSize = Math.round(dpiSafe * 0.11);
  const iconSlotW = Math.round(dpiSafe * 0.24);
  const labelGap = Math.round(dpiSafe * 0.085);
  const bodyFontPx = Math.round(dpiSafe * 0.104);
  const rowStep = Math.max(
    Math.round(dpiSafe * (compactFooter ? 0.118 : 0.132)),
    iconSize + Math.round(dpiSafe * 0.05)
  );
  return { iconSize, iconSlotW, labelGap, bodyFontPx, rowStep };
}

function getLegendRowCenterY(topTextY, rowStep, rowInCol) {
  return topTextY + rowStep * rowInCol + rowStep / 2;
}

function mercatorMetersPerPixel(lat, zoom) {
  const latRad = (lat * Math.PI) / 180;
  return (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom);
}

/** Load a public/static image for PDF compositing (e.g. /logo.png). */
function loadPublicAssetImage(src) {
  return new Promise((resolve) => {
    const raw = String(src || '').trim();
    if (!raw) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = raw;
  });
}

function drawMapInsetPanel(ctx, x, y, w, h, dpiSafe) {
  const radius = Math.round(dpiSafe * 0.02);
  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.28)';
  ctx.lineWidth = Math.max(1, Math.round(dpiSafe / 260));
  ctx.stroke();
  ctx.restore();
}

/** Scale bar (left) + north arrow (right), anchored to map bottom-right corner. */
function drawMapScaleAndNorthOverlay(ctx, { mapX, mapY, drawW, drawH, map, dpiSafe, metersPerPdfPx }) {
  const pad = Math.round(dpiSafe * 0.042);
  const gap = Math.round(dpiSafe * 0.022);
  const northBox = Math.round(dpiSafe * 0.24);
  const scaleBoxH = northBox;
  const scaleBoxW = Math.round(dpiSafe * 0.62);

  const northOx = Math.round(mapX + drawW - pad - northBox);
  const northOy = Math.round(mapY + drawH - pad - northBox);
  const scaleOx = northOx - gap - scaleBoxW;
  const scaleOy = northOy;

  drawMapInsetPanel(ctx, northOx, northOy, northBox, northBox, dpiSafe);

  const bearing = Number(map.getBearing?.() || 0);
  const arrowSize = Math.round(dpiSafe * 0.07);
  const arrowCx = northOx + Math.round(northBox / 2);
  const arrowCy = northOy + Math.round(northBox / 2) + Math.round(dpiSafe * 0.012);

  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${Math.round(dpiSafe * 0.05)}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('N', arrowCx, arrowCy - arrowSize - Math.round(dpiSafe * 0.012));

  ctx.save();
  ctx.translate(arrowCx, arrowCy);
  ctx.rotate((-bearing * Math.PI) / 180);
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(0, -arrowSize);
  ctx.lineTo(Math.round(arrowSize * 0.4), Math.round(arrowSize * 0.72));
  ctx.lineTo(0, Math.round(arrowSize * 0.38));
  ctx.lineTo(Math.round(-arrowSize * 0.4), Math.round(arrowSize * 0.72));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.textAlign = 'left';

  drawMapInsetPanel(ctx, scaleOx, scaleOy, scaleBoxW, scaleBoxH, dpiSafe);

  const scaleInnerPad = Math.round(dpiSafe * 0.035);
  const scaleTargetPx = Math.round(dpiSafe * 0.5);
  const scaleMeters = pickScaleDistanceMeters(scaleTargetPx, metersPerPdfPx);
  const scalePx = scaleMeters && metersPerPdfPx ? scaleMeters / metersPerPdfPx : 0;
  const scaleMaxW = scaleBoxW - scaleInnerPad * 2;
  const scaleDrawPx = scalePx > 8 ? Math.min(scalePx, scaleMaxW) : 0;

  if (scaleDrawPx > 8) {
    const scaleX = scaleOx + Math.round((scaleBoxW - scaleDrawPx) / 2);
    const scaleY = scaleOy + Math.round(scaleBoxH * 0.62);
    const tickH = Math.round(dpiSafe * 0.024);
    const barW = Math.max(2, Math.round(dpiSafe / 130));

    ctx.fillStyle = '#0f172a';
    ctx.font = `600 ${Math.round(dpiSafe * 0.052)}px Inter, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(formatDistance(scaleMeters), scaleOx + scaleBoxW / 2, scaleOy + Math.round(scaleBoxH * 0.28));

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = barW;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(scaleX, scaleY);
    ctx.lineTo(scaleX + scaleDrawPx, scaleY);
    ctx.stroke();

    ctx.lineWidth = Math.max(1, Math.round(dpiSafe / 210));
    ctx.beginPath();
    ctx.moveTo(scaleX, scaleY - tickH);
    ctx.lineTo(scaleX, scaleY + tickH);
    ctx.moveTo(scaleX + scaleDrawPx, scaleY - tickH);
    ctx.lineTo(scaleX + scaleDrawPx, scaleY + tickH);
    ctx.stroke();
    ctx.textAlign = 'left';
  }
}

function drawWrappedLines(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  /** Caller should set ctx.textBaseline ('alphabetic' or 'middle'); y is baseline or line-center accordingly. */
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return y;
  let line = '';
  let lines = 0;
  words.forEach((word, i) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
      if (i === words.length - 1 && lines < maxLines) {
        ctx.fillText(line, x, y + lines * lineHeight);
      }
    } else if (lines < maxLines) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = word;
      lines += 1;
      if (i === words.length - 1 && lines < maxLines) {
        ctx.fillText(line, x, y + lines * lineHeight);
      }
    }
  });
  return y + Math.min(maxLines - 1, lines) * lineHeight;
}

export async function saveMapPdfWithFooter({
  map,
  baseName,
  mapTitle = 'Map',
  agentName = '',
  agentEmail = '',
  agentPhone = '',
  agentLogoUrl = '',
  agentPhotoUrl = '',
  agentPhotoDataUrl = '',
  agentLogoDataUrl = '',
  ownerUserId = '',
  paperSize = 'letter',
  orientation = 'landscape',
  dpi = 300,
  printElements = [],
  layerStatus = {},
  layerNameMappings = {},
  layerLegends = {},
  cropRectCss = null,
  basemapId = '',
}) {
  if (!map || typeof map.getCanvas !== 'function') {
    throw new Error('Map is not ready yet.');
  }
  const resolvedBasemapId =
    String(basemapId || regridStyleBasemapRef.current || '').trim();
  const safe = sanitizeMapExportBasename(baseName || mapTitle || 'map');
  const paper = PAPER_INCHES[paperSize] || PAPER_INCHES.letter;
  const landscape = orientation === 'landscape';
  const dpiSafe = Math.max(72, Math.min(600, Number(dpi) || 300));
  const pageWIn = landscape ? Math.max(paper.w, paper.h) : Math.min(paper.w, paper.h);
  const pageHIn = landscape ? Math.min(paper.w, paper.h) : Math.max(paper.w, paper.h);
  const pageW = Math.round(pageWIn * dpiSafe);
  const pageH = Math.round(pageHIn * dpiSafe);
  // DPI-aware overlay sizing so icons/labels stay proportional against very sharp basemap exports.
  const overlayScale = Math.max(1.24, Math.min(1.7, 1.32 * Math.pow(dpiSafe / 300, 0.3)));

  // Precompute intended map draw region (match final PDF gutters so framing stays consistent).
  const printSafePre = Math.round(dpiSafe * 0.2);
  const innerGutterPre = Math.round(dpiSafe * (landscape ? 0.065 : 0.05));
  const preMargin = printSafePre + innerGutterPre;
  const preFooterH = Math.round(pageH * (landscape ? 0.245 : 0.17));
  const preHeaderH = Math.round(pageH * (landscape ? 0.048 : 0.036));
  const targetMapW = Math.max(1200, Math.round(pageW - preMargin * 2));
  const targetMapH = Math.max(
    900,
    Math.round(pageH - preFooterH - preHeaderH - printSafePre * 2 - Math.round(dpiSafe * 0.06))
  );

  syncParcelOutlineColorForExport(map, resolvedBasemapId);

  const [photoDrawable, logoDrawable, communityViewLogo] = await Promise.all([
    agentPhotoUrl || ownerUserId || agentPhotoDataUrl
      ? loadProfilePhotoDrawableForPdf({ uid: ownerUserId, photoUrl: agentPhotoUrl })
      : Promise.resolve(null),
    agentLogoUrl || ownerUserId || agentLogoDataUrl
      ? loadFirmLogoDrawableForPdf({ uid: ownerUserId, logoUrl: agentLogoUrl })
      : Promise.resolve(null),
    loadPublicAssetImage(`${process.env.PUBLIC_URL || ''}/logo.png`),
  ]);

  const textNotes = collectTextNotesForExport(map, printElements);
  const mapDataUrl = await captureMapStackToPngDataUrl(map, {
      cropRectCss,
      printElements,
      preferOffscreen: true,
      targetPixelWidth: targetMapW,
      targetPixelHeight: targetMapH,
      includeNotesOverlay: false,
      overlayScale,
      basemapId: resolvedBasemapId,
      paintTextNotes: true,
      textNotes,
    });
  const mapImg = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode map image for PDF.'));
    img.src = mapDataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = pageW;
  canvas.height = pageH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create print canvas.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pageW, pageH);

  // Physical printers rarely reach sheet edges — inset all content so titles/legend survive typical margins.
  const printSafe = Math.round(dpiSafe * 0.2);
  const innerGutter = Math.round(dpiSafe * (landscape ? 0.065 : 0.05));
  const margin = printSafe + innerGutter;
  const footerH = Math.round(pageH * (landscape ? 0.245 : 0.17));
  const headerH = Math.round(pageH * (landscape ? 0.048 : 0.036));
  const mapUpperGap = Math.round(dpiSafe * 0.032);
  const footerY = pageH - footerH - printSafe;
  const mapY = printSafe + headerH + mapUpperGap;
  const mapFootGap = Math.round(dpiSafe * 0.035);
  const mapAreaH = footerY - mapFootGap - mapY;
  const mapAreaW = pageW - margin * 2;
  const iw = mapImg.naturalWidth || mapImg.width;
  const ih = mapImg.naturalHeight || mapImg.height;
  const fit = Math.min(mapAreaW / iw, mapAreaH / ih);
  const drawW = iw * fit;
  const drawH = ih * fit;
  const mapX = Math.round(margin + (mapAreaW - drawW) / 2);
  const mapMat = Math.max(Math.round(dpiSafe * (landscape ? 0.038 : 0.032)), 8);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(mapX - mapMat, mapY - mapMat, drawW + mapMat * 2, drawH + mapMat * 2);
  ctx.drawImage(mapImg, mapX, mapY, drawW, drawH);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = Math.max(2, Math.round(dpiSafe / 180));
  ctx.strokeRect(mapX, mapY, drawW, drawH);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(3, Math.round(dpiSafe / 150));
  ctx.strokeRect(mapX - mapMat, mapY - mapMat, drawW + mapMat * 2, drawH + mapMat * 2);

  const center = map.getCenter?.();
  const zoom = map.getZoom?.();
  const metersPerPxRaw =
    center && Number.isFinite(center.lat) && Number.isFinite(zoom)
      ? mercatorMetersPerPixel(center.lat, zoom)
      : null;
  const mapImagePxToMapPx = iw > 0 ? iw / drawW : 1;
  const metersPerPdfPx =
    Number.isFinite(metersPerPxRaw) ? metersPerPxRaw * mapImagePxToMapPx : null;
  drawMapScaleAndNorthOverlay(ctx, {
    mapX,
    mapY,
    drawW,
    drawH,
    map,
    dpiSafe,
    metersPerPdfPx,
  });

  // White header strip with prominent title (cartographic layout feel).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(printSafe, printSafe, pageW - printSafe * 2, headerH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = Math.max(1, Math.round(dpiSafe / 260));
  ctx.beginPath();
  ctx.moveTo(printSafe, printSafe + headerH);
  ctx.lineTo(pageW - printSafe, printSafe + headerH);
  ctx.stroke();
  ctx.fillStyle = '#0b1a2b';
  ctx.font = `700 ${Math.round(dpiSafe * 0.16)}px Inter, Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const headerLogoMaxH = Math.round(headerH * 0.74 * 2);
  const headerLogoMaxW = Math.round(dpiSafe * 1.24);
  let headerLogoW = 0;
  let communityViewLogoRect = null;
  if (communityViewLogo) {
    const logoRatio = communityViewLogo.naturalWidth / communityViewLogo.naturalHeight;
    let logoH = headerLogoMaxH;
    let logoW = Math.round(logoH * logoRatio);
    if (logoW > headerLogoMaxW) {
      logoW = headerLogoMaxW;
      logoH = Math.round(logoW / logoRatio);
    }
    headerLogoW = logoW + Math.round(dpiSafe * 0.08);
    const logoX = pageW - printSafe - Math.round(dpiSafe * 0.04) - logoW;
    const logoY = printSafe + Math.round((headerH - logoH) / 2);
    communityViewLogoRect = { x: logoX, y: logoY, w: logoW, h: logoH };
    ctx.drawImage(communityViewLogo, logoX, logoY, logoW, logoH);
  }

  drawWrappedLines(
    ctx,
    mapTitle || 'Map',
    margin,
    Math.round(printSafe + headerH / 2),
    pageW - margin - printSafe - headerLogoW - Math.round(dpiSafe * 0.06),
    Math.round(dpiSafe * 0.12),
    1
  );
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(printSafe, footerY, pageW - printSafe * 2, footerH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(printSafe, footerY);
  ctx.lineTo(pageW - printSafe, footerY);
  ctx.stroke();

  const elementLegend = Array.from(
    new Map(
      (printElements || [])
        .filter((el) => el && !el.hiddenOnMap)
        .map((el) => {
          const label = (el.label && String(el.label).trim()) || el.type || 'Feature';
          const key = `${el.type}:${el.svgKey || ''}:${label}`;
          return [key, { label, element: el }];
        })
    ).values()
  ).slice(0, 40);

  const layerLegendEntries = [];
  Object.keys(layerStatus || {})
    .filter((k) => !!layerStatus[k])
    .forEach((k) => {
      const name = layerNameMappings[k] || k;
      const items = Array.isArray(layerLegends?.[k]) ? layerLegends[k] : [];
      const defaultColor = resolveLayerLegendColor(k, '#94a3b8', resolvedBasemapId);
      if (!items.length) {
        layerLegendEntries.push({ label: name, color: defaultColor, layerKey: k });
        return;
      }
      const withLabels = items
        .filter((it) => (it?.label && String(it.label).trim()) || it?.color)
        .slice(0, 3)
        .map((it) => ({
          label: it?.label && String(it.label).trim() ? `${name}: ${String(it.label).trim()}` : name,
          color: resolveLayerLegendColor(k, it?.color || '#94a3b8', resolvedBasemapId),
          layerKey: k,
        }));
      if (!withLabels.length) {
        layerLegendEntries.push({ label: name, color: defaultColor, layerKey: k });
      } else {
        layerLegendEntries.push(...withLabels);
      }
    });
  const layerLegendLines = layerLegendEntries.slice(0, 40);

  const leftColX = margin;
  const colGap = Math.round(dpiSafe * (landscape ? 0.3 : 0.22));
  const rightMetaW = Math.round(dpiSafe * (landscape ? 2.25 : 1.95));
  const colW = Math.round((pageW - margin * 2 - colGap - rightMetaW) / 2);
  const midColX = leftColX + colW + colGap;
  const compactFooter = !landscape;
  const boxTop = footerY + Math.round(dpiSafe * (compactFooter ? 0.035 : 0.055));
  const boxH = footerH - Math.round(dpiSafe * (compactFooter ? 0.1 : 0.14));
  const legendTitleBand = Math.round(dpiSafe * (compactFooter ? 0.15 : 0.195));
  const {
    iconSize: legendIconSize,
    iconSlotW: legendIconSlotW,
    labelGap: legendLabelGap,
    bodyFontPx: legendBodyFontPx,
    rowStep: legendRowStep,
  } = getLegendRowMetrics(dpiSafe, compactFooter);
  const topTextY = boxTop + legendTitleBand;
  const legendBottomPad = Math.round(dpiSafe * 0.075);
  const legendRowsMaxY = boxTop + boxH - legendBottomPad;
  const maxRowsPerCol = Math.max(
    1,
    Math.min(
      24,
      Math.floor(Math.max(0, legendRowsMaxY - topTextY) / legendRowStep)
    )
  );
  const maxMapLegendItems = maxRowsPerCol * 2;
  const maxLayerLegendItems = maxRowsPerCol * 2;

  const mapLegendBoxLeft = leftColX - Math.round(dpiSafe * 0.05);
  const mapLegendInnerPad = Math.round(dpiSafe * 0.055);
  const mapLegendColGap = Math.round(dpiSafe * 0.052);
  const mapLegendInnerW = colW - mapLegendInnerPad * 2;
  const mapLegendSubColW = Math.floor((mapLegendInnerW - mapLegendColGap) / 2);
  const mapLegendCol1X = mapLegendBoxLeft + mapLegendInnerPad;
  const mapLegendCol2X = mapLegendCol1X + mapLegendSubColW + mapLegendColGap;

  const layerLegendBoxLeft = midColX - Math.round(dpiSafe * 0.05);
  const layerLegendCol1X = layerLegendBoxLeft + mapLegendInnerPad;
  const layerLegendCol2X = layerLegendCol1X + mapLegendSubColW + mapLegendColGap;

  const drawLegendBox = (x, y, w, h, title) => {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = Math.max(1, Math.round(dpiSafe / 260));
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#334155';
    ctx.font = `700 ${Math.round(dpiSafe * 0.092)}px Inter, Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(title, x + Math.round(dpiSafe * 0.09), y + Math.round(dpiSafe * 0.11));
    ctx.textBaseline = 'alphabetic';
  };

  drawLegendBox(leftColX - Math.round(dpiSafe * 0.05), boxTop, colW, boxH, 'Map Elements');
  drawLegendBox(midColX - Math.round(dpiSafe * 0.05), boxTop, colW, boxH, 'Active Layers');

  ctx.fillStyle = '#0f172a';
  ctx.font = `${legendBodyFontPx}px Inter, Arial, sans-serif`;

  const visibleElementLegend = elementLegend.slice(0, maxMapLegendItems);
  for (let idx = 0; idx < visibleElementLegend.length; idx += 1) {
    const row = visibleElementLegend[idx];
    const col = idx < maxRowsPerCol ? 0 : 1;
    const rowInCol = col === 0 ? idx : idx - maxRowsPerCol;
    const baseX = col === 0 ? mapLegendCol1X : mapLegendCol2X;
    const rowCenterY = getLegendRowCenterY(topTextY, legendRowStep, rowInCol);
    const iconDrawX = baseX + Math.round((legendIconSlotW - legendIconSize) / 2);
    const iconTop = rowCenterY - legendIconSize / 2;
    const labelX = baseX + legendIconSlotW + legendLabelGap;
    const el = row.element || {};

    if (el.type === 'shape') {
      const file = POINT_ICON_FILE[el.svgKey];
      const cx = baseX + Math.round(legendIconSlotW / 2);
      const cy = rowCenterY;
      const r = legendIconSize / 2;
      const fillOp = Math.max(0, Math.min(1, Number(el.fillOpacity ?? 1)));
      const strokeOp = Math.max(0, Math.min(1, Number(el.strokeOpacity ?? 1)));
      ctx.save();
      ctx.fillStyle = el.fill || '#ffffff';
      ctx.globalAlpha = fillOp;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = el.stroke || '#0f172a';
      ctx.globalAlpha = strokeOp;
      ctx.lineWidth = Math.max(1, Math.round((Number(el.strokeWidth) || 2) * (legendIconSize / 34)));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (file) {
        const absUrl = `${window.location.origin}/logos_for_print/${file}`;
        const img = await loadImage(absUrl);
        if (img) {
          const pad = Math.max(1, Math.round(legendIconSize * 0.18));
          ctx.drawImage(
            img,
            iconDrawX + pad,
            iconTop + pad,
            legendIconSize - pad * 2,
            legendIconSize - pad * 2
          );
        } else {
          ctx.fillStyle = '#0f172a';
          ctx.font = `700 ${Math.max(8, Math.round(legendIconSize * 0.38))}px Inter, Arial, sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.fillText((row.label || '?').slice(0, 1).toUpperCase(), cx, cy);
          ctx.textBaseline = 'alphabetic';
          ctx.font = `${legendBodyFontPx}px Inter, Arial, sans-serif`;
        }
      }
    } else if (el.type === 'polygon') {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.fillOpacity ?? 1)));
      ctx.fillStyle = el.fill || '#94a3b8';
      ctx.fillRect(iconDrawX, iconTop, legendIconSize, legendIconSize);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.strokeOpacity ?? 1)));
      ctx.strokeStyle = el.stroke || '#334155';
      ctx.lineWidth = Math.max(1, dpiSafe / 220);
      ctx.strokeRect(iconDrawX, iconTop, legendIconSize, legendIconSize);
      ctx.restore();
    } else if (el.type === 'polyline' || el.type === 'arrow') {
      drawLegendLineIcon(
        ctx,
        iconDrawX,
        rowCenterY,
        legendIconSize,
        el.stroke || '#2563eb',
        el.strokeOpacity,
        {
          lineWidth: dpiSafe / 180,
          dasharray: el.lineDasharray,
          lineCap: el.strokeLinecap || 'round',
          halo: isLightLegendColor(el.stroke),
        }
      );
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(iconDrawX, iconTop, legendIconSize, legendIconSize);
    }
    ctx.fillStyle = '#0f172a';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.label, labelX, rowCenterY);
    ctx.textBaseline = 'alphabetic';
  }
  const visibleLayerLegend = layerLegendLines.slice(0, maxLayerLegendItems);
  visibleLayerLegend.forEach((entry, idx) => {
    const col = idx < maxRowsPerCol ? 0 : 1;
    const rowInCol = col === 0 ? idx : idx - maxRowsPerCol;
    const baseX = col === 0 ? layerLegendCol1X : layerLegendCol2X;
    const rowCenterY = getLegendRowCenterY(topTextY, legendRowStep, rowInCol);
    const iconDrawX = baseX + Math.round((legendIconSlotW - legendIconSize) / 2);
    const labelX = baseX + legendIconSlotW + legendLabelGap;

    if (entry.layerKey === 'ownership') {
      drawLegendLineIcon(
        ctx,
        iconDrawX,
        rowCenterY,
        legendIconSize,
        entry.color || '#000000',
        1,
        {
          lineWidth: dpiSafe / 175,
          lineCap: 'round',
          halo: isLightLegendColor(entry.color),
        }
      );
    } else {
      const sw = legendIconSize;
      const iconTop = rowCenterY - sw / 2;
      ctx.fillStyle = entry.color || '#94a3b8';
      ctx.fillRect(iconDrawX, iconTop, sw, sw);
      ctx.strokeStyle = 'rgba(15,23,42,0.35)';
      ctx.lineWidth = Math.max(1, Math.round(dpiSafe / 280));
      ctx.strokeRect(iconDrawX, iconTop, sw, sw);
    }

    ctx.fillStyle = '#0f172a';
    ctx.textBaseline = 'middle';
    ctx.fillText(entry.label, labelX, rowCenterY);
    ctx.textBaseline = 'alphabetic';
  });

  const moreFontPx = Math.round(dpiSafe * 0.078);
  if (elementLegend.length > maxMapLegendItems) {
    ctx.fillStyle = '#64748b';
    ctx.font = `${moreFontPx}px Inter, Arial, sans-serif`;
    ctx.fillText(
      `+${elementLegend.length - maxMapLegendItems} more`,
      mapLegendCol1X,
      topTextY + legendRowStep * (maxRowsPerCol + 1)
    );
  }
  if (layerLegendLines.length > maxLayerLegendItems) {
    ctx.fillStyle = '#64748b';
    ctx.font = `${moreFontPx}px Inter, Arial, sans-serif`;
    ctx.fillText(
      `+${layerLegendLines.length - maxLayerLegendItems} more`,
      layerLegendCol1X,
      topTextY + legendRowStep * (maxRowsPerCol + 1)
    );
  }

  // Agent/contact block — matches shared map card (photo + details, logo below)
  const rightColRight = pageW - printSafe;
  const agentBoxX = Math.round(rightColRight - rightMetaW + dpiSafe * 0.04);
  const agentBoxY = boxTop;
  const agentBoxW = rightMetaW - Math.round(dpiSafe * 0.12);
  const agentBoxH = boxH;
  const agentPad = Math.round(dpiSafe * 0.055);
  const rowGap = Math.round(dpiSafe * 0.04);

  ctx.fillStyle = '#f8fafc';
  roundRectPath(ctx, agentBoxX, agentBoxY, agentBoxW, agentBoxH, Math.round(dpiSafe * 0.028));
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = Math.max(1, Math.round(dpiSafe / 260));
  ctx.stroke();

  const logoAreaH = logoDrawable
    ? Math.max(Math.round(dpiSafe * 0.46), agentBoxH - agentPad * 2 - Math.round(dpiSafe * 0.36) - rowGap)
    : 0;
  const contactAreaH = agentBoxH - agentPad * 2 - (logoDrawable ? logoAreaH + rowGap : 0);
  const contactRowY = agentBoxY + agentPad;
  const photoSize = photoDrawable ? Math.round(dpiSafe * 0.24) : 0;
  const photoX = agentBoxX + agentPad;
  const photoY =
    photoDrawable && contactAreaH > photoSize
      ? contactRowY + Math.round((contactAreaH - photoSize) / 2)
      : contactRowY;

  if (photoDrawable?.source) {
    const cx = photoX + photoSize / 2;
    const cy = photoY + photoSize / 2;
    const r = photoSize / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(photoDrawable.source, photoX, photoY, photoSize, photoSize);
    ctx.restore();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = Math.max(1, Math.round(dpiSafe / 220));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    photoDrawable.release?.();
  }

  const textX = photoDrawable ? photoX + photoSize + rowGap : agentBoxX + agentPad;
  const textMaxW = agentBoxX + agentBoxW - agentPad - textX;
  const nameFontPx = Math.round(dpiSafe * 0.076);
  const detailFontPx = Math.round(dpiSafe * 0.064);
  const detailLineH = Math.round(dpiSafe * 0.086);
  const detailLines = [agentName || 'Listing Agent', agentEmail || '', agentPhone || ''].filter(
    Boolean
  );
  const blockTextH =
    nameFontPx + (detailLines.length > 1 ? (detailLines.length - 1) * detailLineH : 0);
  let textY =
    contactRowY +
    Math.max(
      Math.round(dpiSafe * 0.04),
      Math.round((contactAreaH - blockTextH) / 2 + nameFontPx * 0.78)
    );

  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${nameFontPx}px Inter, Arial, sans-serif`;
  ctx.fillText(detailLines[0], textX, textY);
  textY += detailLineH;
  ctx.fillStyle = '#334155';
  ctx.font = `${detailFontPx}px Inter, Arial, sans-serif`;
  if (agentEmail) {
    const emailLine =
      ctx.measureText(agentEmail).width > textMaxW
        ? `${agentEmail.slice(0, Math.max(8, Math.floor(agentEmail.length * 0.82)))}…`
        : agentEmail;
    ctx.fillText(emailLine, textX, textY);
    textY += detailLineH;
  }
  if (agentPhone) {
    ctx.fillText(agentPhone, textX, textY);
  }

  if (logoDrawable?.source) {
    const logoBoxPadX = Math.round(dpiSafe * 0.02);
    const logoBoxPadY = Math.round(dpiSafe * 0.018);
    const logoBoxX = agentBoxX + agentPad;
    const logoBoxW = agentBoxW - agentPad * 2;
    const logoBoxH = logoAreaH;
    const logoBoxY = agentBoxY + agentBoxH - agentPad - logoBoxH;

    ctx.fillStyle = '#ffffff';
    roundRectPath(ctx, logoBoxX, logoBoxY, logoBoxW, logoBoxH, Math.round(dpiSafe * 0.022));
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = Math.max(1, Math.round(dpiSafe / 280));
    ctx.stroke();

    const innerW = logoBoxW - logoBoxPadX * 2;
    const innerH = logoBoxH - logoBoxPadY * 2;
    const ratio = logoDrawable.height / logoDrawable.width;
    let targetH = innerH;
    let targetW = Math.round(targetH / ratio);
    if (targetW > innerW) {
      targetW = innerW;
      targetH = Math.round(targetW * ratio);
    }
    const lx = logoBoxX + Math.round((logoBoxW - targetW) / 2);
    const ly = logoBoxY + Math.round((logoBoxH - targetH) / 2);
    ctx.drawImage(logoDrawable.source, lx, ly, targetW, targetH);
    logoDrawable.release?.();
  }

  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [pageWIn * 72, pageHIn * 72],
  });
  const finalData = canvas.toDataURL('image/png');
  const pdfW = pageWIn * 72;
  const pdfH = pageHIn * 72;
  pdf.addImage(finalData, 'PNG', 0, 0, pdfW, pdfH);
  if (communityViewLogoRect && typeof pdf.link === 'function') {
    const ptScale = 72 / dpiSafe;
    const { x, y, w, h } = communityViewLogoRect;
    pdf.link(x * ptScale, y * ptScale, w * ptScale, h * ptScale, {
      url: COMMUNITY_VIEW_WEBSITE_URL,
    });
  }
  pdf.save(`${safe}.pdf`);
}
