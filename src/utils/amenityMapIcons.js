import { AMENITY_MAP_CATEGORIES, AMENITY_MAP_CATEGORY_BY_KEY } from './amenityMapCatalog';

/** Same pre-composited disc markers the property tour uses for nearby amenities. */
const BADGE_BASE_PATH = '/tour_nearby_badges';
const PRINT_LOGO_BASE_PATH = '/logos_for_print';
const COMPOSITED_BADGE_PX = 256;

/** Glyph used by the HTML home marker above the property boundary. */
export const AMENITY_HOME_LOGO_URL = `${PRINT_LOGO_BASE_PATH}/house-chimney.svg`;

export function amenityBadgeImageId(amenityKey) {
  return `cv-amenity-badge-${String(amenityKey || '').trim() || 'unknown'}`;
}

/** Public URL for the category badge, or null when the category falls back to a color dot. */
export function amenityBadgeUrl(amenityKey) {
  const category = AMENITY_MAP_CATEGORY_BY_KEY[amenityKey];
  if (!category) return null;
  if (category.badgeFile) return `${BADGE_BASE_PATH}/${category.badgeFile}`;
  if (category.logoFile) return `${PRINT_LOGO_BASE_PATH}/${category.logoFile}`;
  return null;
}

export function amenityHasBadge(amenityKey) {
  const category = AMENITY_MAP_CATEGORY_BY_KEY[amenityKey];
  return Boolean(category?.badgeFile || category?.logoFile);
}

export const AMENITY_MAP_LAYER_IDS = [
  'cv-amenity-map-points',
  'cv-amenity-map-badges',
  'cv-amenity-map-labels',
];

export function isAmenityMapLayerId(layerId) {
  return String(layerId || '').startsWith('cv-amenity-map-');
}

export function ensureAmenityMapLayersOnTop(map) {
  if (!map?.moveLayer) return;
  AMENITY_MAP_LAYER_IDS.forEach((id) => {
    try {
      if (map.getLayer?.(id)) map.moveLayer(id);
    } catch (_) {
      /* style may still be swapping */
    }
  });
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url}`));
    img.src = url;
  });
}

/** Colored disc + white ring + white-tinted print glyph, matching the tour marker treatment. */
async function buildCompositedBadge(logoFile, { fill, stroke = '#ffffff', logoColor = '#ffffff' }) {
  const logoImg = await loadImageElement(`${PRINT_LOGO_BASE_PATH}/${logoFile}`);
  const size = COMPOSITED_BADGE_PX;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d unavailable');

  const center = size / 2;
  const outerRadius = size * 0.46;
  const strokeWidth = Math.max(2, size * 0.028);

  ctx.beginPath();
  ctx.arc(center, center, outerRadius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(center, center, outerRadius - strokeWidth / 2, 0, Math.PI * 2);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.stroke();

  const glyphSize = size * 0.6;
  const glyphOffset = (size - glyphSize) / 2;
  const tint = document.createElement('canvas');
  tint.width = glyphSize;
  tint.height = glyphSize;
  const tintCtx = tint.getContext('2d');
  if (!tintCtx) throw new Error('Canvas 2d unavailable');
  tintCtx.drawImage(logoImg, 0, 0, glyphSize, glyphSize);
  tintCtx.globalCompositeOperation = 'source-in';
  tintCtx.fillStyle = logoColor;
  tintCtx.fillRect(0, 0, glyphSize, glyphSize);
  ctx.drawImage(tint, glyphOffset, glyphOffset, glyphSize, glyphSize);

  return loadImageElement(canvas.toDataURL('image/png'));
}

async function registerImage(map, imageId, loader) {
  if (!map || typeof map.addImage !== 'function') return false;
  if (map.hasImage?.(imageId)) return true;
  let img;
  try {
    img = await loader();
  } catch (_) {
    return false;
  }
  try {
    if (map.hasImage?.(imageId)) return true;
    map.addImage(imageId, img, { pixelRatio: 1 });
  } catch (_) {
    return false;
  }
  return true;
}

/**
 * Registers every available amenity badge on the map style.
 * Prefers pre-made badge PNGs; otherwise composites `logoFile` onto the category color disc.
 * The property home pin is an HTML overlay (above print boundaries), not a Mapbox symbol.
 */
export async function loadAmenityMapIcons(map) {
  const loaded = new Set();
  if (!map) return loaded;
  await Promise.all(
    AMENITY_MAP_CATEGORIES.map(async (category) => {
      const ok = await registerImage(map, amenityBadgeImageId(category.key), async () => {
        if (category.recolorBadge && category.logoFile) {
          return buildCompositedBadge(category.logoFile, { fill: category.color || '#334155' });
        }
        if (category.badgeFile) {
          try {
            return await loadImageElement(`${BADGE_BASE_PATH}/${category.badgeFile}`);
          } catch (_) {
            // Fall through to logo compositing when the PNG is not present yet.
          }
        }
        if (category.logoFile) {
          return buildCompositedBadge(category.logoFile, { fill: category.color || '#334155' });
        }
        throw new Error(`No badge asset for ${category.key}`);
      });
      if (ok) loaded.add(category.key);
    })
  );
  return loaded;
}
