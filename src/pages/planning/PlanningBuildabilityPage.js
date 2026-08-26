import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as turf from '@turf/turf';
import { useLocation } from 'react-router-dom';
import { useMapContext } from '../MapContext';
import {
  fetchParcelGeoJsonFeatureByLlUuid,
  fetchRegridParcelRecord,
} from '../../utils/regridParcelApi';
import {
  detectPrimaryStreetBearingFromMap,
  detectPrimaryStreetBearingHeuristic,
  insetParcelBySetbacks,
} from '../../utils/zoning/insetSetbacks';
import { resolveZoneRulesFromParcel } from '../../utils/zoning/resolveZoneRules';
import kellyDemoParcel from '../../data/zoning/demos/kelly-240-e.json';
import './PlanningBuildabilityPage.css';

const PARCEL_SOURCE = 'cv-planning-parcel';
const ENVELOPE_SOURCE = 'cv-planning-envelope';
const DIMENSION_SOURCE = 'cv-planning-dimensions';
const KELLY_UUID = '660b8f1c-5b23-48df-afd3-2f66f2bc9d05';

/** True Polygon/MultiPolygon only — Regrid detail (return_geometry=false) has no geometry. */
function isParcelPolygonGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') return false;
  const t = geometry.type;
  if (t !== 'Polygon' && t !== 'MultiPolygon') return false;
  try {
    const area = turf.area(turf.feature(geometry));
    return Number.isFinite(area) && area > 1;
  } catch {
    return false;
  }
}

function exteriorVertexCount(geometry) {
  try {
    if (geometry.type === 'Polygon') return geometry.coordinates?.[0]?.length || 0;
    if (geometry.type === 'MultiPolygon') {
      return (geometry.coordinates || []).reduce(
        (sum, poly) => sum + (poly?.[0]?.length || 0),
        0
      );
    }
  } catch {
    /* ignore */
  }
  return 0;
}

/** Only replace current outline when the candidate is clearly better. */
function shouldUpgradeParcelGeometry(current, candidate) {
  if (!isParcelPolygonGeometry(candidate)) return false;
  if (!isParcelPolygonGeometry(current)) return true;
  const curVerts = exteriorVertexCount(current);
  const nextVerts = exteriorVertexCount(candidate);
  let curArea = 0;
  let nextArea = 0;
  try {
    curArea = turf.area(turf.feature(current));
    nextArea = turf.area(turf.feature(candidate));
  } catch {
    return false;
  }
  // Unclip: candidate covers meaningfully more land (tile fragment → full parcel).
  if (nextArea > curArea * 1.12) return true;
  // Same footprint-ish: keep / take the more detailed ring, never a 4-corner downgrade.
  if (nextArea >= curArea * 0.85 && nextVerts > curVerts + 2) return true;
  return false;
}

function buildParcelFeature(geometry, properties = {}, extras = {}) {
  const llUuid = properties.ll_uuid || properties.GFI || null;
  const edgeHints = properties.edgeHints ? { ...properties.edgeHints } : {};
  return {
    type: 'Feature',
    geometry,
    properties: {
      ...properties,
      ...(llUuid ? { ll_uuid: llUuid, GFI: properties.GFI || llUuid } : {}),
      edgeHints,
    },
    layer: { id: 'regrid-parcels-layer' },
    ...extras,
  };
}

