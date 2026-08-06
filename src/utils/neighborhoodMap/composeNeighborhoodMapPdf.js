/**
 * Compose Erik-style neighborhood map PDF + matching full-page PNG for email.
 * PNG is a raster of the same letter page as the PDF (not just the map crop).
 */
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { sanitizeMapExportBasename } from '../mapExportCapture';
import { groupAmenitiesByCategory } from './neighborhoodAmenities';
import { NEIGHBORHOOD_CATEGORY_COLORS } from './buildNeighborhoodPrintElements';

const PAGE_W = 8.5;
const PAGE_H = 11;
const MARGIN = 0.45;
const CONTENT_W = PAGE_W - MARGIN * 2;
const MAP_H = 5.35;
const FOOTER_H = 0.82;
/** ~170 dpi letter page for a sharp email attachment. */
const PNG_DPI = 170;
const CV_LOGO_SRC = '/logo.png';

function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return [15, 23, 42];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function categoryRgb(amenityKey) {
  const c = NEIGHBORHOOD_CATEGORY_COLORS[amenityKey];
  if (c?.rgb) return c.rgb;
  if (c?.fill) return hexToRgb(c.fill);
  return [15, 23, 42];
}

function str(v) {
  return String(v == null ? '' : v).trim();
}

function loadImageEl(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function fitImage(img, maxW, maxH) {
  const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
  let h = maxH;
  let w = h * ratio;
  if (w > maxW) {
    w = maxW;
    h = w / ratio;
  }
  return { w, h };
}

function truncateToWidth(ctx, text, maxW) {
  let draw = String(text || '');
  while (ctx.measureText(draw).width > maxW && draw.length > 4) {
    draw = `${draw.slice(0, -2)}…`;
  }
  return draw;
}

/**
 * Draw the full letter page onto a canvas, then use that for both PNG download
 * and the PDF page image (identical attachment + PDF).
 */
async function composeLetterPageCanvas({
  title,
  placeLabel,
  mapDataUrl,
  amenities,
  shareUrl,
  brand,
}) {
  const pxW = Math.round(PAGE_W * PNG_DPI);
  const pxH = Math.round(PAGE_H * PNG_DPI);
  const scale = PNG_DPI; // inches → px
  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create page canvas.');

  const inch = (n) => n * scale;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pxW, pxH);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const [photoImg, firmLogoImg, cvLogoImg] = await Promise.all([
    loadImageEl(
      brand?.photoUrl || (brand?.photoBase64 ? `data:image/png;base64,${brand.photoBase64}` : '')
    ),
    loadImageEl(
      brand?.logoUrl || (brand?.logoBase64 ? `data:image/png;base64,${brand.logoBase64}` : '')
    ),
    loadImageEl(CV_LOGO_SRC),
  ]);

  const agentName = str(brand?.name) || 'Listing agent';
  const agentEmail = str(brand?.email);
  const agentPhone = str(brand?.phone);

  // --- Header: title left, agent contact top-right ---
  const headerTop = inch(MARGIN);
  const agentBlockW = inch(2.55);
  const agentRight = inch(PAGE_W - MARGIN);
  const agentLeft = agentRight - agentBlockW;
  const titleMaxW = agentLeft - inch(MARGIN) - inch(0.12);

  const photoSize = photoImg ? inch(0.52) : 0;
  let contactX = agentLeft + (photoImg ? photoSize + inch(0.1) : 0);
  let contactMaxW = agentRight - contactX;
  if (!photoImg) {
    ctx.font = `700 ${Math.round(inch(0.125))}px Helvetica, Arial, sans-serif`;
    const nameW = ctx.measureText(agentName).width;
    ctx.font = `400 ${Math.round(inch(0.095))}px Helvetica, Arial, sans-serif`;
    const emailW = agentEmail ? ctx.measureText(agentEmail).width : 0;
    const phoneW = agentPhone ? ctx.measureText(agentPhone).width : 0;
    contactMaxW = Math.min(agentBlockW, Math.max(nameW, emailW, phoneW) + inch(0.02));
    contactX = agentRight - contactMaxW;
  }

  if (photoImg) {
    const cx = agentLeft + photoSize / 2;
    const cy = headerTop + photoSize / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, photoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(photoImg, agentLeft, headerTop, photoSize, photoSize);
    ctx.restore();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, photoSize / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  let contactY = headerTop + inch(0.16);
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${Math.round(inch(0.125))}px Helvetica, Arial, sans-serif`;
  ctx.fillText(truncateToWidth(ctx, agentName, contactMaxW), contactX, contactY);
  contactY += inch(0.15);
  ctx.fillStyle = '#475569';
  ctx.font = `400 ${Math.round(inch(0.095))}px Helvetica, Arial, sans-serif`;
  if (agentEmail) {
    ctx.fillText(truncateToWidth(ctx, agentEmail, contactMaxW), contactX, contactY);
    contactY += inch(0.13);
  }
  if (agentPhone) ctx.fillText(agentPhone, contactX, contactY);

  const titleText = str(title || 'Neighborhood map');
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${Math.round(inch(0.26))}px Helvetica, Arial, sans-serif`;
  ctx.fillText(truncateToWidth(ctx, titleText, titleMaxW), inch(MARGIN), headerTop + inch(0.22));

  let y = headerTop + inch(0.4);
  if (placeLabel) {
    ctx.fillStyle = '#64748b';
    ctx.font = `400 ${Math.round(inch(0.13))}px Helvetica, Arial, sans-serif`;
    ctx.fillText(
      truncateToWidth(ctx, String(placeLabel), titleMaxW),
      inch(MARGIN),
      y
    );
    y += inch(0.18);
  }

  const headerBottom = Math.max(
    y,
    headerTop + (photoImg ? photoSize : inch(0.55)) + inch(0.08)
  );

  // --- Map with black border (cover — fill slot, never stretch) ---
  const mapTop = headerBottom + inch(0.06);
  const mapH = inch(MAP_H);
  const mapW = inch(CONTENT_W);
  const mapX = inch(MARGIN);
  await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const iw = img.naturalWidth || img.width || 1;
      const ih = img.naturalHeight || img.height || 1;
      const scale = Math.max(mapW / iw, mapH / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = mapX + (mapW - dw) / 2;
      const dy = mapTop + (mapH - dh) / 2;
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(mapX, mapTop, mapW, mapH);
      ctx.save();
      ctx.beginPath();
      ctx.rect(mapX, mapTop, mapW, mapH);
      ctx.clip();
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
      resolve();
    };
    img.onerror = () => {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(mapX, mapTop, mapW, mapH);
      ctx.fillStyle = '#64748b';
      ctx.font = `400 ${Math.round(inch(0.16))}px Helvetica, Arial, sans-serif`;
      ctx.fillText('Map preview unavailable', mapX + mapW / 2 - 80, mapTop + mapH / 2);
      resolve();
    };
    img.src = mapDataUrl;
  });
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.strokeRect(mapX + 1.5, mapTop + 1.5, mapW - 3, mapH - 3);

  // --- Legend box ---
  const footerReserve = inch(FOOTER_H + 0.12);
  const legendOuterTop = mapTop + mapH + inch(0.14);
  const legendOuterBottom = inch(PAGE_H - MARGIN) - footerReserve;
  const legendPad = inch(0.12);
  const legendInnerLeft = mapX + legendPad;
  const legendInnerRight = mapX + mapW - legendPad;
  const legendContentW = legendInnerRight - legendInnerLeft;

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.strokeRect(mapX + 1.5, legendOuterTop + 1.5, mapW - 3, legendOuterBottom - legendOuterTop - 3);

  let legendY = legendOuterTop + legendPad + inch(0.14);
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${Math.round(inch(0.15))}px Helvetica, Arial, sans-serif`;
  ctx.fillText('Neighborhood amenities', legendInnerLeft, legendY);
  legendY += inch(0.18);

  const groups = groupAmenitiesByCategory(amenities);
  const colW = (legendContentW - inch(0.18)) / 2;
  const colGap = inch(0.18);
  let col = 0;
  const colY = [legendY, legendY];
  const legendBottom = legendOuterBottom - legendPad;
  const lineH = inch(0.125);
  const swatch = inch(0.095);

  groups.forEach((group) => {
    let cy = colY[col];
    const x0 = legendInnerLeft + col * (colW + colGap);
    const rgb = categoryRgb(group.key);

    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.beginPath();
    ctx.arc(x0 + swatch / 2, cy - inch(0.035), swatch / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 ${Math.round(inch(0.105))}px Helvetica, Arial, sans-serif`;
    ctx.fillText(String(group.label).toUpperCase(), x0 + swatch + inch(0.06), cy);
    cy += inch(0.15);

    group.items.forEach((item) => {
      if (cy > legendBottom) return;
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.font = `700 ${Math.round(inch(0.11))}px Helvetica, Arial, sans-serif`;
      const num = `${item.number}.`;
      ctx.fillText(num, x0, cy);
      const numW = ctx.measureText(num).width;
      ctx.fillStyle = '#1e293b';
      ctx.font = `400 ${Math.round(inch(0.11))}px Helvetica, Arial, sans-serif`;
      ctx.fillText(
        truncateToWidth(ctx, item.name || '', colW - numW - inch(0.06)),
        x0 + numW + inch(0.035),
        cy
      );
      cy += lineH;
    });
    colY[col] = cy + inch(0.08);
    col = colY[0] <= colY[1] ? 0 : 1;
  });

  // --- Footer: CV logo + firm logo (+ optional QR) ---
  const footerTop = legendOuterBottom + inch(0.1);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mapX, footerTop);
  ctx.lineTo(mapX + mapW, footerTop);
  ctx.stroke();

  const footerInnerTop = footerTop + inch(0.1);
  const footerH = inch(FOOTER_H) - inch(0.12);
  let qrImg = null;
  if (shareUrl) {
    try {
      const qrDataUrl = await QRCode.toDataURL(shareUrl, {
        width: 256,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      qrImg = await loadImageEl(qrDataUrl);
    } catch (_) {
      /* optional */
    }
  }

  const qrSize = qrImg ? Math.min(footerH, inch(0.55)) : 0;
  let rightX = mapX + mapW;
  if (qrImg) {
    rightX -= qrSize;
    ctx.drawImage(qrImg, rightX, footerInnerTop + (footerH - qrSize) / 2, qrSize, qrSize);
    rightX -= inch(0.1);
  }

  if (firmLogoImg) {
    const { w, h } = fitImage(firmLogoImg, inch(1.5), footerH);
    rightX -= w;
    ctx.drawImage(firmLogoImg, rightX, footerInnerTop + (footerH - h) / 2, w, h);
  }

  if (cvLogoImg) {
    const { w, h } = fitImage(cvLogoImg, inch(2.35), footerH);
    ctx.drawImage(cvLogoImg, mapX, footerInnerTop + (footerH - h) / 2, w, h);
  }

  return canvas.toDataURL('image/png');
}

/**
 * @returns {Promise<{ pdfFileName: string, pngFileName: string, pdfDataUrl: string, pngDataUrl: string }>}
 */
export async function composeNeighborhoodMapOutputs({
  title,
  placeLabel,
  mapDataUrl,
  amenities,
  shareUrl,
  brand,
  download = true,
} = {}) {
  if (!mapDataUrl) throw new Error('Missing neighborhood map image.');

  const base = sanitizeMapExportBasename(title || 'neighborhood-map');
  const pdfFileName = `${base}.pdf`;
  const pngFileName = `${base}.png`;

  const pagePngDataUrl = await composeLetterPageCanvas({
    title,
    placeLabel,
    mapDataUrl,
    amenities,
    shareUrl,
    brand,
  });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });
  doc.addImage(pagePngDataUrl, 'PNG', 0, 0, PAGE_W, PAGE_H);

  const pdfDataUrl = doc.output('datauristring');
  const pngDataUrl = pagePngDataUrl;

  if (download) {
    doc.save(pdfFileName);
    downloadDataUrl(pngFileName, pngDataUrl);
  }

  return { pdfFileName, pngFileName, pdfDataUrl, pngDataUrl };
}

export function downloadNeighborhoodPng(pngDataUrl, title) {
  const name = `${sanitizeMapExportBasename(title || 'neighborhood-map')}.png`;
  downloadDataUrl(name, pngDataUrl);
}
