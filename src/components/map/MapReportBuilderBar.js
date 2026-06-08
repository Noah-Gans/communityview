import React from 'react';
import { useNavigate } from 'react-router-dom';
import { REGRID_BATCH_REPORTS_ENABLED } from '../../config/featureFlags';
import { useMapContext } from '../../pages/MapContext';
import './MapReportBuilderBar.css';

const MIN_PARCELS_FOR_REPORT = 2;

const MapReportBuilderBar = () => {
  const navigate = useNavigate();
  const {
    selectedFeature,
    setActiveTab,
    setIsFilterTriggered,
  } = useMapContext();

  if (!REGRID_BATCH_REPORTS_ENABLED) {
    return null;
  }

  const selectionCount = Array.isArray(selectedFeature) ? selectedFeature.length : 0;
  if (selectionCount < MIN_PARCELS_FOR_REPORT) {
    return null;
  }

  const openReportBuilder = () => {
    setIsFilterTriggered(false);
    setActiveTab('report');
    navigate('/report');
  };

  return (
    <div className="map-report-builder-container">
      <div className="map-report-builder-bar">
        <span className="map-report-builder-count">
          {selectionCount} parcels selected
        </span>
        <button
          type="button"
          className="map-report-builder-button"
          onClick={openReportBuilder}
        >
          See features in Report Builder
        </button>
      </div>
    </div>
  );
};

export default MapReportBuilderBar;
