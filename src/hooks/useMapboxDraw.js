// src/hooks/useMapboxDraw.js

  

import * as turf from "@turf/turf"; // ✅ Import Turf.js
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { useState, useRef, useEffect } from "react";
import "./Draw.css";
import { useMapContext } from "../pages/MapContext";

/**
 * Custom Hook to manage Mapbox Draw functionality.
 */
export default function useMapboxDraw({ onPolygonCreated, onLineCreated, onPolygonFinalized }) {
  const { mapRef, drawRef, isDrawingRef, setIsDrawing, suppressNextFeatureClickRef } = useMapContext();
  const [storedFeatures, setStoredFeatures] = useState(null);
  const selectingParcelPolyMode = useRef(false);
  const tempPolygonRef = useRef(null);
  const isFinalizingSelectionRef = useRef(false);

  const finalizePolygonVisualState = (drawnFeature) => {
    if (!drawRef.current) return;
    const tryFinalize = () => {
      // Switch to simple_select with no selected feature so polygon is finalized/inactive.
      drawRef.current.changeMode("simple_select");
    };

    // Run on next frame, then retry once to avoid timing race with draw internals.
    requestAnimationFrame(() => {
      tryFinalize();
      setTimeout(tryFinalize, 16);
    });
  };
  
  // 🆕 Hide all instructions
  const hideInstructions = () => {
    console.log("🚫 Hiding all instructions");
    setIsDrawing(false);
    
    // Also hide the DOM element immediately
    if (mapRef.current) {
      mapRef.current.off("draw.create", handleDrawCreate);
      mapRef.current.off("draw.update", handleDrawUpdate);
      mapRef.current.off("draw.render", handleDrawRender);
    }
  };
    
  //   /**
   //* ✅ Save Drawn Features to State on Any Change (Create, Update, Delete)
  /**
   * ✅ Save Drawn Features + Measurements to State
   */
  /**
   * ✅ Save Drawn Features + Measurements to State (Live Update)
   */
  const updateStoredFeatures = () => {
    if (!drawRef.current) return;
    let features = drawRef.current.getAll();

    features.features = features.features.map((feature) => {
      let measurement;
      let center;

      if (feature.geometry.type === "Polygon") {
        measurement = turf.area(feature); // 🟢 Get area in m²
        center = turf.centerOfMass(feature); // 🟢 Get center for label
        feature.properties.measurement = `${(measurement / 1000000).toFixed(2)} km²`; // Convert to km²
      } else if (feature.geometry.type === "LineString") {
        measurement = turf.length(feature, { units: "kilometers" }); // 🟢 Get length in km
        center = turf.midpoint(
          turf.point(feature.geometry.coordinates[0]),
          turf.point(feature.geometry.coordinates[feature.geometry.coordinates.length - 1])
        );
        feature.properties.measurement = `${measurement.toFixed(2)} km`;
      }

      feature.properties.labelPoint = center?.geometry?.coordinates || null;
      return feature;
    });

    console.log("📝 Updating Stored Features (Live Update):", features);
    setStoredFeatures(features);
    updateLabels(features);
  };
/**
 * Formats numbers with commas for readability.
 * Example: 1234567 -> "1,234,567"
 */
const formatNumber = (num) => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

  /**
   * ✅ Show Live Area/Length While Drawing
   */
  /**
   * 
 * ✅ Show Live Area/Length While Drawing (with safety checks)
 */
const handleDrawRender = () => {
    if (!drawRef.current) return;
    let features = drawRef.current.getAll();

    features.features = features.features.map((feature) => {
        let measurement;
        let center;

        if (feature.geometry.type === "Polygon") {
            if (feature.geometry.coordinates.length === 0 || feature.geometry.coordinates[0].length < 3) {
                console.warn("⚠️ Polygon has insufficient points, skipping measurement.");
                return feature;
            }
            measurement = turf.area(feature); // Get area in m²
            center = turf.centerOfMass(feature); // Get center for label
        
            // Convert to acres, square feet, and square miles
            const acres = measurement * 0.000247105; // 1 m² = 0.000247105 acres
            const squareFeet = measurement * 10.7639; // 1 m² = 10.7639 ft²
            const squareMiles = acres * 0.0015625; // 1 acre = 0.0015625 square miles
        
            let displayMeasurement = "";
        
            if (acres < 1) {
                // Show square feet and acres if less than 1 acre
                displayMeasurement = `${formatNumber(squareFeet.toFixed(0))} ft² / ${acres.toFixed(2)} acres`;
            } else if (acres >= 1 && acres < 640) {
                // Show only acres if less than 1 square mile (640 acres)
                displayMeasurement = `${acres.toFixed(2)} acres`;
            } else {
                // Show acres and square miles if greater than or equal to 1 square mile
                displayMeasurement = `${acres.toFixed(2)} acres / ${squareMiles.toFixed(2)} mi²`;
            }
        
            feature.properties.measurement = displayMeasurement;
          } else if (feature.geometry.type === "LineString") {
            if (feature.geometry.coordinates.length < 2) {
                console.warn("⚠️ LineString has insufficient points, skipping measurement.");
                return feature;
            }
        
            measurement = turf.length(feature, { units: "miles" }); // 🟢 Get length in miles
            const feet = measurement * 5280; // 1 mile = 5280 feet
        
            center = turf.midpoint(
                turf.point(feature.geometry.coordinates[0]),
                turf.point(feature.geometry.coordinates[feature.geometry.coordinates.length - 1])
            );
        
            // Formatting the output
            let displayMeasurement = measurement < 1 
                ? `${formatNumber(feet.toFixed(0))} ft`  // Show feet if under a mile
                : `${measurement.toFixed(2)} mi`;       // Show miles if 1 mile or more
        
            feature.properties.measurement = displayMeasurement;
        }

        feature.properties.labelPoint = center?.geometry?.coordinates || null;
        return feature;
    });

    updateLabels(features);
    
  };

  /**
   * ✅ Ensure Drawn Features & Labels Stay on Map
   */
  const restoreStoredFeatures = () => {
    if (!drawRef.current || !storedFeatures) return;

    console.log("🔄 Restoring Drawn Features...");
    drawRef.current.deleteAll();
    storedFeatures.features.forEach((feat) => drawRef.current.add(feat));

    updateLabels(storedFeatures);

    // Map.js listens for this and re-pins Regrid above basemap after Draw re-injects gl-draw-* layers.
    queueMicrotask(() => {
      try {
        const m = mapRef.current;
        if (m && typeof m.fire === 'function') {
          m.fire('cv:regrid-restack');
        }
      } catch (_) {
        /* ignore */
      }
    });
  };

  /**
   * ✅ Add or Update Measurement Labels on Map
   */
  const updateLabels = (features) => {
    if (!mapRef.current || !mapRef.current.getSource("measurement-labels")) {
      console.log("🛠️ Adding measurement label source...");
      mapRef.current.addSource("measurement-labels", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      mapRef.current.addLayer({
        id: "measurement-labels-layer",
        type: "symbol",
        source: "measurement-labels",
        layout: {
          "text-field": ["get", "measurement"],
          "text-size": 14,
          "text-anchor": "center",
          "text-offset": [0, 1.5], // Offset to prevent overlap
        },
        paint: {
          "text-color": "#000000",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      });
    }

    const labelFeatures = features.features
      .filter((f) => f.properties.labelPoint)
      .map((f) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: f.properties.labelPoint },
        properties: { measurement: f.properties.measurement },
      }));

    mapRef.current.getSource("measurement-labels").setData({
      type: "FeatureCollection",
      features: labelFeatures,
    });
  };

  function finalizeDrawnFeature(drawnFeature) {
    if (!drawnFeature) return;

    if (suppressNextFeatureClickRef) {
      suppressNextFeatureClickRef.current = true;
    }
    isDrawingRef.current = false;
    setIsDrawing(false);
    finalizePolygonVisualState(drawnFeature);
  }

  function handleDrawUpdate(e) {
    const drawnFeature = e.features[0];
    if (!drawnFeature || drawnFeature.geometry.type !== "Polygon") return;

    tempPolygonRef.current = drawnFeature.geometry;
    if (typeof onPolygonCreated === "function") {
      onPolygonCreated(drawnFeature);
    }
  }

  function handleDrawCreate(e) {
    const drawnFeature = e.features[0];
    if (!drawnFeature) return;

    const geomType = drawnFeature.geometry.type;
    if (geomType === "Polygon") {
      tempPolygonRef.current = drawnFeature.geometry;
      if (typeof onPolygonCreated === "function") {
        onPolygonCreated(drawnFeature);
      }
    } else if (geomType === "LineString") {
      if (typeof onLineCreated === "function") {
        onLineCreated(drawnFeature);
      }
    } else {
      return;
    }

    if (selectingParcelPolyMode.current && geomType === "Polygon") {
      if (isFinalizingSelectionRef.current) return;
      isFinalizingSelectionRef.current = true;
      setTimeout(() => {
        try {
          if (typeof onPolygonFinalized === "function") {
            onPolygonFinalized(drawnFeature.geometry);
          }
          selectingParcelPolyMode.current = false;
          finalizeDrawnFeature(drawnFeature);
        } finally {
          isFinalizingSelectionRef.current = false;
        }
      }, 0);
      return;
    }

    finalizeDrawnFeature(drawnFeature);
  }



  /**
   * mapClickRef
   *
   * A ref to store a custom map click handler. This is used to 
   * track click logic outside of the standard Draw events. 
   * Typically you only need this if you want to do custom toggling
   * of "isDrawing" based on single clicks when the user is 
   * not actively drawing (or finishing a draw).
   */
  const mapClickRef = useRef(null);
  
