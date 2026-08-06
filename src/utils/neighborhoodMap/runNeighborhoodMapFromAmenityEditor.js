/**
 * Build neighborhood PDF/PNG from the amenity map editor (live map + curated places).
 */
import { featuresFromPrintElements } from '../featuresFromPrintElements';
import { mapService } from '../../services/mapService';
import { getMapShareUrls } from '../mapShareLinks';
import { buildTourNearbyCacheForSave } from '../tourNearbyFirestore';
import { TOUR_NEARBY_DATA_VERSION } from '../tourNearbyRanking';
import { captureNeighborhoodMapFrame } from './captureNeighborhoodMap';
import { composeNeighborhoodMapOutputs } from './composeNeighborhoodMapPdf';
import { numberedAmenitiesFromFeatures } from './neighborhoodAmenities';
import { snapshotsFromSelectedFeatures } from './runNeighborhoodMapGeneration';
import { uploadNeighborhoodMapAssets } from './uploadNeighborhoodMapAssets';

const str = (v) => String(v == null ? '' : v).trim();

function snapshotsFromHome(homePosition, title) {
  const lng = Number(homePosition?.lng);
  const lat = Number(homePosition?.lat);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  return [
    {
      address: str(title) || 'Home',
      apn: '',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      seed: {},
    },
  ];
}

/**
 * @param {{
 *   map: object,
 *   mapRef?: { current?: object },
 *   mapData: object,
 *   visibleFeatures: object[],
 *   byAmenityEntries?: Record<string, object>,
 *   homePosition?: { lat: number, lng: number }|null,
 *   title?: string,
 *   user?: object,
 *   userProfile?: object,
 *   framingMode?: 'auto'|'custom',
 *   download?: boolean,
 *   persistAssets?: boolean,
 *   onStatus?: Function,
 *   basemapId?: string|null,
 *   restoreBasemapId?: string|null,
 * }} opts
 */
export async function runNeighborhoodMapFromAmenityEditor({
  map,
  mapRef,
  mapData,
  visibleFeatures,
  byAmenityEntries,
  homePosition,
  title,
  user,
  userProfile,
  framingMode = 'auto',
  download = true,
  persistAssets = true,
  onStatus,
  basemapId = null,
  restoreBasemapId = null,
} = {}) {
  const report = typeof onStatus === 'function' ? onStatus : () => {};

  let snapshots = snapshotsFromSelectedFeatures(
    featuresFromPrintElements(mapData?.printElements || [])
  );
  if (!snapshots.length) {
    snapshots = snapshotsFromHome(homePosition, title || mapData?.title);
  }
  if (!snapshots.length) {
    throw new Error(
      'Could not find a property location. Add a parcel boundary on the listing map, or set the home pin.'
    );
  }

  const amenities = numberedAmenitiesFromFeatures(visibleFeatures);
  if (!amenities.length) {
    throw new Error('Turn on at least one amenity place before generating the PDF.');
  }

  const docTitle = str(title) || str(mapData?.title) || 'Neighborhood map';
  const placeLabel =
    snapshots.length === 1
      ? snapshots[0].address || docTitle
      : `${snapshots.length} parcels`;

  report(`Preparing PDF (${amenities.length} places)…`);

  const captureBasemap =
    str(basemapId) || str(restoreBasemapId) || 'outdoors-v12';

  let mapDataUrl;
  try {
    mapDataUrl = await captureNeighborhoodMapFrame({
      map,
      snapshots,
      amenities,
      basemapId: captureBasemap,
      homePosition,
      framingMode,
      onStatus: report,
    });
  } finally {
    const restoreId = str(restoreBasemapId) || captureBasemap;
    if (restoreId && typeof window.applyBasemapById === 'function') {
      try {
        window.applyBasemapById(restoreId);
      } catch (_) {
        /* ignore */
      }
    }
  }

  const profileName = [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ');
  const brand = {
    name:
      str(userProfile?.displayName) ||
      str(userProfile?.name) ||
      str(profileName) ||
      str(user?.displayName) ||
      'Listing agent',
    email:
      str(userProfile?.contactEmail) ||
      str(userProfile?.email) ||
      str(user?.email),
    phone:
      str(userProfile?.contactPhone) ||
      str(userProfile?.phone) ||
      str(userProfile?.phoneNumber),
    photoUrl: str(userProfile?.profilePhotoUrl),
    logoUrl: str(userProfile?.firmLogoUrl),
  };

  const shareToken = str(mapData?.shareToken);
  const mapId = str(mapData?.id);
  const shareUrl = shareToken ? getMapShareUrls(shareToken).amenities : '';

  if (shareToken && byAmenityEntries && Object.keys(byAmenityEntries).length) {
    try {
      const center = homePosition || {
        lat: amenities[0].lat,
        lng: amenities[0].lng,
      };
      const keys = Object.keys(byAmenityEntries);
      const payload = buildTourNearbyCacheForSave(center, byAmenityEntries, 8000, keys, {
        allowEmpty: true,
        homeMarker: homePosition || center,
        amenityMapBasemap: captureBasemap,
      });
      if (payload) {
        await mapService.saveTourNearbyCache(
          shareToken,
          {
            ...payload,
            dataVersion: TOUR_NEARBY_DATA_VERSION,
          },
          undefined,
          {
            basemap: captureBasemap,
            homeMarker: homePosition || center,
          },
          { amenityEditor: true }
        );
      }
    } catch (err) {
      console.warn('Neighborhood editor amenity save failed:', err);
    }
  }

  report('Building PDF & PNG…');
  const outputs = await composeNeighborhoodMapOutputs({
    title: docTitle,
    placeLabel,
    mapDataUrl,
    amenities,
    shareUrl,
    brand,
    download,
  });

  let neighborhoodMapAssets = null;
  if (persistAssets && mapId && user?.uid && outputs.pdfDataUrl && outputs.pngDataUrl) {
    try {
      report('Saving neighborhood map files…');
      neighborhoodMapAssets = await uploadNeighborhoodMapAssets(user.uid, mapId, {
        pdfDataUrl: outputs.pdfDataUrl,
        pngDataUrl: outputs.pngDataUrl,
        title: docTitle,
      });
      await mapService.updateMap(mapId, { neighborhoodMapAssets });
    } catch (err) {
      console.warn('Neighborhood map asset persist failed:', err);
      report('Could not persist files — downloads still available.');
    }
  }

  report('Done');
  return {
    ...outputs,
    title: docTitle,
    shareUrl,
    shareToken,
    mapId,
    amenityCount: amenities.length,
    neighborhoodMapAssets,
    mapRef,
  };
}
