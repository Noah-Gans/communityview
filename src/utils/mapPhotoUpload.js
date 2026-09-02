import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase/firebaseConfig';
import { prepareMapPhotoForUpload } from './mapPhotoStorage';

const extensionForType = (type) => {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
};

/**
 * @param {string} uid
 * @param {File} file
 * @param {{ mapId?: string | null }} [options]
 * @returns {Promise<{ url: string, storagePath: string }>}
 */
export async function uploadMapPhoto(uid, file, options = {}) {
  const prepared = await prepareMapPhotoForUpload(file);

  const userId = String(uid || '').trim();
  if (!userId) throw new Error('You must be signed in to upload images.');

  const mapId = options.mapId ? String(options.mapId).trim() : '';
  const assetId = `photo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const ext = extensionForType(prepared.type);
  const storagePath = mapId
    ? `users/${userId}/maps/${mapId}/photos/${assetId}.${ext}`
    : `users/${userId}/map-assets/${assetId}.${ext}`;

  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, prepared, {
    contentType: prepared.type || 'image/jpeg',
    cacheControl: 'public,max-age=86400',
  });
  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

/** @param {string | null | undefined} storagePath */
export async function deleteMapPhoto(storagePath) {
  const path = String(storagePath || '').trim();
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[mapPhotoUpload] delete failed:', path, err);
    }
  }
}
