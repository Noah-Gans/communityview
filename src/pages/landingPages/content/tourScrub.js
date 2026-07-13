/** Scroll-scrub tour — lazy-loaded 4K WebP frames on canvas. */

export const TOUR_SCRUB = {
  frameCount: 351,
  ext: 'webp',
  basePath: '/marketing/tour-frames',
  posterSrc: '/marketing/tour-frames/frame-001.webp',
  scrollHeightVh: 550,
  scrollHeightVhMobile: 460,
};

export const tourScrubChapters = [
  { through: 0.22, caption: 'Zoom into your listing' },
  { through: 0.45, caption: 'Orbit the land with buyers' },
  { through: 0.68, caption: 'Overview map and property context' },
  { through: 1, caption: 'Nearby schools, trails, and amenities' },
];

export function frameSrc(index) {
  const n = String(index + 1).padStart(3, '0');
  return `${TOUR_SCRUB.basePath}/frame-${n}.${TOUR_SCRUB.ext}`;
}

export function captionForProgress(progress) {
  const chapter = tourScrubChapters.find((c) => progress <= c.through);
  return chapter?.caption || tourScrubChapters[tourScrubChapters.length - 1].caption;
}

export function frameIndexForProgress(progress, frameCount = TOUR_SCRUB.frameCount) {
  const max = frameCount - 1;
  return Math.min(max, Math.max(0, Math.round(progress * max)));
}

export const tourScrubPoster = TOUR_SCRUB.posterSrc;

export function createFrameLoader(frameCount = TOUR_SCRUB.frameCount) {
  const cache = new Map();
  const pending = new Map();

  function load(index) {
    const i = Math.max(0, Math.min(frameCount - 1, index));
    const hit = cache.get(i);
    if (hit?.complete && hit.naturalWidth > 0) return Promise.resolve(hit);
    if (pending.has(i)) return pending.get(i);

    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'sync';
      img.onload = () => {
        cache.set(i, img);
        pending.delete(i);
        resolve(img);
      };
      img.onerror = () => {
        pending.delete(i);
        reject(new Error(`Failed to load frame ${i}`));
      };
      img.src = frameSrc(i);
    });

    pending.set(i, promise);
    return promise;
  }

  function getCached(index) {
    const i = Math.max(0, Math.min(frameCount - 1, index));
    const img = cache.get(i);
    return img?.complete && img.naturalWidth > 0 ? img : null;
  }

  function prefetchAround(frameIndex) {
    for (let offset = -2; offset <= 20; offset += 1) {
      load(frameIndex + offset).catch(() => {});
    }
  }

  return { load, getCached, prefetchAround };
}

function containRect(img, width, height) {
  const ir = img.naturalWidth / img.naturalHeight;
  const cr = width / height;
  let dw;
  let dh;
  let dx;
  let dy;

  if (ir > cr) {
    dw = width;
    dh = width / ir;
    dx = 0;
    dy = (height - dh) / 2;
  } else {
    dh = height;
    dw = height * ir;
    dx = (width - dw) / 2;
    dy = 0;
  }

  return { dx, dy, dw, dh };
}

export function drawFrameContain(ctx, img, width, height) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  if (!img?.naturalWidth) return;
  ctx.globalAlpha = 1;
  const { dx, dy, dw, dh } = containRect(img, width, height);
  ctx.drawImage(img, dx, dy, dw, dh);
}
