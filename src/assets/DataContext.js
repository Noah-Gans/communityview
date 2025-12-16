import React, { createContext, useState, useEffect } from 'react';
import L from 'leaflet';

// Create the context
export const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [geojsonData, setGeojsonData] = useState({});
  const [loadingOtherLayers, setLoadingOtherLayers] = useState(true);  // Track other layers loading
  const [loadingReport, setLoadingReport] = useState(true); // Track report data loading
  const [mapFocusFeature, setMapFocusFeature] = useState(null);
  const [reportData, setReportData] = useState(''); // State to store the report data
  
  // Define colors for different SURFACE types in Public Land layer
  const publicLandColors = {
    'Bureau of Land Management': 'yellow',
    'Fish & Wildlife Service': 'orange',
    'Forest Service': 'green',
    'Local Government': 'red',
    'National Park Service': 'purple',
    'Private': 'gray',
    'State': 'blue',
    'State (Wyoming Game & Fish)': 'darkblue',
    'Water': 'cyan',
  };

  // Fetch report data
  const fetchReportData = async () => {
    try {
      const reportUrl = 'https://storage.googleapis.com/first_bucket_store/report/updated_report_2.txt';
      const response = await fetch(reportUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch report data: ${response.status}`);
      }
      const text = await response.text();
      setReportData(text);
    } catch (error) {
      console.error('Error fetching report data:', error);
      setReportData('Error loading report data.');
    } finally {
      setLoadingReport(false); // Report data is loaded
    }
  };

  // Fetch various GeoJSON layers
  const fetchLayers = async () => {
    try {
      // Define the URLs for the GeoJSON files
      const urls = {
        // ownership: removed - now handled by Tegola
        roads: 'https://storage.googleapis.com/first_bucket_store/layers/roads.geojson',
        trails: 'https://storage.googleapis.com/first_bucket_store/layers/trails.geojson',
        wildlife: 'https://storage.googleapis.com/first_bucket_store/layers/wildlife.geojson',
        waterways: 'https://storage.googleapis.com/first_bucket_store/layers/waterways.geojson',
        structure: 'https://storage.googleapis.com/first_bucket_store/layers/structure.geojson',
        public_land: 'https://storage.googleapis.com/first_bucket_store/layers/public_land.geojson',
        avalanche: 'https://storage.googleapis.com/first_bucket_store/layers/avalanche_v2.geojson',
        county_border: 'https://storage.googleapis.com/first_bucket_store/layers/county_border.geojson',
        high_use_trails: 'https://storage.googleapis.com/first_bucket_store/layers/high_use_trails.geojson',
        raptor_buffer: 'https://storage.googleapis.com/first_bucket_store/layers/raptor_buffer.geojson',
        ungulate_map: 'https://storage.googleapis.com/first_bucket_store/layers/ungulate_map.geojson',
        greater_yellowstone: 'https://storage.googleapis.com/first_bucket_store/layers/greater_yellowstone.geojson',
        mineral: 'https://storage.googleapis.com/first_bucket_store/layers/mineral.geojson',
        wells: 'https://storage.googleapis.com/first_bucket_store/layers/wells.geojson',
        schools: 'https://storage.googleapis.com/first_bucket_store/layers/schools.geojson',
        emergency: 'https://storage.googleapis.com/first_bucket_store/layers/emergency.geojson',
        ownership_address: 'https://storage.googleapis.com/first_bucket_store/layers/ownership_address.geojson',
      };

      // Function to fetch a single GeoJSON layer
      const fetchLayer = async (key, url) => {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to fetch ${key}: ${response.status}`);
          }
          const data = await response.json();

          // Apply colors to public_land layer features
          if (key === 'public_land' && data.features) {
            data.features.forEach(feature => {
              const surface = feature.properties?.SURFACE;
              feature.properties.color = publicLandColors[surface] || 'gray';
            });
          }

          return { key, data };
        } catch (error) {
          console.error(`Error fetching ${key} GeoJSON file:`, error);
          return { key, data: null };
        }
      };

      // Fetch all layers concurrently
      const layerPromises = Object.entries(urls).map(([key, url]) => fetchLayer(key, url));
      const results = await Promise.all(layerPromises);

      // Update state with fetched data
      const newGeojsonData = {};
      results.forEach(({ key, data }) => {
        if (data) {
          newGeojsonData[key] = data;
        }
      });

      setGeojsonData(prevData => ({ ...prevData, ...newGeojsonData }));
    } catch (error) {
      console.error('Error in fetchLayers:', error);
    } finally {
      setLoadingOtherLayers(false); // All layers are loaded
    }
  };

  useEffect(() => {
    // Fetch other layers on component mount
    if (loadingOtherLayers) {
      fetchLayers();
    }

    // Fetch report data
    if (loadingReport) {
      fetchReportData();
    }
  }, [loadingOtherLayers, loadingReport]);

  return (
    <DataContext.Provider value={{ 
      geojsonData, 
      loadingOtherLayers, 
      reportData, 
      mapFocusFeature, 
      setMapFocusFeature 
    }}>
      {children}
    </DataContext.Provider>
  );
};
