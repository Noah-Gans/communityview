/**
 * Neighborhood map generation pipeline.
 * Parcel → amenities (shared listing cache / Places) → streets capture → PDF/PNG.
 * Batch tooling stays sales-only; Content kit uses existingMapId to attach assets to the listing.
 */
import { isRegridParcelPolygonFeature } from '../regridParcelBoundary';
import { featuresFromPrintElements } from '../featuresFromPrintElements';
import { mapService } from '../../services/mapService';
import { getMapShareUrls } from '../mapShareLinks';
import { buildTourNearbyCacheForSave } from '../tourNearbyFirestore';
import { TOUR_NEARBY_DATA_VERSION } from '../tourNearbyRanking';
import { fetchNeighborhoodAmenities } from './fetchNeighborhoodAmenities';
import { captureNeighborhoodMapFrame } from './captureNeighborhoodMap';
import { composeNeighborhoodMapOutputs } from './composeNeighborhoodMapPdf';
import { buildNeighborhoodPrintElements } from './buildNeighborhoodPrintElements';
import { uploadNeighborhoodMapAssets } from './uploadNeighborhoodMapAssets';

const str = (v) => String(v == null ? '' : v).trim();

export function snapshotsFromSelectedFeatures(features) {
  const out = [];
  const seen = new Set();
  (features || []).forEach((f) => {
    if (!isRegridParcelPolygonFeature(f)) return;
    const p = f.properties || {};
    const snap = {
      ll_uuid: str(p.ll_uuid),
      path: str(p.path),
      owner: str(p.owner || p.owner2),
      address: str(p.address || p.situs_address || p.physaddr),
      apn: str(p.parcelnumb || p.county_parcel_id || p.apn),
      geometry: f.geometry,
      seed: { ...p },
    };
    const key =
      snap.ll_uuid ||
      snap.path ||
      snap.apn ||
      JSON.stringify(snap.geometry?.coordinates?.[0]?.[0]);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(snap);
  });
  return out;
}

function centroidFromSnapshots(snapshots) {
  const first = (snapshots || []).find((s) => s?.geometry);
  if (!first?.geometry) return null;
  const coords = first.geometry.coordinates;
  if (first.geometry.type === 'Point') {
    return { lng: coords[0], lat: coords[1] };
  }
  const ring =
    first.geometry.type === 'Polygon'
      ? coords[0]
      : first.geometry.type === 'MultiPolygon'
        ? coords[0]?.[0]
        : null;
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  ring.forEach((c) => {
    if (Array.isArray(c) && c.length >= 2) {
      sx += Number(c[0]);
      sy += Number(c[1]);
      n += 1;
    }
  });
  if (!n) return null;
  return { lng: sx / n, lat: sy / n };
}

function defaultTitleFromSnapshots(snapshots) {
  if (!snapshots?.length) return 'Neighborhood map';
  if (snapshots.length === 1) {
    return snapshots[0].address || snapshots[0].apn || 'Neighborhood map';
  }
  return `${snapshots.length} parcels — neighborhood map`;
}

/**
 * Full pipeline. Address-only API can call the same helpers later (geocode → snapshots).
 */
