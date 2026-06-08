import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { buildMapLabelDisplayText, labelUsesGeoOffset } from '../pages/print/mapLabelUtils';

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
function computeParcelLineBoostFactor(sourceScale = 1) {
  const s = Number(sourceScale);
  const safe = Number.isFinite(s) ? Math.max(1, Math.min(4, s)) : 1;
  return Math.min(14.5, 9.8 + 1.45 * Math.max(0, safe - 1));
}

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
    const f = Math.max(1.35, Math.min(15, Number(factor) || 2.75));
    if (typeof val === 'number' && Number.isFinite(val)) {
      map.setPaintProperty(layerId, lineWidthKey, val * f);
    } else {
      map.setPaintProperty(layerId, lineWidthKey, ['*', f, val]);
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
  // Draw labels directly in export canvas for consistent typography.
  overlay.querySelectorAll('.print-map-feature-label').forEach((n) => {
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
  } = {}
) {
  if (!map || typeof map.getCanvas !== 'function') {
    throw new Error('Map is not ready yet.');
  }

  if (preferOffscreen) {
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
    restoreParcelOutline = applyParcelOutlineBoostForPdf(
      map,
      computeParcelLineBoostFactor(liveSourceScale)
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

    applyParcelOutlineBoostForPdf(offMap, computeParcelLineBoostFactor(sourceScale));

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
    return out.toDataURL('image/png');
  } finally {
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
  for (const el of printElements) {
    if (!el || el.hiddenOnMap || !el.geometry) continue;
    if (el.type === 'polygon' && el.geometry.type === 'Polygon' && Array.isArray(el.geometry.coordinates?.[0])) {
      const ring = el.geometry.coordinates[0];
      if (ring.length < 3) continue;
      const pts = ring
        .map((c) => {
          try {
            const p = map.project(c);
            return [p.x * sx, p.y * sy];
          } catch (_) {
            return null;
          }
        })
        .filter(Boolean);
      if (pts.length < 3) continue;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.fillOpacity ?? 0.25)));
      ctx.fillStyle = el.fill || '#10b981';
      ctx.fill();
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.strokeOpacity ?? 1)));
      ctx.strokeStyle = el.stroke || '#ffffff';
      ctx.lineWidth = Math.max(1, (Number(el.strokeWidth) || 2) * scale * overlayScale * 1.18);
      const dash = parseDashArray(el.lineDasharray).map((d) => d * scale);
      if (dash.length) ctx.setLineDash(dash);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    if ((el.type === 'polyline' || el.type === 'arrow') && el.geometry.type === 'LineString' && Array.isArray(el.geometry.coordinates)) {
      const pts = el.geometry.coordinates
        .map((c) => {
          try {
            const p = map.project(c);
            return [p.x * sx, p.y * sy];
          } catch (_) {
            return null;
          }
        })
        .filter(Boolean);
      if (pts.length < 2) continue;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.strokeOpacity ?? 1)));
      ctx.strokeStyle = el.stroke || '#2563eb';
      ctx.lineWidth = Math.max(1, (Number(el.strokeWidth) || 3) * scale * overlayScale * 1.18);
      const dash = parseDashArray(el.lineDasharray).map((d) => d * scale);
      if (dash.length) ctx.setLineDash(dash);
      ctx.lineCap = el.strokeLinecap || 'round';
      ctx.lineJoin = el.strokeLinejoin || 'round';
      ctx.stroke();
      ctx.restore();
    }
  }
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
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.iconOpacity ?? 1)));
    ctx.drawImage(img, x + pad, y + pad, size - pad * 2, size - pad * 2);
    ctx.restore();
  }
}

