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
      <div className="tool-panel">
            <div className="tool-container">
              <div className="tooltip-container">
                <button className="tool-btn" onClick={onZoomIn}>+</button>
                <span className="tooltip-text">Zoom In</span>
              </div>

              <div className="tooltip-container">
                <button className="tool-btn" onClick={onZoomOut}>-</button>
                <span className="tooltip-text">Zoom Out</span>
              </div>

              <div className="tooltip-container">
                <button className="tool-btn" onClick={onDrawLine}>📏</button>
                <span className="tooltip-text">Draw a Line</span>
              </div>

              <div className="tooltip-container">
                <button className="tool-btn" onClick={onDrawPolygon}>⬢</button>
                <span className="tooltip-text">Draw a Polygon</span>
              </div>

              <div className="tooltip-container select-parcels-btn">
                <button className="tool-btn" onClick={onSelectParcels}>📌</button>
                <span className="tooltip-text">Select Parcels with Polygon</span>
              </div>

              <div className="tooltip-container">
                <button className="tool-btn" onClick={onDeleteSelectedFeature}>🗑️</button>
                <span className="tooltip-text">Delete Selected Feature</span>
              </div>

              <div className="tooltip-container">
                <button className="tool-btn" onClick={onClear}>❌</button>
                <span className="tooltip-text">Clear All Drawings</span>
              </div>

      </div>
    </div>
  );
};

export default ToolPanel;