export async function runNeighborhoodMapGeneration({
  features,
  printElements,
  title,
  map,
  mapRef,
  user,
  userProfile,
  setLayerStatus,
  onStatus,
  existingTourNearbyCache = null,
  existingMapId = '',
  existingShareToken = '',
  download = true,
  saveNewShareMap = true,
  persistAssets = true,
  framingMode = 'auto',
} = {}) {
  const report = (msg) => {
    if (typeof onStatus === 'function') onStatus(msg);
  };

  let snapshots = snapshotsFromSelectedFeatures(features);
  if (!snapshots.length && printElements?.length) {
    snapshots = snapshotsFromSelectedFeatures(featuresFromPrintElements(printElements));
  }
  if (!snapshots.length) {
    throw new Error(
      'No parcels found on this listing. Add parcel boundaries, save, then generate again.'
    );
  }

  const center = centroidFromSnapshots(snapshots);
  if (!center) throw new Error('Could not determine a location from the selected parcel.');

  const docTitle = str(title) || defaultTitleFromSnapshots(snapshots);
  const placeLabel = snapshots.length === 1 ? snapshots[0].address || '' : `${snapshots.length} parcels`;

  report(
    snapshots.length === 1
      ? 'Preparing neighborhood map…'
      : `Preparing neighborhood map (${snapshots.length} parcels)…`
  );

  const amenitiesResult = await fetchNeighborhoodAmenities(center, {
    onStatus: report,
    address: docTitle,
    placeLabel,
    existingTourNearbyCache,
  });
  const amenities = amenitiesResult.selected || [];
  if (!amenities.length) {
    throw new Error(
      amenitiesResult.fetchErrors?.[0] ||
        'No nearby amenities found for this location. Try another parcel or check Places API key.'
    );
  }
  report(
    amenitiesResult.fromListingCache
      ? `Using listing amenities (${amenities.length} places)…`
      : amenitiesResult.fromCache
        ? `Using cached amenities (${amenities.length} places)…`
        : `Selected ${amenities.length} amenities (close · high rated · well reviewed)…`
  );

  const cachedHome = existingTourNearbyCache?.homeMarker;
  const homeLat = Number(cachedHome?.lat);
  const homeLng = Number(cachedHome?.lng);
  const homePosition =
    Number.isFinite(homeLat) && Number.isFinite(homeLng)
      ? { lat: homeLat, lng: homeLng }
      : center;

  if (typeof setLayerStatus === 'function') {
    setLayerStatus((prev) => ({
      ...prev,
      ownership: false,
      wetlands: false,
      soil: false,
      surface_water: false,
      public_land: false,
      boundaries_places: false,
    }));
  }

  // Let React apply ownership:false before capture.
  await new Promise((r) => window.setTimeout(r, 400));

  const mapDataUrl = await captureNeighborhoodMapFrame({
    map,
    snapshots,
    amenities,
    basemapId: 'outdoors-v12',
    homePosition,
    onStatus: report,
    framingMode: framingMode === 'custom' ? 'custom' : 'auto',
  });

  const fittedZoom =
    map && typeof map.getZoom === 'function' ? map.getZoom() : 14.5;
  const neighborhoodPrintElements = buildNeighborhoodPrintElements(snapshots, amenities, {
    forShare: true,
    zoom: fittedZoom,
    homePosition: homePosition || null,
  });

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

  let shareUrl = '';
  let shareToken = str(existingShareToken);
  let mapId = str(existingMapId);

  const tourNearbyCache = buildTourNearbyCacheForSave(
    center,
    amenitiesResult.byAmenity,
    amenitiesResult.searchRadiusMeters,
    Object.keys(amenitiesResult.byAmenity || {}),
    { allowEmpty: true, homeMarker: homePosition }
  );

  if (shareToken) {
    shareUrl = getMapShareUrls(shareToken).amenities;
    if (tourNearbyCache && !amenitiesResult.fromListingCache) {
      try {
        report('Saving amenities on this listing…');
        await mapService.saveTourNearbyCache(shareToken, {
          ...tourNearbyCache,
          dataVersion: TOUR_NEARBY_DATA_VERSION,
        });
      } catch (err) {
        console.warn('Neighborhood amenity cache save failed:', err);
      }
    }
  } else if (saveNewShareMap && user && mapRef?.current) {
    report('Saving shareable neighborhood map…');
    try {
      const serialized = mapService.serializeMapState(
        {
          schemaVersion: 2,
          basemap: 'streets-v11',
          layerStatus: { ownership: false },
          layerOrder: [],
          layerLabels: {},
          paperSize: 'full',
          printElements: neighborhoodPrintElements,
          currentBasemapId: 'streets-v11',
          activeBasemapIdRef: { current: 'streets-v11' },
        },
        mapRef
      );

      const saveResult = await mapService.saveMap({
        title: docTitle,
        description: `Neighborhood amenities map for ${placeLabel || docTitle}`,
        ...serialized,
        basemap: 'streets-v11',
        printElements: neighborhoodPrintElements,
        isPublic: true,
        ...(tourNearbyCache
          ? {
              tourNearbyCache: {
                ...tourNearbyCache,
                dataVersion: TOUR_NEARBY_DATA_VERSION,
              },
            }
          : {}),
      });
      mapId = saveResult?.mapId || '';
      shareToken = saveResult?.shareToken || '';
      if (shareToken) {
        shareUrl = getMapShareUrls(shareToken).amenities;
      }
    } catch (err) {
      console.warn('Neighborhood share map save failed:', err);
      report('Share map save failed — continuing with PDF/PNG…');
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
      report('Could not persist files — downloads still available this session.');
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
    fromAmenityCache: amenitiesResult.fromCache === true,
    fromListingCache: amenitiesResult.fromListingCache === true,
    amenities,
    tourNearbyCache: tourNearbyCache
      ? { ...tourNearbyCache, dataVersion: TOUR_NEARBY_DATA_VERSION }
      : null,
    neighborhoodMapAssets,
  };
}
