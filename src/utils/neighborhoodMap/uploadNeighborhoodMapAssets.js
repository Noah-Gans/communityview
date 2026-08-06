/**
 * Upload neighborhood map PDF + PNG for a listing (Content kit Ready state).
 */
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase/firebaseConfig';

function dataUrlToBlob(dataUrl) {
  const raw = String(dataUrl || '');
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid neighborhood map data URL.');
  const contentType = match[1] || 'application/octet-stream';
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

/**
 * @param {string} uid
 * @param {string} mapId
 * @param {{ pdfDataUrl: string, pngDataUrl: string, title?: string }} assets
 * @returns {Promise<{ pdfUrl: string, pngUrl: string, pdfPath: string, pngPath: string, generatedAt: number, title: string }>}
 */
export async function uploadNeighborhoodMapAssets(uid, mapId, assets = {}) {
  const userId = String(uid || '').trim();
  const id = String(mapId || '').trim();
  if (!userId) throw new Error('You must be signed in to save the neighborhood map.');
  if (!id) throw new Error('Missing map id for neighborhood map upload.');

  const stamp = Date.now();
  const base = `users/${userId}/maps/${id}/neighborhood`;
  const pdfPath = `${base}/neighborhood-map-${stamp}.pdf`;
  const pngPath = `${base}/neighborhood-map-${stamp}.png`;

  const pdfBlob = dataUrlToBlob(assets.pdfDataUrl);
  const pngBlob = dataUrlToBlob(assets.pngDataUrl);

  const pdfRef = ref(storage, pdfPath);
  const pngRef = ref(storage, pngPath);

  await Promise.all([
    uploadBytes(pdfRef, pdfBlob, {
      contentType: 'application/pdf',
      cacheControl: 'public,max-age=86400',
    }),
    uploadBytes(pngRef, pngBlob, {
      contentType: 'image/png',
      cacheControl: 'public,max-age=86400',
    }),
  ]);

  const [pdfUrl, pngUrl] = await Promise.all([getDownloadURL(pdfRef), getDownloadURL(pngRef)]);

  return {
    pdfUrl,
    pngUrl,
    pdfPath,
    pngPath,
    generatedAt: stamp,
    title: String(assets.title || '').trim() || 'Neighborhood map',
  };
}
