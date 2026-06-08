import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/firebaseConfig';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const extensionForType = (type) => {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
};

export const validateProfileImageFile = (file) => {
  if (!file) return 'No file selected.';
  if (!ALLOWED_TYPES.has(file.type)) {
    return 'Use a JPG, PNG, or WebP image.';
  }
  if (file.size > MAX_BYTES) {
    return 'Image must be 5 MB or smaller.';
  }
  return null;
};

/**
 * @param {string} uid
 * @param {'photo' | 'firm-logo'} kind
 * @param {File} file
 * @returns {Promise<string>} download URL
 */
export const uploadProfileImage = async (uid, kind, file) => {
  const validationError = validateProfileImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const ext = extensionForType(file.type);
  const fileName = kind === 'photo' ? `photo.${ext}` : `firm-logo.${ext}`;
  const path = `users/${uid}/profile/${fileName}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    cacheControl: 'public,max-age=3600',
  });

  return getDownloadURL(storageRef);
};