function ensurePlanningLayers(map) {
  if (!map) return false;
  if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return false;
  if (!map.getSource(PARCEL_SOURCE)) {
    map.addSource(PARCEL_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getSource(ENVELOPE_SOURCE)) {
    map.addSource(ENVELOPE_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getSource(DIMENSION_SOURCE)) {
    map.addSource(DIMENSION_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer('cv-planning-parcel-fill')) {
    map.addLayer({
      id: 'cv-planning-parcel-fill',
      type: 'fill',
      source: PARCEL_SOURCE,
      paint: { 'fill-color': '#0f172a', 'fill-opacity': 0.12 },
    });
  }
  if (!map.getLayer('cv-planning-parcel-line')) {
    map.addLayer({
      id: 'cv-planning-parcel-line',
      type: 'line',
      source: PARCEL_SOURCE,
      paint: { 'line-color': '#0f172a', 'line-width': 2.5 },
    });
  }
  if (!map.getLayer('cv-planning-envelope-fill')) {
    map.addLayer({
      id: 'cv-planning-envelope-fill',
      type: 'fill',
      source: ENVELOPE_SOURCE,
      paint: { 'fill-color': '#16a34a', 'fill-opacity': 0.32 },
    });
  }
  if (!map.getLayer('cv-planning-envelope-line')) {
    map.addLayer({
      id: 'cv-planning-envelope-line',
      type: 'line',
      source: ENVELOPE_SOURCE,
      paint: {
        'line-color': '#15803d',
        'line-width': 2.5,
        'line-dasharray': [1.4, 1.2],
      },
    });
  }
  if (!map.getLayer('cv-planning-dimension-line')) {
    map.addLayer({
      id: 'cv-planning-dimension-line',
      type: 'line',
      source: DIMENSION_SOURCE,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': '#b45309',
        'line-width': 1.5,
        'line-dasharray': [2, 1],
      },
    });
  }
  if (!map.getLayer('cv-planning-dimension-label')) {
    map.addLayer({
      id: 'cv-planning-dimension-label',
      type: 'symbol',
      source: DIMENSION_SOURCE,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 12,
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-allow-overlap': true,
        'text-offset': [0, 0],
      },
      paint: {
        'text-color': '#92400e',
        'text-halo-color': '#fffbeb',
        'text-halo-width': 1.5,
      },
    });
  }
  return true;
}

function removePlanningLayers(map) {
  if (!map) return;
  try {
    if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return;
    [
      'cv-planning-dimension-label',
      'cv-planning-dimension-line',
      'cv-planning-envelope-line',
      'cv-planning-envelope-fill',
      'cv-planning-parcel-line',
      'cv-planning-parcel-fill',
    ].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    [DIMENSION_SOURCE, ENVELOPE_SOURCE, PARCEL_SOURCE].forEach((id) => {
      if (map.getSource(id)) map.removeSource(id);
    });
  } catch {
    /* style loading */
  }
}

function applyResolvedZoning(props, setActiveRules, setZoningError, setZoningShown) {
  const resolved = resolveZoneRulesFromParcel(props || {});
  if (!resolved.ok) {
    setActiveRules(null);
    setZoningShown(false);
    setZoningError(resolved.error);
    return;
  }
  setZoningError('');
  setActiveRules(resolved.rules);
  setZoningShown(true);
}

function resolveIncomingParcel({
  planningTargetParcel,
  planningParcelFromState,
  pendingPlanningParcelRef,
  fromShowZoning,
}) {
  const fromRef = pendingPlanningParcelRef?.current;
  if (fromRef) {
    pendingPlanningParcelRef.current = null;
  }

  const candidates = [
    planningTargetParcel,
    planningParcelFromState,
    fromRef,
  ].filter((f) => f?.geometry);

  if (candidates.length > 0) return { feature: candidates[0], fromMap: true };

  if (fromShowZoning) return { feature: null, fromMap: true };

  // Direct /planning tab visit with no selected parcel — demo only (Kelly faces south).
  return {
    feature: buildParcelFeature(
      kellyDemoParcel.geometry,
      {
        ...kellyDemoParcel.properties,
        ll_uuid: kellyDemoParcel.properties.ll_uuid || KELLY_UUID,
        edgeHints: { primaryStreetBearing: 180 },
      },
      { bbox: turf.bbox(kellyDemoParcel) }
    ),
    fromMap: false,
  };
}

export default function PlanningBuildabilityPage() {
  const location = useLocation();
  const fromShowZoning = location.state?.fromShowZoning;
  const planningParcelFromState = location.state?.planningParcel;
  const {
    mapRef,
    pendingPlanningParcelRef,
    planningTargetParcel,
    setLayerStatus,
  } = useMapContext();

  const [panelMinimized, setPanelMinimized] = useState(false);
  const [parcel, setParcel] = useState(null);
  const [parcelStatus, setParcelStatus] = useState('Loading parcel…');
  const [zoningShown, setZoningShown] = useState(false);
  const [activeRules, setActiveRules] = useState(null);
  const [zoningError, setZoningError] = useState('');
  const [edgeInfo, setEdgeInfo] = useState([]);
  const [frontageBearing, setFrontageBearing] = useState(null);
  const [frontageStatus, setFrontageStatus] = useState('');
  /** Keep last successful setback draw so a bad refresh doesn't blank the green envelope. */
  const lastGoodEnvelopeRef = useRef({ envelope: null, dimensionFeatures: [], parcelId: null });
  const parcelId =
    parcel?.properties?.ll_uuid || parcel?.properties?.GFI || parcel?.properties?.parcelnumb || null;

  const regridZoneCode =
    parcel?.properties?.zoning ||
    parcel?.properties?.zoning_code ||
    activeRules?.zoneCode ||
    '—';

  const setbacks = activeRules?.geo?.primaryBuildingSetbacksFt || null;

  // Resolve primary-street facing once per parcel id (avoid null→value flash).
  useEffect(() => {
    if (!parcel?.geometry || !parcelId) return undefined;
    let cancelled = false;
    let attempts = 0;

    const resolve = () => {
      if (cancelled) return;
      const hinted = parcel.properties?.edgeHints?.primaryStreetBearing;
      if (typeof hinted === 'number' && Number.isFinite(hinted)) {
        setFrontageBearing(hinted);
        setFrontageStatus(`Frontage bearing ${Math.round(hinted)}° (from parcel hint)`);
        return;
      }

      const map = mapRef?.current;
      const fromRoads =
        map && map.isStyleLoaded?.()
          ? detectPrimaryStreetBearingFromMap(map, parcel)
          : null;
      if (fromRoads != null) {
        setFrontageBearing(fromRoads);
        setFrontageStatus(
          `Frontage from nearby road (bearing ${Math.round(fromRoads)}°)`
        );
        return;
      }

      if (attempts < 12 && map && !map.isStyleLoaded?.()) {
        attempts += 1;
        window.setTimeout(resolve, 300);
        return;
      }

      const heuristic = detectPrimaryStreetBearingHeuristic(parcel);
      setFrontageBearing(heuristic);
      setFrontageStatus(
        `Frontage estimated from lot shape (bearing ${Math.round(heuristic)}°) — Streets basemap improves this`
      );
    };

    resolve();
    return () => {
      cancelled = true;
    };
    // Only re-detect when the parcel identity changes (or manual edgeHints update).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    parcelId,
    parcel?.properties?.edgeHints?.primaryStreetBearing,
    mapRef,
  ]);

  const envelopeResult = useMemo(() => {
    if (!zoningShown || !setbacks || !parcel) {
      return {
        envelope: null,
        edgeClassifications: [],
        dimensionFeatures: [],
        primaryStreetBearing: frontageBearing,
      };
    }
    // Always have a bearing so the envelope doesn't blank while detection runs.
    const bearing =
      frontageBearing ?? detectPrimaryStreetBearingHeuristic(parcel);
    return insetParcelBySetbacks(parcel, setbacks, bearing);
  }, [parcel, setbacks, zoningShown, frontageBearing]);

  // Load the clicked parcel once per Show-zoning intent. Do not re-seed when URL sync
  // rewrites search (that used to wipe route state and bounce the highlight).
  useEffect(() => {
    let cancelled = false;

    const { feature: incoming, fromMap } = resolveIncomingParcel({
      planningTargetParcel,
      planningParcelFromState,
      pendingPlanningParcelRef,
      fromShowZoning,
    });

    if (!incoming?.geometry) {
      setParcel(null);
      setParcelStatus('No parcel — select one on the map and click Show zoning.');
      setActiveRules(null);
      setZoningShown(false);
      setZoningError(fromShowZoning ? 'Missing parcel from map selection.' : '');
      return undefined;
    }

    const seed = buildParcelFeature(
      incoming.geometry,
      incoming.properties || {},
      incoming.bbox ? { bbox: incoming.bbox } : {}
    );
    const seedUuid = seed.properties?.ll_uuid || seed.properties?.GFI || null;

    setParcel((prev) => {
      const prevUuid = prev?.properties?.ll_uuid || prev?.properties?.GFI || null;
      // Same parcel already loaded — keep current geometry/zoning; API refresh may still run.
      if (prevUuid && seedUuid && String(prevUuid) === String(seedUuid) && prev?.geometry) {
        return prev;
      }
      return seed;
    });
    setParcelStatus(
      fromMap
        ? 'Parcel from map selection (Regrid)'
        : 'Demo parcel — pick a parcel on the map and click Show zoning'
    );
    applyResolvedZoning(seed.properties, setActiveRules, setZoningError, setZoningShown);

    if (!seedUuid) return undefined;

    (async () => {
      try {
        // Detail has zoning fields but no geometry. Boundary comes only from the
        // geometry preset (or the map seed) — never from detail stubs.
        const [detailSettled, geometrySettled] = await Promise.allSettled([
          fetchRegridParcelRecord({
            ll_uuid: seedUuid,
            path: seed.properties?.path,
            preset: 'detail',
            seed: seed.properties || {},
          }),
          fetchParcelGeoJsonFeatureByLlUuid(seedUuid),
        ]);
        if (cancelled) return;

        const result = detailSettled.status === 'fulfilled' ? detailSettled.value : null;
        const geometryFeat =
          geometrySettled.status === 'fulfilled' ? geometrySettled.value : null;
        const merged = result?.merged || {};
        const apiUuid =
          merged.ll_uuid ||
          result?.feature?.properties?.ll_uuid ||
          result?.feature?.properties?.GFI;
        if (apiUuid && String(apiUuid) !== String(seedUuid)) return;

        const boundaryFromApi = isParcelPolygonGeometry(geometryFeat?.geometry)
          ? geometryFeat.geometry
          : null;

        if (boundaryFromApi || Object.keys(merged).length > 0) {
          setParcel((prev) => {
            const prevProps = prev?.properties || seed.properties || {};
            const currentGeom = prev?.geometry || seed.geometry;
            const geometry =
              boundaryFromApi && shouldUpgradeParcelGeometry(currentGeom, boundaryFromApi)
                ? boundaryFromApi
                : currentGeom;
            if (!geometry) return prev;
            return buildParcelFeature(
              geometry,
              {
                ...prevProps,
                ...merged,
                zoning: merged.zoning || prevProps.zoning || seed.properties.zoning,
                zoning_code:
                  merged.zoning_code || prevProps.zoning_code || seed.properties.zoning_code,
                ll_uuid: seedUuid,
                approx: false,
                edgeHints: prevProps.edgeHints || seed.properties?.edgeHints || {},
              },
              { bbox: turf.bbox({ type: 'Feature', geometry, properties: {} }) }
            );
          });
        }

        if (result) {
          setParcelStatus('Using live Regrid parcel + zoning fields');
          const resolved = resolveZoneRulesFromParcel({
            ...seed.properties,
            ...merged,
            zoning: merged.zoning || seed.properties.zoning,
          });
          if (resolved.ok) {
            setZoningError('');
            setActiveRules(resolved.rules);
            setZoningShown(true);
          }
        } else if (boundaryFromApi) {
          setParcelStatus('Using full Regrid parcel boundary');
        } else if (detailSettled.status === 'rejected') {
          setParcelStatus(
            `Using map parcel geometry (${detailSettled.reason?.message || 'Regrid refresh failed'})`
          );
        }
      } catch (err) {
        if (!cancelled) {
          setParcelStatus(
            `Using map parcel geometry (${err?.message || 'Regrid refresh failed'})`
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally omit planningParcelFromState object identity — use fromShowZoning + context parcel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planningTargetParcel, pendingPlanningParcelRef, fromShowZoning]);

  useEffect(() => {
    setEdgeInfo(envelopeResult.edgeClassifications || []);
  }, [envelopeResult]);

  // Turn ownership on so Regrid tiles stay available; do NOT trigger search zoom/highlight.
  useEffect(() => {
    if (!parcel?.geometry) return undefined;
    setLayerStatus((prev) => (prev?.ownership ? prev : { ...prev, ownership: true }));
    return undefined;
  }, [parcel, setLayerStatus]);

  // Draw / update envelope data. Do not tear down layers on every recalculation (that flickers).
  // If a refresh fails the inset, keep the last good green envelope for this parcel.
  useEffect(() => {
    if (!parcel) return undefined;
    let cancelled = false;
    let attempts = 0;

    if (lastGoodEnvelopeRef.current.parcelId !== parcelId) {
      lastGoodEnvelopeRef.current = {
        envelope: null,
        dimensionFeatures: [],
        parcelId,
      };
    }
    if (envelopeResult.envelope) {
      lastGoodEnvelopeRef.current = {
        envelope: envelopeResult.envelope,
        dimensionFeatures: envelopeResult.dimensionFeatures || [],
        parcelId,
      };
    }

    const envelopeFeatures = (() => {
      if (!zoningShown) return [];
      if (envelopeResult.envelope) return [envelopeResult.envelope];
      if (lastGoodEnvelopeRef.current.envelope) return [lastGoodEnvelopeRef.current.envelope];
      return [];
    })();
    const dimensionFeatures = (() => {
      if (!zoningShown) return [];
      if (envelopeResult.envelope) return envelopeResult.dimensionFeatures || [];
      return lastGoodEnvelopeRef.current.dimensionFeatures || [];
    })();

    const raisePlanningLayers = (map) => {
      try {
        [
          'cv-planning-parcel-fill',
          'cv-planning-parcel-line',
          'cv-planning-envelope-fill',
          'cv-planning-envelope-line',
          'cv-planning-dimension-line',
          'cv-planning-dimension-label',
        ].forEach((id) => {
          if (map.getLayer(id)) map.moveLayer(id);
        });
      } catch {
        /* ignore */
      }
    };

    const sync = () => {
      if (cancelled) return false;
      const map = mapRef?.current;
      if (!map || typeof map.getSource !== 'function') return false;
      if (!map.isStyleLoaded?.()) return false;
      if (!ensurePlanningLayers(map)) return false;

      const parcelSrc = map.getSource(PARCEL_SOURCE);
      const envSrc = map.getSource(ENVELOPE_SOURCE);
      const dimSrc = map.getSource(DIMENSION_SOURCE);
      if (!parcelSrc || !envSrc || !dimSrc) return false;

      parcelSrc.setData({ type: 'FeatureCollection', features: [parcel] });
      envSrc.setData({
        type: 'FeatureCollection',
        features: envelopeFeatures,
      });
      dimSrc.setData({
        type: 'FeatureCollection',
        features: dimensionFeatures,
      });
      raisePlanningLayers(map);
      return true;
    };

    const tick = () => {
      if (sync()) return;
      attempts += 1;
      if (attempts < 40) window.setTimeout(tick, 250);
    };
    tick();

    const map = mapRef?.current;
    const onStyleLoad = () => {
      attempts = 0;
      tick();
    };
    // Map ownership/highlight restacks bury planning layers under the red selection —
    // re-raise on idle so green setbacks don't vanish after the first paint.
    const onIdle = () => {
      if (cancelled) return;
      const live = mapRef?.current;
      if (!live?.getLayer?.('cv-planning-envelope-fill')) {
        tick();
        return;
      }
      raisePlanningLayers(live);
    };
    map?.on?.('style.load', onStyleLoad);
    map?.on?.('idle', onIdle);

    return () => {
      cancelled = true;
      map?.off?.('style.load', onStyleLoad);
      map?.off?.('idle', onIdle);
    };
  }, [parcel, envelopeResult, zoningShown, mapRef, parcelId]);

  // Remove planning layers only when leaving /planning (not on React Strict Mode remount).
  useEffect(() => {
    return () => {
      const path = String(window.location?.pathname || '').replace(/\/+$/, '') || '/';
      if (path !== '/planning') {
        removePlanningLayers(mapRef?.current);
      }
    };
  }, [mapRef]);

  if (!parcel) {
    return (
      <div className="planning-overlay">
        <aside className="planning-side">
          <header className="planning-side-header">
            <p className="eyebrow">Buildability · main map</p>
            <h1>No parcel</h1>
            <p className="status">{parcelStatus}</p>
            {zoningError ? <p className="error">{zoningError}</p> : null}
          </header>
        </aside>
      </div>
    );
  }

  const props = parcel.properties || {};
  const parcelAreaSf = (() => {
    try {
      return Math.round(turf.area(parcel) * 10.7639);
    } catch {
      return props.ll_gissqft || null;
    }
  })();
  const envelopeAreaSf = envelopeResult.envelope
    ? Math.round(turf.area(envelopeResult.envelope) * 10.7639)
    : null;
  const farDetached = activeRules?.geo?.farMax?.detachedDwelling;
  const maxFloorFromFar =
    parcelAreaSf != null && farDetached != null
      ? Math.round(Number(parcelAreaSf) * farDetached)
      : null;

  if (panelMinimized) {
    return (
      <div className="planning-overlay planning-overlay--minimized">
        <button
          type="button"
          className="planning-reopen-btn"
          onClick={() => setPanelMinimized(false)}
          title="Open zoning panel"
        >
          Zoning · {regridZoneCode}
        </button>
      </div>
    );
  }

  return (
    <div className="planning-overlay">
      <aside className="planning-side">
        <header className="planning-side-header">
          <div className="planning-side-header-top">
            <p className="eyebrow">Buildability · main map</p>
            <button
              type="button"
              className="planning-minimize-btn"
              onClick={() => setPanelMinimized(true)}
              title="Minimize panel"
            >
              Minimize
            </button>
          </div>
          <h1>{props.address || 'Parcel'}</h1>
          <p className="owner">{props.owner}</p>
          <p className="status">{parcelStatus}</p>
          <p className="muted">
            Regrid zone <strong>{regridZoneCode}</strong> · APN {props.parcelnumb || '—'}
          </p>
          {zoningError ? <p className="error">{zoningError}</p> : null}
        </header>

        {zoningShown && activeRules ? (
          <>
            <section className="planning-card">
              <h2>
                Zone <strong>{activeRules.zoneCode}</strong>
              </h2>
              <p>{activeRules.zoneName}</p>
              <p className="muted">
                {activeRules.jurisdictionName}
                {activeRules.ldrSection ? ` · §${activeRules.ldrSection}` : ''}
                {activeRules.source === 'ldr'
                  ? ' · curated LDR pack'
                  : activeRules.source === 'regrid'
                    ? ' · Regrid zoning fields'
                    : ' · estimated yards'}
              </p>
              {activeRules.ldrUrl ? (
                <a
                  className="planning-ldr-review"
                  href={activeRules.ldrUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {activeRules.ldrLabel ||
                    (activeRules.ldrSection
                      ? `Review §${activeRules.ldrSection} ${activeRules.zoneCode} in Town LDR`
                      : `Review ${activeRules.zoneCode} in zoning ordinance`)}
                </a>
              ) : null}
              {Array.isArray(activeRules.reviewLinks) && activeRules.reviewLinks.length > 1 ? (
                <ul className="planning-ldr-links">
                  {activeRules.reviewLinks
                    .filter((l) => l.url && l.url !== activeRules.ldrUrl)
                    .slice(0, 3)
                    .map((l) => (
                      <li key={l.id || l.url}>
                        <a href={l.url} target="_blank" rel="noreferrer">
                          {l.label}
                        </a>
                      </li>
                    ))}
                </ul>
              ) : null}
              {activeRules.classification?.intent ? (
                <p className="muted">{activeRules.classification.intent}</p>
              ) : null}
            </section>

            <section className="planning-card">
              <h2>Primary building setbacks (on map)</h2>
              <div className="planning-map-legend inline">
                <div>
                  <span className="swatch swatch-parcel" /> Parcel
                </div>
                <div>
                  <span className="swatch swatch-envelope" /> Buildable envelope
                </div>
              </div>
              {frontageStatus ? <p className="muted">{frontageStatus}</p> : null}
              <p className="muted">
                Green = where a <em>new</em> primary building could sit under these setbacks.
                Existing houses often sit outside it (built earlier / legally nonconforming).
              </p>
              <button
                type="button"
                className="planning-minimize-btn"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setFrontageBearing((prev) => {
                    const next = ((prev ?? 0) + 90) % 360;
                    setParcel((p) => {
                      if (!p) return p;
                      return {
                        ...p,
                        properties: {
                          ...p.properties,
                          edgeHints: {
                            ...(p.properties?.edgeHints || {}),
                            primaryStreetBearing: next,
                          },
                        },
                      };
                    });
                    setFrontageStatus(
                      `Frontage rotated to bearing ${Math.round(next)}° (manual)`
                    );
                    return next;
                  });
                }}
                title="Rotate which edge is treated as the primary street"
              >
                Rotate frontage 90°
              </button>
              <ul className="kv">
                <li>
                  <span>Primary street</span>
                  <strong>{setbacks.primaryStreet} ft</strong>
                </li>
                <li>
                  <span>Secondary street</span>
                  <strong>{setbacks.secondaryStreet} ft</strong>
                </li>
                <li>
                  <span>Side</span>
                  <strong>{setbacks.side} ft</strong>
                </li>
                <li>
                  <span>Rear</span>
                  <strong>{setbacks.rear} ft</strong>
                </li>
              </ul>
              {envelopeResult.error && <p className="error">{envelopeResult.error}</p>}
              <ul className="kv">
                <li>
                  <span>Parcel area</span>
                  <strong>
                    {parcelAreaSf != null ? `${Number(parcelAreaSf).toLocaleString()} sf` : '—'}
                  </strong>
                </li>
                <li>
                  <span>Envelope area</span>
                  <strong>
                    {envelopeAreaSf != null ? `${envelopeAreaSf.toLocaleString()} sf` : '—'}
                  </strong>
                </li>
                {farDetached != null ? (
                  <li>
                    <span>FAR {farDetached} → max floor (detached)</span>
                    <strong>
                      {maxFloorFromFar != null ? `${maxFloorFromFar.toLocaleString()} sf` : '—'}
                    </strong>
                  </li>
                ) : null}
                {activeRules.geo?.maxBuildingHeightFt != null ? (
                  <li>
                    <span>Max height (Regrid)</span>
                    <strong>{activeRules.geo.maxBuildingHeightFt} ft</strong>
                  </li>
                ) : null}
                {activeRules.geo?.maxCoveragePct != null ? (
                  <li>
                    <span>Max coverage (Regrid)</span>
                    <strong>{activeRules.geo.maxCoveragePct}%</strong>
                  </li>
                ) : null}
              </ul>
              {edgeInfo.length > 0 && (
                <div className="edge-list">
                  <h3>Edge setbacks (measured on map)</h3>
                  <ul>
                    {edgeInfo.map((e) => (
                      <li key={e.index}>
                        Edge {e.index + 1}: <code>{e.kind}</code> · nominal {e.insetFt} ft
                        {e.measuredFt != null ? ` · measured ${e.measuredFt} ft` : ''}
                        {e.lengthFt != null ? ` · edge ${e.lengthFt} ft` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {activeRules.source === 'ldr' && activeRules.geo?.accessoryStructureSetbacksFt ? (
              <section className="planning-card">
                <h2>Geo rules ({activeRules.zoneCode})</h2>
                <ul className="rule-list">
                  <li>
                    <strong>Accessory setbacks</strong> — street{' '}
                    {activeRules.geo.accessoryStructureSetbacksFt.primaryStreet}/
                    {activeRules.geo.accessoryStructureSetbacksFt.secondaryStreet}, side/rear{' '}
                    {activeRules.geo.accessoryStructureSetbacksFt.side}/
                    {activeRules.geo.accessoryStructureSetbacksFt.rear} ft
                  </li>
                  {activeRules.geo.parkingSetbacksFt ? (
                    <li>
                      <strong>Parking setbacks</strong> — street 0/0, side{' '}
                      {activeRules.geo.parkingSetbacksFt.side}, rear{' '}
                      {activeRules.geo.parkingSetbacksFt.rear} ft
                    </li>
                  ) : null}
                  {activeRules.geo.landscapeSurfaceRatioMin ? (
                    <li>
                      <strong>Landscape surface min</strong> — detached{' '}
                      {activeRules.geo.landscapeSurfaceRatioMin.detachedDwelling}, attached/apt{' '}
                      {activeRules.geo.landscapeSurfaceRatioMin.apartmentsOrAttached?.ratio}
                    </li>
                  ) : null}
                  {activeRules.geo.farMax ? (
                    <li>
                      <strong>FAR</strong> — detached {activeRules.geo.farMax.detachedDwelling}, other{' '}
                      {activeRules.geo.farMax.otherAllowedUses}
                    </li>
                  ) : null}
                  {activeRules.geo.maxHabitableFloorAreaAboveGradeSf != null ? (
                    <li>
                      <strong>Max building SF</strong> —{' '}
                      {activeRules.geo.maxHabitableFloorAreaAboveGradeSf.toLocaleString()} habitable
                      above grade
                    </li>
                  ) : null}
                  {activeRules.geo.steepSlopeNoBuildPct != null ? (
                    <li>
                      <strong>Steep slope</strong> — no build &gt;
                      {activeRules.geo.steepSlopeNoBuildPct}%
                    </li>
                  ) : null}
                </ul>
              </section>
            ) : null}

            {activeRules.source === 'ldr' && activeRules.classification?.uses?.length > 0 ? (
              <section className="planning-card">
                <h2>Classification</h2>
                {activeRules.classification.intent ? (
                  <p className="muted">{activeRules.classification.intent}</p>
                ) : null}
                <ul className="rule-list">
                  {activeRules.classification.hillsideCupAvgSlopePct != null ? (
                    <li>
                      <strong>Hillside CUP</strong> — avg cross-slope ≥{' '}
                      {activeRules.classification.hillsideCupAvgSlopePct}%
                    </li>
                  ) : null}
                  {activeRules.classification.subdivisionMinLotSf != null ? (
                    <li>
                      <strong>Min subdivision lot</strong> —{' '}
                      {activeRules.classification.subdivisionMinLotSf.toLocaleString()} sf
                    </li>
                  ) : null}
                </ul>
                <h3>Allowed uses</h3>
                <table className="uses-table">
                  <thead>
                    <tr>
                      <th>Use</th>
                      <th>Permit</th>
                      <th>Parking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRules.classification.uses.map((u) => (
                      <tr key={u.name}>
                        <td>{u.name}</td>
                        <td>{u.permit}</td>
                        <td>{u.parking}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
          </>
        ) : (
          <section className="planning-card">
            <h2>Setbacks</h2>
            <p className="muted">
              Could not draw setbacks for Regrid zone <strong>{regridZoneCode}</strong>
              {zoningError ? `: ${zoningError}` : '.'}
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}
