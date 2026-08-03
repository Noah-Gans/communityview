import { mapService } from '../services/mapService';

export function getMapShareUrls(shareToken) {
  if (!shareToken) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return {
    client: `${origin}/view/${shareToken}`,
    tour: `${origin}/tour/${shareToken}?basemap=imagery-3d`,
    amenities: `${origin}/amenities/${shareToken}`,
    amenitiesEdit: `${origin}/amenities/${shareToken}?edit=1`,
  };
}

export async function ensureMapIsPublic(mapId, isPublic, onMapsUpdated) {
  if (!mapId || isPublic) return;
  await mapService.updateMap(mapId, { isPublic: true });
  await onMapsUpdated?.();
}

export async function copyMapShareLink({ mapId, isPublic, url, onMapsUpdated }) {
  if (!url) throw new Error('This map does not have a share link yet.');
  await ensureMapIsPublic(mapId, isPublic, onMapsUpdated);
  await navigator.clipboard.writeText(url);
}

export async function openMapSharePreview(url, { mapId, isPublic, onMapsUpdated }) {
  if (!url) throw new Error('This map does not have a share link yet.');
  await ensureMapIsPublic(mapId, isPublic, onMapsUpdated);
  window.open(url, '_blank', 'noopener,noreferrer');
}
