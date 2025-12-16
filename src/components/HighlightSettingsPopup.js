import React, { useState } from "react";
import { useUser } from "../contexts/UserContext";
import "./HighlightSettingsPopup.css";

const HighlightSettingsPopup = ({ onClose }) => {
  const { highlightSettings, setHighlightSettings } = useUser();

  const [fillColor, setFillColor] = useState(highlightSettings?.fillColor || '#2aff21');
  const [fillOpacity, setFillOpacity] = useState(highlightSettings?.fillOpacity || 0.25);
  const [outlineColor, setOutlineColor] = useState(highlightSettings?.lineColor || '#ff8a00');
  const [lineWidth, setLineWidth] = useState(highlightSettings?.lineWidth || 3);

  const handleSave = () => {
    console.log('🎨 HighlightSettingsPopup: handleSave called');
    
    const newSettings = {
      fillColor,
      fillOpacity: parseFloat(fillOpacity),
      fillOutlineColor: outlineColor, // Use outlineColor for both fill and line
      lineColor: outlineColor, // Use outlineColor for both fill and line
      lineWidth: parseFloat(lineWidth),
    };
    
    console.log('🎨 New settings:', newSettings);
    
    // Save to context (this should also save to Firebase via UserContext)
    setHighlightSettings(newSettings);
    
    // Close the popup
    onClose();
  
    // 🎨 Update existing highlights with new settings after a longer delay
    // This ensures the context has updated before calling updateExistingHighlights
    setTimeout(() => {
      console.log('🎨 HighlightSettingsPopup: setTimeout callback executing');
      console.log('🎨 window.updateExistingHighlights exists:', !!window.updateExistingHighlights);
      
      if (window.updateExistingHighlights) {
        console.log('🎨 Calling window.updateExistingHighlights');
        window.updateExistingHighlights();
      } else {
        console.warn('❌ window.updateExistingHighlights not found');
      }
    }, 500); // Increased delay to ensure context update
  };
  
  

  return (
    <div className="highlight-popup-overlay">
      <div className="highlight-popup">
        <div className="popup-header">
          <h3>🎨 Highlight Settings</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-container">
          <div className="setting-group">
            <label className="setting-label">
              <span>Fill Color</span>
              <input 
                type="color" 
                value={fillColor} 
                onChange={(e) => setFillColor(e.target.value)}
                className="color-input"
              />
            </label>
          </div>

          <div className="setting-group">
            <label className="setting-label">
              <span>Fill Opacity: {fillOpacity}</span>
            </label>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05" 
              value={fillOpacity} 
              onChange={(e) => setFillOpacity(parseFloat(e.target.value))}
              className="opacity-slider"
            />
          </div>

          <div className="setting-group">
            <label className="setting-label">
              <span>Outline Color</span>
              <input 
                type="color" 
                value={outlineColor} 
                onChange={(e) => setOutlineColor(e.target.value)}
                className="color-input"
              />
            </label>
          </div>

          <div className="setting-group">
            <label className="setting-label">
              <span>Outline Width: {lineWidth}px</span>
            </label>
            <input 
              type="range" 
              min="1" 
              max="10" 
              step="1" 
              value={lineWidth} 
              onChange={(e) => setLineWidth(parseInt(e.target.value))}
              className="width-slider"
            />
          </div>
        </div>

        <div className="popup-buttons">
          <button onClick={handleSave} className="save-button">Save Settings</button>
          <button onClick={onClose} className="cancel-button">Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default HighlightSettingsPopup;