useEffect(() => {
    if (!mapRef.current || mapClickRef.current) return;
    
    const map = mapRef.current;
  
    mapClickRef.current = (e) => {
      console.log("🖱️ Map click at:", e.lngLat);
      if (!drawRef.current) return;

      if (
        !isDrawingRef.current &&
        drawRef.current.getSelected().features.length > 0
      ) {
        console.log("🟢 Setting isDrawing to true (user selected a drawn shape).");
        isDrawingRef.current = true;
      }

      if (isDrawingRef.current && drawRef.current.getMode() === "simple_select") {
        const selectedFeatures = drawRef.current.getSelected().features;
        if (selectedFeatures.length === 0) {
          hideInstructions();
        }
      }
    };
  
    map.on("click", mapClickRef.current);
    
    return () => map.off("click", mapClickRef.current);
  }, [mapRef]);

  /**
   *  useEffect: Setup a custom onClick for the map
   *
   *  - Looks at draw mode and selected features
   *  - Toggles isDrawingRef based on those states
   */
  
// src/hooks/useMapboxDraw.js
  /**
   * ✅ Initialize MapboxDraw & Ensure Persistence
   */
  useEffect(() => {
    if (!mapRef?.current) {
      console.error("❌ mapRef is NULL.");
      return;
    }

    const map = mapRef.current;

    if (!drawRef.current) {
      drawRef.current = new MapboxDraw({
        displayControlsDefault: false,
      });
    }

    if (!map.hasControl(drawRef.current)) {
      map.addControl(drawRef.current, "top-left");
    }

    // ✅ Restore stored features after style reload
    map.on("style.load", restoreStoredFeatures);

    // ✅ Keep Drawn Features Updated
    map.on("draw.create", handleDrawCreate);
    map.on("draw.update", handleDrawUpdate);
    map.on("draw.create", updateStoredFeatures);
    map.on("draw.update", updateStoredFeatures);
    map.on("draw.delete", updateStoredFeatures);
    map.on("draw.render", handleDrawRender); // 🟢 Live Update Labels While Drawing
    


    return () => {
        map.off("draw.create", handleDrawCreate);
        map.off("draw.update", handleDrawUpdate);
      map.off("style.load", restoreStoredFeatures);
      map.off("draw.create", updateStoredFeatures);
      map.off("draw.update", updateStoredFeatures);
      map.off("draw.delete", updateStoredFeatures);
      map.off("draw.render", handleDrawRender);
      

    };
  }, [mapRef, storedFeatures]);

  /**
   * ✅ Methods to Start Drawing & Clearing Shapes
   */
  function drawPolygon() {
    if (!drawRef.current) return;
    drawRef.current.changeMode("simple_select");
    setTimeout(() => {
      drawRef.current.changeMode("draw_polygon");
      // 🆕 Show initial instruction for polygon drawing
      isDrawingRef.current = true;
    }, 10);
  }

  function drawLine() {
    if (!drawRef.current) return;
    drawRef.current.changeMode("simple_select");
    setTimeout(() => drawRef.current.changeMode("draw_line_string"), 10);
    isDrawingRef.current = true;
  }

  function selectParcelsWithPolygon() {
    if (!drawRef.current) return;
    console.log("🟡 Entering Parcel Selection Mode...");
    selectingParcelPolyMode.current = true
    drawRef.current.changeMode("simple_select"); // Reset mode first
    setTimeout(() => {
      drawRef.current.changeMode("draw_polygon"); // Start drawing
      console.log("✅ Now in Parcel Selection Mode:", drawRef.current.getMode());
    }, 10);

    isDrawingRef.current = true;
  }

  function clearAllDrawings() {
    if (!drawRef.current) return;
    drawRef.current.deleteAll();
    setStoredFeatures(null); // ✅ Prevent re-restore
    isDrawingRef.current = false;
    
    // 🆕 Hide all instructions when clearing
    hideInstructions();
  }

  function deleteSelectedFeature() {
    if (!drawRef.current) return;
  
    const selectedFeatures = drawRef.current.getSelected().features;
    
    if (selectedFeatures.length > 0) {
      console.log("🗑️ Deleting selected feature:", selectedFeatures[0].id);
      drawRef.current.delete(selectedFeatures[0].id);
      updateStoredFeatures(); // ✅ Update the stored features list
    } else {
      console.warn("⚠️ No feature selected for deletion.");
    }
    isDrawingRef.current = false;
    hideInstructions();

  }

  return {
    drawRef,
    drawPolygon,
    drawLine,
    clearAllDrawings,
    storedFeatures,
    setStoredFeatures,
    selectParcelsWithPolygon,
    deleteSelectedFeature // Expose new functions
    
  };
}