function getElementAnchorLngLatForExport(el) {
  const g = el?.geometry;
  if (!g) return null;
  if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    const [lng, lat] = g.coordinates;
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
    return null;
  }
  if (g.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    const mid = g.coordinates[Math.floor((g.coordinates.length - 1) / 2)];
    if (Array.isArray(mid) && Number.isFinite(mid[0]) && Number.isFinite(mid[1])) {
      return { lng: mid[0], lat: mid[1] };
    }
    return null;
  }
  if (g.type === 'Polygon' && Array.isArray(g.coordinates?.[0]) && g.coordinates[0].length >= 3) {
    const ring = g.coordinates[0];
    const closed =
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    const open = closed ? ring.slice(0, -1) : ring;
    if (!open.length) return null;
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
    const fontMult = 1.48;
    const globalLift = Math.round(36 * scale * Math.max(1, overlayScale * 0.98));
    const fontSize = Math.max(
      12,
      Math.round((Number(el.labelFontSize) || 11) * scale * overlayScale * fontMult)
    );
    const lineHeight = Math.round(fontSize * 1.25);
    const lines = String(text).split('\n').filter(Boolean);
    if (!lines.length) return;

    ctx.save();
    ctx.font = `600 ${fontSize}px ${el.labelFontFamily || 'Inter, Arial, sans-serif'}`;
    const textW = Math.max(...lines.map((ln) => ctx.measureText(ln).width));
    const padX = Math.round(fontSize * 0.7);
    const padY = Math.round(fontSize * 0.45);
    const boxW = Math.round(textW + padX * 2);
    const boxH = Math.round(lines.length * lineHeight + padY * 2);
    const alignH = el.labelAlignH || 'center';
    const alignV = el.labelAlignV || 'top';

    let bx = x;
    let by = y;
    if (alignH === 'center') bx -= boxW / 2;
    else if (alignH === 'right') bx -= boxW;
    const topGap = Math.round(11 * scale * Math.max(1, overlayScale * 0.92));
    if (alignV === 'top') by -= boxH + topGap;
    else if (alignV === 'middle') by -= boxH / 2;
    else by += Math.round(8 * scale);
    by -= globalLift;

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
};

