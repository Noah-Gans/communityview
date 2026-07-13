import { useState, useCallback, useMemo, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { regridRestGet } from '../services/regridService';
import { applyRegridSearchListParams } from '../utils/regridParcelApi';
import {
  readSearchCountyMode,
  readSearchCountySessionState,
  writeSearchCountyMode,
  writeSearchCountySessionState,
} from '../utils/searchCountyCache';
import {
  countyRecordFromParcelPath,
  ensureSessionCountyFromMap,
  refreshMapCenterCounty,
} from '../utils/searchCountyDetection';

const REGRID_COUNTY_DEPS = { regridRestGet, applyRegridSearchListParams };

function resolveInitialMode(profileCounty, modePreference) {
  const cached = readSearchCountyMode();
  if (cached !== 'nationwide') return cached;
  if (profileCounty) return modePreference || 'saved';
  return 'nationwide';
}

/**
 * Search county scope: nationwide vs profile-saved county vs latest map-center county.
 * Logged-in users with a saved county skip Regrid on search open (0 API calls).
 */
export function useSearchCountyScope(mapRef) {
  const {
    user,
    loading: userLoading,
    defaultSearchCounty,
    searchCountyModePreference,
    searchCountySetupDismissed,
    saveDefaultSearchCounty,
    setSearchCountyModePreference,
    dismissSearchCountySetupPrompt,
  } = useUser();

  const [mode, setModeState] = useState(() =>
    resolveInitialMode(defaultSearchCounty, searchCountyModePreference)
  );
  const [savedCounty, setSavedCounty] = useState(() => {
    if (defaultSearchCounty) return defaultSearchCounty;
    return readSearchCountySessionState()?.sessionCounty || null;
  });
  const [mapCounty, setMapCounty] = useState(
    () => readSearchCountySessionState()?.mapCounty || null
  );
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingSavePromptCounty, setPendingSavePromptCounty] = useState(null);
  const [isSavingDefaultCounty, setIsSavingDefaultCounty] = useState(false);

  const hydrateFromCache = useCallback(() => {
    const state = readSearchCountySessionState();
    if (!state?.sessionCounty && !state?.mapCounty) return false;
    if (state.sessionCounty) setSavedCounty((prev) => prev || state.sessionCounty);
    if (state.mapCounty) setMapCounty(state.mapCounty);
    return Boolean(state.sessionCounty || state.mapCounty);
  }, []);

  const syncProfileCountyToCache = useCallback((county) => {
    if (!county) return;
    const state = readSearchCountySessionState();
    writeSearchCountySessionState({
      sessionCounty: county,
      mapCounty: state?.mapCounty || county,
    });
  }, []);

  useEffect(() => {
    if (!defaultSearchCounty) return;
    setSavedCounty(defaultSearchCounty);
    syncProfileCountyToCache(defaultSearchCounty);
    setMapCounty((prev) => prev || readSearchCountySessionState()?.mapCounty || defaultSearchCounty);
  }, [defaultSearchCounty, syncProfileCountyToCache]);

  useEffect(() => {
    if (!defaultSearchCounty) return;
    const preferred = searchCountyModePreference || readSearchCountyMode();
    if (preferred === 'saved' || preferred === 'map' || preferred === 'nationwide') {
      setModeState(preferred);
      writeSearchCountyMode(preferred);
    }
  }, [defaultSearchCounty, searchCountyModePreference]);

  const setMode = useCallback(
    (nextMode) => {
      setModeState(nextMode);
      writeSearchCountyMode(nextMode);
      if (user) {
        void setSearchCountyModePreference(nextMode);
      }
    },
    [user, setSearchCountyModePreference]
  );

  const bootstrapCountyScope = useCallback(async () => {
    if (userLoading) return { fromCache: false, deferred: true };

    if (defaultSearchCounty) {
      setSavedCounty(defaultSearchCounty);
      syncProfileCountyToCache(defaultSearchCounty);
      const state = readSearchCountySessionState();
      setMapCounty(state?.mapCounty || defaultSearchCounty);
      const preferred =
        searchCountyModePreference && searchCountyModePreference !== 'session'
          ? searchCountyModePreference
          : readSearchCountyMode();
      if (preferred === 'saved' || preferred === 'map' || preferred === 'nationwide') {
        setMode(preferred);
      } else {
        setMode('saved');
      }
      return { fromCache: true };
    }

    if (hydrateFromCache()) {
      return { fromCache: true };
    }

    if (!mapRef?.current) return { fromCache: false };

    setIsBootstrapping(true);
    try {
      const result = await ensureSessionCountyFromMap(mapRef.current, REGRID_COUNTY_DEPS);
      if (result.sessionCounty) {
        setSavedCounty((prev) => prev || result.sessionCounty);
        setMapCounty(result.mapCounty || result.sessionCounty);
        if (!result.fromCache) {
          setMode(user ? 'map' : 'saved');
        }

        const shouldPrompt =
          Boolean(user) &&
          !searchCountySetupDismissed &&
          !result.fromCache &&
          result.sessionCounty;

        if (shouldPrompt) {
          setPendingSavePromptCounty(result.sessionCounty);
        }
      }
      return { fromCache: Boolean(result.fromCache) };
    } finally {
      setIsBootstrapping(false);
    }
  }, [
    defaultSearchCounty,
    hydrateFromCache,
    mapRef,
    searchCountyModePreference,
    searchCountySetupDismissed,
    setMode,
    syncProfileCountyToCache,
    user,
    userLoading,
  ]);

  const refreshFromMap = useCallback(async () => {
    if (!mapRef?.current) return null;
    setMode('map');
    setIsRefreshing(true);
    try {
      const county = await refreshMapCenterCounty(mapRef.current, REGRID_COUNTY_DEPS);
      const state = readSearchCountySessionState();
      if (defaultSearchCounty) {
        setSavedCounty(defaultSearchCounty);
      } else if (state?.sessionCounty) {
        setSavedCounty(state.sessionCounty);
      }
      if (county) {
        setMapCounty(county);
      }
      return county;
    } finally {
      setIsRefreshing(false);
    }
  }, [defaultSearchCounty, mapRef, setMode]);

  const selectMapCenter = useCallback(() => refreshFromMap(), [refreshFromMap]);

  const applyMapCountyFromParcelPath = useCallback(
    (path) => {
      const county = countyRecordFromParcelPath(path);
      if (!county) return null;

      setMapCounty(county);
      const existing = readSearchCountySessionState();
      writeSearchCountySessionState({
        sessionCounty: defaultSearchCounty || existing?.sessionCounty || savedCounty || county,
        mapCounty: county,
      });
      return county;
    },
    [defaultSearchCounty, savedCounty]
  );

  const saveDetectedAsDefault = useCallback(
    async (county) => {
      const record = county || pendingSavePromptCounty || mapCounty;
      if (!record) return;

      setIsSavingDefaultCounty(true);
      try {
        await saveDefaultSearchCounty(record);
        setSavedCounty(record);
        syncProfileCountyToCache(record);
        setMode('saved');
        setPendingSavePromptCounty(null);
      } finally {
        setIsSavingDefaultCounty(false);
      }
    },
    [
      mapCounty,
      pendingSavePromptCounty,
      saveDefaultSearchCounty,
      setMode,
      syncProfileCountyToCache,
    ]
  );

  const dismissSavePrompt = useCallback(() => {
    setPendingSavePromptCounty(null);
    void dismissSearchCountySetupPrompt();
  }, [dismissSearchCountySetupPrompt]);

  const countyCodes = useMemo(() => {
    if (mode === 'nationwide') return [];
    const county = mode === 'saved' ? savedCounty : mapCounty;
    const path = county?.path || county?.code;
    return path ? [path] : [];
  }, [mode, savedCounty, mapCounty]);

  const activeCounty = mode === 'saved' ? savedCounty : mode === 'map' ? mapCounty : null;
  const hasProfileSavedCounty = Boolean(defaultSearchCounty);
  const savedCountyLabel = user && hasProfileSavedCounty ? 'Saved' : 'Session';

  useEffect(() => {
    hydrateFromCache();
  }, [hydrateFromCache]);

  return {
    mode,
    setMode,
    savedCounty,
    mapCounty,
    sessionCounty: savedCounty,
    activeCounty,
    countyCodes,
    savedCountyLabel,
    hasProfileSavedCounty,
    bootstrapCountyScope,
    ensureSessionCounty: bootstrapCountyScope,
    refreshFromMap,
    selectMapCenter,
    hydrateFromCache,
    applyMapCountyFromParcelPath,
    saveDetectedAsDefault,
    pendingSavePromptCounty,
    dismissSavePrompt,
    isSavingDefaultCounty,
    isBootstrapping,
    isRefreshing,
  };
}
