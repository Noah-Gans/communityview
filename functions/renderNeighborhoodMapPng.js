/**
 * Server-side neighborhood map page matching the frontend letter layout.
 *
 * - Basemap aspect ratio matches the page map slot (no stretch)
 * - Viewport fits amenity + home bounds (zoomed in, not city-scale)
 * - Numbered discs + home icon drawn in canvas (not Mapbox pin markers)
 */
const functions = require("firebase-functions");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const PAGE_W_IN = 8.5;
const PAGE_H_IN = 11;
const MARGIN_IN = 0.45;
const CONTENT_W_IN = PAGE_W_IN - MARGIN_IN * 2;
/** Same map height as frontend composeNeighborhoodMapPdf */
const MAP_H_IN = 5.55;
const PNG_DPI = 170;

/** Logical basemap size — exact half of letter map slot pixels (1:1 draw, no scale). */
const MAP_SLOT_PX_W = Math.round(CONTENT_W_IN * PNG_DPI);
const MAP_SLOT_PX_H = Math.round(MAP_H_IN * PNG_DPI);
const LOGICAL_MAP_W = Math.round(MAP_SLOT_PX_W / 2);
const LOGICAL_MAP_H = Math.round(MAP_SLOT_PX_H / 2);

const CATEGORY_META = {
  dining: { label: "Dining", fill: "#f97316", rgb: [249, 115, 22] },
  coffee: { label: "Coffee & Bakeries", fill: "#a16207", rgb: [161, 98, 7] },
  grocery: { label: "Groceries & Essentials", fill: "#eab308", rgb: [234, 179, 8] },
  fitness: { label: "Fitness & Wellness", fill: "#f43f5e", rgb: [244, 63, 94] },
  parks_rec: { label: "Parks & Recreation", fill: "#22c55e", rgb: [34, 197, 94] },
  essentials: { label: "Essentials", fill: "#78716c", rgb: [120, 113, 108] },
};

const CATEGORY_ORDER = [
  "dining",
  "coffee",
  "grocery",
  "fitness",
  "parks_rec",
  "essentials",
];

function str(v) {
  return String(v == null ? "" : v).trim();
}

function getMapboxToken() {
  let cfg = {};
  try {
    cfg = functions.config() || {};
  } catch (_) {
    cfg = {};
  }
  return str(
    (cfg.mapbox && cfg.mapbox.token) ||
      process.env.MAPBOX_ACCESS_TOKEN ||
      process.env.REACT_APP_MAPBOX_ACCESS_TOKEN ||
      ""
  );
}

function lngLatToWorld(lng, lat) {
  const x = (lng + 180) / 360;
  const sin = Math.sin((lat * Math.PI) / 180);
  const clamped = Math.max(-0.9999, Math.min(0.9999, sin));
  const y = 0.5 - Math.log((1 + clamped) / (1 - clamped)) / (4 * Math.PI);
  return { x, y };
}

function projectLngLat(lng, lat, centerLng, centerLat, zoom, logicalW, logicalH, retina) {
  const scale = 256 * 2 ** zoom;
  const c = lngLatToWorld(centerLng, centerLat);
  const p = lngLatToWorld(lng, lat);
  const mul = retina ? 2 : 1;
  return {
    x: (p.x - c.x) * scale * mul + (logicalW * mul) / 2,
    y: (p.y - c.y) * scale * mul + (logicalH * mul) / 2,
  };
}

function ringFromGeometry(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Polygon") return geometry.coordinates?.[0] || null;
  if (geometry.type === "MultiPolygon") return geometry.coordinates?.[0]?.[0] || null;
  return null;
}

function simplifyRing(ring, maxPoints = 40) {
  if (!Array.isArray(ring) || ring.length <= maxPoints) return ring || [];
  const step = Math.ceil(ring.length / maxPoints);
  const out = [];
  for (let i = 0; i < ring.length; i += step) out.push(ring[i]);
  const first = ring[0];
  const last = out[out.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    out.push([...first]);
  }
  return out;
}

/**
 * Fit viewport to home + amenities. Caps far outliers so one distant park
 * doesn't zoom the whole frame out.
 */
