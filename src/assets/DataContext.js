import React, { createContext, useState } from 'react';

export const DataContext = createContext();

/** Legacy context shell — map layers now use hosted PMTiles / Regrid, not GCS GeoJSON. */
export const DataProvider = ({ children }) => {
  const [mapFocusFeature, setMapFocusFeature] = useState(null);

  return (
    <DataContext.Provider
      value={{
        geojsonData: {},
        loadingOtherLayers: false,
        reportData: '',
        mapFocusFeature,
        setMapFocusFeature,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
