import React from 'react';
import './ToolPanel.css';

const ToolPanel = ({ 
  onZoomIn, 
  onZoomOut, 
  onDrawLine, 
  onDrawPolygon, 
  onClear, 
  onSelectParcels,
  onDeleteSelectedFeature // New function for selecting parcels with polygon
}) => {
  return (
      <div className="tool-panel" data-tour="tool-panel">
            <div className="tool-container">
              <div className="tooltip-container">
                <button className="tool-btn" onClick={onZoomIn} data-tour="tool-zoom-in">+</button>
                <span className="tooltip-text">Zoom In</span>
              </div>

              <div className="tooltip-container">
                <button className="tool-btn" onClick={onZoomOut} data-tour="tool-zoom-out">-</button>
                <span className="tooltip-text">Zoom Out</span>
              </div>

              <div className="tooltip-container">
                <button className="tool-btn" onClick={onDrawLine} data-tour="tool-draw-line">📏</button>
                <span className="tooltip-text">Draw a Line</span>
              </div>

              <div className="tooltip-container">
                <button className="tool-btn" onClick={onDrawPolygon} data-tour="tool-draw-polygon">⬢</button>
                <span className="tooltip-text">Draw a Polygon</span>
              </div>

              <div className="tooltip-container select-parcels-btn">
                <button className="tool-btn" onClick={onSelectParcels} data-tour="tool-select-parcels">📌</button>
                <span className="tooltip-text">Select Parcels with Polygon</span>
              </div>

              <div className="tooltip-container">
                <button
                  className="tool-btn"
                  onClick={onDeleteSelectedFeature}
                  data-tour="tool-delete-selected"
                >
                  🗑️
                </button>
                <span className="tooltip-text">Delete Selected Feature</span>
              </div>

              <div className="tooltip-container">
                <button className="tool-btn" onClick={onClear} data-tour="tool-clear-all">❌</button>
                <span className="tooltip-text">Clear All Drawings</span>
              </div>

      </div>
    </div>
  );
};

export default ToolPanel;