async function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function mercatorMetersPerPixel(lat, zoom) {
  const latRad = (lat * Math.PI) / 180;
  return (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom);
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
  paperSize = 'letter',
  orientation = 'landscape',
  dpi = 300,
  printElements = [],
  layerStatus = {},
  layerNameMappings = {},
  layerLegends = {},
  cropRectCss = null,
}) {
  if (!map || typeof map.getCanvas !== 'function') {
    throw new Error('Map is not ready yet.');
  }
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
  const preFooterH = Math.round(pageH * (landscape ? 0.19 : 0.13));
  const preHeaderH = Math.round(pageH * (landscape ? 0.048 : 0.036));
  const targetMapW = Math.max(1200, Math.round(pageW - preMargin * 2));
  const targetMapH = Math.max(
    900,
    Math.round(pageH - preFooterH - preHeaderH - printSafePre * 2 - Math.round(dpiSafe * 0.06))
  );

  const mapDataUrl = await captureMapStackToPngDataUrl(map, {
    cropRectCss,
    printElements,
    preferOffscreen: true,
    targetPixelWidth: targetMapW,
    targetPixelHeight: targetMapH,
    includeNotesOverlay: false,
    overlayScale,
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
  const footerH = Math.round(pageH * (landscape ? 0.19 : 0.13));
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
  drawWrappedLines(
    ctx,
    mapTitle || 'Map',
    margin,
    Math.round(printSafe + headerH / 2),
    pageW - margin * 2,
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
      if (!items.length) {
        layerLegendEntries.push({ label: name, color: '#94a3b8' });
        return;
      }
      const withLabels = items
        .filter((it) => (it?.label && String(it.label).trim()) || it?.color)
        .slice(0, 3)
        .map((it) => ({
          label: it?.label && String(it.label).trim() ? `${name}: ${String(it.label).trim()}` : name,
          color: it?.color || '#94a3b8',
        }));
      if (!withLabels.length) {
        layerLegendEntries.push({ label: name, color: '#94a3b8' });
      } else {
        layerLegendEntries.push(...withLabels);
      }
    });
  const layerLegendLines = layerLegendEntries.slice(0, 40);

  const leftColX = margin;
  const colGap = Math.round(dpiSafe * (landscape ? 0.3 : 0.22));
  const rightMetaW = Math.round(dpiSafe * (landscape ? 1.9 : 1.65));
  const colW = Math.round((pageW - margin * 2 - colGap - rightMetaW) / 2);
  const midColX = leftColX + colW + colGap;
  const compactFooter = !landscape;
  const boxTop = footerY + Math.round(dpiSafe * (compactFooter ? 0.055 : 0.1));
  const boxH = footerH - Math.round(dpiSafe * (compactFooter ? 0.19 : 0.28));
  const legendTitleBand = Math.round(dpiSafe * (compactFooter ? 0.15 : 0.195));
  const legendBodyFontPx = Math.round(dpiSafe * 0.104);
  const lineH = Math.round(dpiSafe * (compactFooter ? 0.108 : 0.124));
  const topTextY = boxTop + legendTitleBand;
  const legendBottomPad = Math.round(dpiSafe * 0.075);
  const legendRowsMaxY = boxTop + boxH - legendBottomPad;
  const maxRowsPerCol = Math.max(
    1,
    Math.min(
      24,
      Math.floor(Math.max(0, legendRowsMaxY - topTextY) / lineH)
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
    const y = topTextY + lineH * (rowInCol + 1);
    const iconX = baseX;
    const iconY = y - Math.round(dpiSafe * 0.055);
    const iconSize = Math.round(dpiSafe * 0.118);
    const el = row.element || {};

    if (el.type === 'shape') {
      const file = POINT_ICON_FILE[el.svgKey];
      const cx = iconX + iconSize / 2;
      const cy = iconY + iconSize / 2;
      const r = iconSize / 2;
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
      ctx.lineWidth = Math.max(1, Math.round((Number(el.strokeWidth) || 2) * (iconSize / 34)));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (file) {
        const absUrl = `${window.location.origin}/logos_for_print/${file}`;
        const img = await loadImage(absUrl);
        if (img) {
          const pad = Math.max(1, Math.round(iconSize * 0.18));
          ctx.drawImage(img, iconX + pad, iconY + pad, iconSize - pad * 2, iconSize - pad * 2);
        } else {
          ctx.fillStyle = '#0f172a';
          ctx.font = `700 ${Math.max(8, Math.round(iconSize * 0.38))}px Inter, Arial, sans-serif`;
          ctx.fillText(
            (row.label || '?').slice(0, 1).toUpperCase(),
            iconX + Math.round(iconSize * 0.33),
            iconY + Math.round(iconSize * 0.72)
          );
        }
      }
    } else if (el.type === 'polygon') {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.fillOpacity ?? 1)));
      ctx.fillStyle = el.fill || '#94a3b8';
      ctx.fillRect(iconX, iconY, iconSize, iconSize);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.strokeOpacity ?? 1)));
      ctx.strokeStyle = el.stroke || '#334155';
      ctx.lineWidth = Math.max(1, dpiSafe / 220);
      ctx.strokeRect(iconX, iconY, iconSize, iconSize);
      ctx.restore();
    } else if (el.type === 'polyline' || el.type === 'arrow') {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.strokeOpacity ?? 1)));
      ctx.strokeStyle = el.stroke || '#2563eb';
      ctx.lineWidth = Math.max(2, dpiSafe / 180);
      ctx.beginPath();
      ctx.moveTo(iconX, iconY + iconSize / 2);
      ctx.lineTo(iconX + iconSize, iconY + iconSize / 2);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(iconX, iconY, iconSize, iconSize);
    }
    ctx.fillStyle = '#0f172a';
    ctx.fillText(`- ${row.label}`, baseX + iconSize + Math.round(dpiSafe * 0.045), y);
  }
  const visibleLayerLegend = layerLegendLines.slice(0, maxLayerLegendItems);
  visibleLayerLegend.forEach((entry, idx) => {
    const col = idx < maxRowsPerCol ? 0 : 1;
    const rowInCol = col === 0 ? idx : idx - maxRowsPerCol;
    const baseX = col === 0 ? layerLegendCol1X : layerLegendCol2X;
    const y = topTextY + lineH * (rowInCol + 1);
    const sw = Math.round(dpiSafe * 0.068);
    ctx.fillStyle = entry.color || '#94a3b8';
    ctx.fillRect(baseX, y - sw + 2, sw, sw);
    ctx.strokeStyle = 'rgba(15,23,42,0.35)';
    ctx.lineWidth = Math.max(1, Math.round(dpiSafe / 280));
    ctx.strokeRect(baseX, y - sw + 2, sw, sw);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(`- ${entry.label}`, baseX + sw + Math.round(dpiSafe * 0.038), y);
  });

  const moreFontPx = Math.round(dpiSafe * 0.078);
  if (elementLegend.length > maxMapLegendItems) {
    ctx.fillStyle = '#64748b';
    ctx.font = `${moreFontPx}px Inter, Arial, sans-serif`;
    ctx.fillText(
      `+${elementLegend.length - maxMapLegendItems} more`,
      mapLegendCol1X,
      topTextY + lineH * (maxRowsPerCol + 1)
    );
  }
  if (layerLegendLines.length > maxLayerLegendItems) {
    ctx.fillStyle = '#64748b';
    ctx.font = `${moreFontPx}px Inter, Arial, sans-serif`;
    ctx.fillText(
      `+${layerLegendLines.length - maxLayerLegendItems} more`,
      layerLegendCol1X,
      topTextY + lineH * (maxRowsPerCol + 1)
    );
  }

  // Scale bar
  const center = map.getCenter?.();
  const zoom = map.getZoom?.();
  const metersPerPxRaw =
    center && Number.isFinite(center.lat) && Number.isFinite(zoom)
      ? mercatorMetersPerPixel(center.lat, zoom)
      : null;
  const mapImagePxToMapPx = iw > 0 ? iw / drawW : 1;
  const metersPerPdfPx =
    Number.isFinite(metersPerPxRaw) ? metersPerPxRaw * mapImagePxToMapPx : null;
  const scaleTargetPx = Math.round(dpiSafe * 1.15);
  const scaleMeters = pickScaleDistanceMeters(scaleTargetPx, metersPerPdfPx);
  const scalePx = scaleMeters && metersPerPdfPx ? scaleMeters / metersPerPdfPx : 0;
  const rightColRight = pageW - printSafe;
  const scaleX = Math.round(rightColRight - rightMetaW + dpiSafe * 0.22);
  const scaleY = footerY + Math.round(footerH * 0.88);
  if (scalePx > 0) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = Math.max(2, dpiSafe / 120);
    ctx.beginPath();
    ctx.moveTo(scaleX, scaleY);
    ctx.lineTo(scaleX + scalePx, scaleY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(scaleX, scaleY - 8);
    ctx.lineTo(scaleX, scaleY + 8);
    ctx.moveTo(scaleX + scalePx, scaleY - 8);
    ctx.lineTo(scaleX + scalePx, scaleY + 8);
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.font = `${Math.round(dpiSafe * 0.06)}px Inter, Arial, sans-serif`;
    ctx.fillText(formatDistance(scaleMeters), scaleX, scaleY - 12);
  }

  // North arrow
  const bearing = Number(map.getBearing?.() || 0);
  const arrowCx = Math.round(rightColRight - rightMetaW / 2);
  const arrowCy = footerY + Math.round(footerH * 0.68);
  const arrowSize = Math.round(dpiSafe * 0.18);
  ctx.save();
  ctx.translate(arrowCx, arrowCy);
  ctx.rotate((-bearing * Math.PI) / 180);
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(0, -arrowSize);
  ctx.lineTo(Math.round(arrowSize * 0.42), Math.round(arrowSize * 0.7));
  ctx.lineTo(0, Math.round(arrowSize * 0.35));
  ctx.lineTo(Math.round(-arrowSize * 0.42), Math.round(arrowSize * 0.7));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${Math.round(dpiSafe * 0.085)}px Inter, Arial, sans-serif`;
  ctx.fillText('N', arrowCx - Math.round(dpiSafe * 0.03), arrowCy - arrowSize - Math.round(dpiSafe * 0.04));

  // Agent/contact block
  const agentBoxX = Math.round(rightColRight - rightMetaW);
  const agentBoxY = boxTop;
  const agentBoxW = rightMetaW - Math.round(dpiSafe * 0.22);
  const agentBoxH = Math.round(footerH * (compactFooter ? 0.4 : 0.46));
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(agentBoxX, agentBoxY, agentBoxW, agentBoxH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = Math.max(1, Math.round(dpiSafe / 260));
  ctx.strokeRect(agentBoxX, agentBoxY, agentBoxW, agentBoxH);
  let textY = agentBoxY + Math.round(dpiSafe * 0.14);
  if (agentLogoUrl) {
    const logoImg = await loadImage(agentLogoUrl);
    if (logoImg) {
      const targetW = Math.min(agentBoxW - Math.round(dpiSafe * 0.18), Math.round(dpiSafe * 0.62));
      const ratio = (logoImg.naturalHeight || logoImg.height || 1) / (logoImg.naturalWidth || logoImg.width || 1);
      const targetH = Math.max(26, Math.round(targetW * ratio));
      const lx = agentBoxX + Math.round((agentBoxW - targetW) / 2);
      const ly = agentBoxY + Math.round(dpiSafe * 0.08);
      ctx.drawImage(logoImg, lx, ly, targetW, targetH);
      textY = ly + targetH + Math.round(dpiSafe * 0.1);
    }
  }
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${Math.round(dpiSafe * 0.072)}px Inter, Arial, sans-serif`;
  ctx.fillText(agentName || 'Listing Agent', agentBoxX + Math.round(dpiSafe * 0.08), textY);
  textY += Math.round(dpiSafe * 0.1);
  ctx.fillStyle = '#334155';
  ctx.font = `${Math.round(dpiSafe * 0.064)}px Inter, Arial, sans-serif`;
  if (agentEmail) {
    ctx.fillText(agentEmail, agentBoxX + Math.round(dpiSafe * 0.08), textY);
    textY += Math.round(dpiSafe * 0.085);
  }
  if (agentPhone) {
    ctx.fillText(agentPhone, agentBoxX + Math.round(dpiSafe * 0.08), textY);
  }

  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [pageWIn * 72, pageHIn * 72],
  });
  const finalData = canvas.toDataURL('image/jpeg', 0.92);
  pdf.addImage(finalData, 'JPEG', 0, 0, pageWIn * 72, pageHIn * 72);
  pdf.save(`${safe}.pdf`);
}