function computeViewport(lat, lng, amenities, geometry, logicalW, logicalH) {
  const homeLat = Number(lat);
  const homeLng = Number(lng);

  const distMiles = (plat, plng) => {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(plat - homeLat);
    const dLng = toRad(plng - homeLng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(homeLat)) *
        Math.cos(toRad(plat)) *
        Math.sin(dLng / 2) ** 2;
    return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
  };

  // Frame to every selected amenity so none fall outside the map.
  const framePts = (amenities || [])
    .map((a) => ({ lat: Number(a.lat), lng: Number(a.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  let west = homeLng;
  let east = homeLng;
  let south = homeLat;
  let north = homeLat;

  const expand = (plat, plng) => {
    if (!Number.isFinite(plat) || !Number.isFinite(plng)) return;
    west = Math.min(west, plng);
    east = Math.max(east, plng);
    south = Math.min(south, plat);
    north = Math.max(north, plat);
  };

  for (const p of framePts) expand(p.lat, p.lng);

  // Parcel only if small / near home (don't let huge multipolygon blow zoom)
  const ring = ringFromGeometry(geometry);
  if (ring && ring.length) {
    let rWest = Infinity;
    let rEast = -Infinity;
    let rSouth = Infinity;
    let rNorth = -Infinity;
    for (const c of ring) {
      const plng = Number(c[0]);
      const plat = Number(c[1]);
      if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue;
      rWest = Math.min(rWest, plng);
      rEast = Math.max(rEast, plng);
      rSouth = Math.min(rSouth, plat);
      rNorth = Math.max(rNorth, plat);
    }
    if (
      Number.isFinite(rWest) &&
      distMiles((rSouth + rNorth) / 2, (rWest + rEast) / 2) < 0.2 &&
      rEast - rWest < 0.01 &&
      rNorth - rSouth < 0.01
    ) {
      expand(rSouth, rWest);
      expand(rNorth, rEast);
    }
  }

  const minSpanLng = 0.0018;
  const minSpanLat = 0.0015;
  if (east - west < minSpanLng) {
    const mid = (east + west) / 2;
    west = mid - minSpanLng / 2;
    east = mid + minSpanLng / 2;
  }
  if (north - south < minSpanLat) {
    const mid = (north + south) / 2;
    south = mid - minSpanLat / 2;
    north = mid + minSpanLat / 2;
  }

  // Tight padding (~4%)
  const padLng = (east - west) * 0.04;
  const padLat = (north - south) * 0.04;
  west -= padLng;
  east += padLng;
  south -= padLat;
  north += padLat;

  const centerLng = (west + east) / 2;
  const centerLat = (south + north) / 2;

  const latRad = (la) => {
    const s = Math.sin((la * Math.PI) / 180);
    const c = Math.max(-0.9999, Math.min(0.9999, s));
    return Math.log((1 + c) / (1 - c)) / 2;
  };

  let fractionX = (east - west) / 360;
  if (fractionX <= 0) fractionX = 1e-6;
  const fractionY = Math.abs(latRad(north) - latRad(south)) / (2 * Math.PI);
  const safeY = Math.max(fractionY, 1e-6);

  const zoomX = Math.log2(logicalW / 256 / fractionX);
  const zoomY = Math.log2(logicalH / 256 / safeY);
  // Slight pullback so edge pins aren't clipped
  const zoom = Math.min(Math.min(zoomX, zoomY) - 0.12, 16);

  return {
    centerLng,
    centerLat,
    zoom: Math.max(13, zoom),
    west,
    south,
    east,
    north,
  };
}

function groupAmenitiesByCategory(amenities) {
  const byKey = new Map();
  for (const key of CATEGORY_ORDER) {
    const meta = CATEGORY_META[key];
    byKey.set(key, { key, label: meta.label, rgb: meta.rgb, items: [] });
  }
  for (const a of amenities || []) {
    const g = byKey.get(a.amenityKey);
    if (g) g.items.push(a);
  }
  return [...byKey.values()].filter((g) => g.items.length > 0);
}

function categoryFill(amenityKey) {
  return CATEGORY_META[amenityKey]?.fill || "#0f172a";
}

function drawHouseIcon(ctx, x, y, size) {
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ef4444";
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  const s = size * 0.42;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.55);
  ctx.lineTo(x + s * 0.55, y - s * 0.05);
  ctx.lineTo(x + s * 0.35, y - s * 0.05);
  ctx.lineTo(x + s * 0.35, y + s * 0.5);
  ctx.lineTo(x - s * 0.35, y + s * 0.5);
  ctx.lineTo(x - s * 0.35, y - s * 0.05);
  ctx.lineTo(x - s * 0.55, y - s * 0.05);
  ctx.closePath();
  ctx.fill();
}

function drawAmenityDisc(ctx, x, y, size, fill, number) {
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  ctx.font = `700 ${Math.round(size * 0.42)}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), x, y + 0.5);
}

async function fetchBasemapImage({ centerLng, centerLat, zoom, logicalW, logicalH, token }) {
  const url =
    `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/` +
    `${centerLng.toFixed(5)},${centerLat.toFixed(5)},${zoom.toFixed(2)},0/` +
    `${logicalW}x${logicalH}@2x` +
    `?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(
      `Mapbox basemap failed (${res.status}): ${body.slice(0, 180)}`
    );
    err.code = "internal";
    throw err;
  }
  return loadImage(Buffer.from(await res.arrayBuffer()));
}

async function composeMapFrame({
  lat,
  lng,
  amenities,
  geometry,
  token,
  logicalW = LOGICAL_MAP_W,
  logicalH = LOGICAL_MAP_H,
}) {
  const viewport = computeViewport(lat, lng, amenities, geometry, logicalW, logicalH);
  const basemap = await fetchBasemapImage({
    centerLng: viewport.centerLng,
    centerLat: viewport.centerLat,
    zoom: viewport.zoom,
    logicalW,
    logicalH,
    token,
  });

  // Use actual returned pixels (avoids stretch if Mapbox resizes)
  const pxW = basemap.width;
  const pxH = basemap.height;
  const usedLogicalW = pxW / 2;
  const usedLogicalH = pxH / 2;
  const canvas = createCanvas(pxW, pxH);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(basemap, 0, 0, pxW, pxH);

  const project = (plat, plng) =>
    projectLngLat(
      plng,
      plat,
      viewport.centerLng,
      viewport.centerLat,
      viewport.zoom,
      usedLogicalW,
      usedLogicalH,
      true
    );

  const ring = simplifyRing(ringFromGeometry(geometry), 48);
  if (ring && ring.length >= 4) {
    ctx.beginPath();
    ring.forEach((c, i) => {
      const pt = project(Number(c[1]), Number(c[0]));
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(37, 99, 235, 0.16)";
    ctx.fill();
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  // Disc size relative to frame — readable but not huge when zoomed in
  const discSize = Math.round(Math.min(pxW, pxH) * 0.038);
  const homeSize = Math.round(discSize * 1.55);

  for (const a of amenities || []) {
    if (!Number.isFinite(Number(a.lat)) || !Number.isFinite(Number(a.lng))) continue;
    const pt = project(Number(a.lat), Number(a.lng));
    drawAmenityDisc(ctx, pt.x, pt.y, discSize, categoryFill(a.amenityKey), a.number);
  }

  const home = project(Number(lat), Number(lng));
  drawHouseIcon(ctx, home.x, home.y, homeSize);

  return canvas;
}

async function composeLetterPagePng({
  title,
  placeLabel,
  lat,
  lng,
  amenities,
  geometry,
  brand,
}) {
  const token = getMapboxToken();
  if (!token) {
    const err = new Error(
      "Mapbox token not configured. Set mapbox.token via firebase functions:config:set"
    );
    err.code = "failed-precondition";
    throw err;
  }

  const scale = PNG_DPI;
  const inch = (n) => n * scale;
  const pxW = Math.round(PAGE_W_IN * PNG_DPI);
  const pxH = Math.round(PAGE_H_IN * PNG_DPI);
  const page = createCanvas(pxW, pxH);
  const ctx = page.getContext("2d");
  const path = require("path");
  const fs = require("fs");

  const roundRect = (x, y, w, h, r) => {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  };

  async function loadOptionalImage(input) {
    const raw = str(input);
    if (!raw) return null;
    try {
      if (raw.startsWith("data:")) {
        const b64 = raw.split(",")[1] || "";
        if (!b64) return null;
        return loadImage(Buffer.from(b64, "base64"));
      }
      if (/^https?:\/\//i.test(raw)) {
        const res = await fetch(raw);
        if (!res.ok) return null;
        return loadImage(Buffer.from(await res.arrayBuffer()));
      }
      // bare base64
      if (raw.length > 80 && !raw.includes(" ")) {
        return loadImage(Buffer.from(raw, "base64"));
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pxW, pxH);

  // —— Header (Baker ST title + Winding Way CV logo top-right) ——
  const headerTop = inch(MARGIN_IN);
  const titleText = String(title || "Neighborhood map").toUpperCase();
  ctx.fillStyle = "#0b1a2b";
  ctx.font = `700 ${Math.round(inch(0.26))}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(titleText, inch(MARGIN_IN), headerTop + inch(0.22));

  let headerLogoW = 0;
  try {
    const logoPath = path.join(__dirname, "assets", "cv-logo.png");
    if (fs.existsSync(logoPath)) {
      const cvLogo = await loadImage(fs.readFileSync(logoPath));
      const maxH = inch(0.32);
      const maxW = inch(1.55);
      const ratio = cvLogo.width / Math.max(1, cvLogo.height);
      let logoH = maxH;
      let logoW = logoH * ratio;
      if (logoW > maxW) {
        logoW = maxW;
        logoH = logoW / ratio;
      }
      const logoX = inch(PAGE_W_IN - MARGIN_IN) - logoW;
      const logoY = headerTop + inch(0.02);
      ctx.drawImage(cvLogo, logoX, logoY, logoW, logoH);
      headerLogoW = logoW + inch(0.1);
    }
  } catch (_) {
    /* logo optional */
  }

  let y = headerTop + inch(0.38);
  const sub = str(placeLabel) || titleText;
  ctx.fillStyle = "#64748b";
  ctx.font = `400 ${Math.round(inch(0.13))}px Helvetica, Arial, sans-serif`;
  const maxSubW = inch(PAGE_W_IN - MARGIN_IN * 2) - headerLogoW;
  let subDraw = sub.toUpperCase();
  while (ctx.measureText(subDraw).width > maxSubW && subDraw.length > 8) {
    subDraw = `${subDraw.slice(0, -2)}…`;
  }
  ctx.fillText(subDraw, inch(MARGIN_IN), y);
  y += inch(0.2);

  // —— Map ——
  const mapTop = y + inch(0.04);
  const mapH = inch(MAP_H_IN);
  const mapW = inch(CONTENT_W_IN);
  const mapFrame = await composeMapFrame({
    lat,
    lng,
    amenities,
    geometry,
    token,
    logicalW: LOGICAL_MAP_W,
    logicalH: LOGICAL_MAP_H,
  });
  const dx = inch(MARGIN_IN);
  const dy = mapTop;
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(dx, dy, mapW, mapH);
  if (mapFrame.width === MAP_SLOT_PX_W && mapFrame.height === MAP_SLOT_PX_H) {
    ctx.drawImage(mapFrame, dx, dy);
  } else {
    const ir = mapFrame.width / mapFrame.height;
    const tr = mapW / mapH;
    let w;
    let h;
    let x;
    let yy;
    if (ir > tr) {
      w = mapW;
      h = mapW / ir;
      x = dx;
      yy = dy + (mapH - h) / 2;
    } else {
      h = mapH;
      w = mapH * ir;
      x = dx + (mapW - w) / 2;
      yy = dy;
    }
    ctx.drawImage(mapFrame, x, yy, w, h);
  }
  // Thin frame like print exports
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = Math.max(1, Math.round(inch(0.01)));
  ctx.strokeRect(dx, dy, mapW, mapH);
  y = mapTop + mapH + inch(0.16);

  // —— Legend + bottom-right branding card ——
  const brandCardW = inch(2.35);
  const brandCardGap = inch(0.18);
  const legendRightLimit = inch(PAGE_W_IN - MARGIN_IN) - brandCardW - brandCardGap;
  const legendContentW = legendRightLimit - inch(MARGIN_IN);

  ctx.fillStyle = "#0f172a";
  ctx.font = `700 ${Math.round(inch(0.15))}px Helvetica, Arial, sans-serif`;
  ctx.fillText("Neighborhood amenities", inch(MARGIN_IN), y);
  y += inch(0.18);

  const groups = groupAmenitiesByCategory(amenities);
  const colW = (legendContentW - inch(0.16)) / 2;
  const colGap = inch(0.16);
  let col = 0;
  const colY = [y, y];
  const footerReserve = inch(0.08);
  const legendBottom = inch(PAGE_H_IN - MARGIN_IN) - footerReserve;
  const lineH = inch(0.125);
  const swatch = inch(0.095);

  groups.forEach((group) => {
    let cy = colY[col];
    const x0 = inch(MARGIN_IN) + col * (colW + colGap);
    const rgb = group.rgb;

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
      ctx.fillStyle = "#1e293b";
      ctx.font = `400 ${Math.round(inch(0.11))}px Helvetica, Arial, sans-serif`;
      let draw = String(item.name || "");
      while (
        ctx.measureText(draw).width > colW - numW - inch(0.06) &&
        draw.length > 4
      ) {
        draw = `${draw.slice(0, -2)}…`;
      }
      ctx.fillText(draw, x0 + numW + inch(0.035), cy);
      cy += lineH;
    });
    colY[col] = cy + inch(0.08);
    col = colY[0] <= colY[1] ? 0 : 1;
  });

  // Branding card (Winding Way style) — photo + contact + firm logo
  const agentName = str(brand?.name) || str(brand?.agentName) || "Listing agent";
  const agentEmail = str(brand?.email) || str(brand?.agentEmail);
  const agentPhone = str(brand?.phone) || str(brand?.agentPhone);
  const [photoImg, firmLogoImg] = await Promise.all([
    loadOptionalImage(brand?.photoUrl || brand?.photoBase64 || brand?.agentPhotoUrl),
    loadOptionalImage(brand?.logoUrl || brand?.logoBase64 || brand?.agentLogoUrl),
  ]);

  const cardW = brandCardW;
  const cardH = inch(1.55);
  const cardX = inch(PAGE_W_IN - MARGIN_IN) - cardW;
  const cardY = inch(PAGE_H_IN - MARGIN_IN) - cardH;
  const pad = inch(0.08);

  ctx.fillStyle = "#f8fafc";
  roundRect(cardX, cardY, cardW, cardH, inch(0.04));
  ctx.fill();
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.stroke();

  const hasLogo = Boolean(firmLogoImg);
  const logoAreaH = hasLogo ? inch(0.48) : 0;
  const contactAreaH = cardH - pad * 2 - (hasLogo ? logoAreaH + inch(0.06) : 0);
  const contactTop = cardY + pad;

  const photoSize = photoImg ? inch(0.38) : 0;
  if (photoImg) {
    const photoX = cardX + pad;
    const photoY = contactTop + Math.max(0, (contactAreaH - photoSize) / 2);
    const cx = photoX + photoSize / 2;
    const cy = photoY + photoSize / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, photoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(photoImg, photoX, photoY, photoSize, photoSize);
    ctx.restore();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, photoSize / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  const textX = cardX + pad + (photoImg ? photoSize + inch(0.07) : 0);
  const textMaxW = cardX + cardW - pad - textX;
  let textY = contactTop + inch(0.14);
  ctx.fillStyle = "#0f172a";
  ctx.font = `700 ${Math.round(inch(0.115))}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "left";
  let nameDraw = agentName;
  while (ctx.measureText(nameDraw).width > textMaxW && nameDraw.length > 4) {
    nameDraw = `${nameDraw.slice(0, -2)}…`;
  }
  ctx.fillText(nameDraw, textX, textY);
  textY += inch(0.14);
  ctx.fillStyle = "#475569";
  ctx.font = `400 ${Math.round(inch(0.09))}px Helvetica, Arial, sans-serif`;
  if (agentEmail) {
    let emailDraw = agentEmail;
    while (ctx.measureText(emailDraw).width > textMaxW && emailDraw.length > 8) {
      emailDraw = `${emailDraw.slice(0, -2)}…`;
    }
    ctx.fillText(emailDraw, textX, textY);
    textY += inch(0.12);
  }
  if (agentPhone) {
    ctx.fillText(agentPhone, textX, textY);
  }

  if (firmLogoImg) {
    const logoBoxX = cardX + pad;
    const logoBoxW = cardW - pad * 2;
    const logoBoxH = logoAreaH;
    const logoBoxY = cardY + cardH - pad - logoBoxH;
    ctx.fillStyle = "#ffffff";
    roundRect(logoBoxX, logoBoxY, logoBoxW, logoBoxH, inch(0.03));
    ctx.fill();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.stroke();

    const innerPad = inch(0.04);
    const innerW = logoBoxW - innerPad * 2;
    const innerH = logoBoxH - innerPad * 2;
    const ratio = firmLogoImg.height / Math.max(1, firmLogoImg.width);
    let targetH = innerH;
    let targetW = targetH / ratio;
    if (targetW > innerW) {
      targetW = innerW;
      targetH = targetW * ratio;
    }
    const lx = logoBoxX + (logoBoxW - targetW) / 2;
    const ly = logoBoxY + (logoBoxH - targetH) / 2;
    ctx.drawImage(firmLogoImg, lx, ly, targetW, targetH);
  }

  return page.toBuffer("image/png");
}

async function renderNeighborhoodMapPng(opts) {
  return composeLetterPagePng(opts);
}

module.exports = {
  renderNeighborhoodMapPng,
  composeLetterPagePng,
  getMapboxToken,
  LOGICAL_MAP_W,
  LOGICAL_MAP_H,
};
