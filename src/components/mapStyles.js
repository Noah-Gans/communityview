// src/mapStyles.js

import { keyboard } from "@testing-library/user-event/dist/keyboard";

// Function to get the appropriate label field for each layer
export const getLabelFieldForLayer = (layerName) => {
  const labelMappings = {
    'ownership': 'owner_name',
    'zoning': 'zoning',
    'zoning_toj_zoning': 'zoning',
    'zoning_toj_zoning_overlay': 'overlay',
    'zoning_zoverlay': 'overlay',
    'public_land': 'SURFACE',
    'conservation_easements': 'org_name',
    'plss_plss_intersected': 'FRSTDIVID',
    'plss_plss_sections': 'FRSTDIVID',
    'plss_plss_townships': 'PLSSID',
    'roads': 'name',
    'roads_easements': 'name',
    'precincts': 'precinct',
    'precincts_polling_centers': 'name',
    'control_points_controls': 'name',
    'FEMA_updated': 'FLD_ZONE',
    'mooose_reprojected': 'habitat',
    'reporjected_elk': 'habitat',
    'bigHorn_reporjected': 'habitat',
    'mule_deer_reporjected': 'habitat',
  };
  
  return labelMappings[layerName] || 'name'; // Default to 'name'
};

// Define static color map for zoning codes
const zoningColorMaps = {
 toj: {
    "P/SP": "#FF69B4",
    "CR-2": "#FF8C00",
    "OR": "#8A2BE2",
    "CR-1": "#7FFF00",
    "PUD-NL-5": "#6495ED",
    "NL-5": "#FF4500",
    "PUD-NL-3": "#DC143C",
    "NL-2": "#00CED1",
    "PUD-NH-1": "#ADFF2F",
    "NH-1": "#4B0082",
    "NM-2": "#FFD700",
    "PR-SK": "#FF6347",
    "NL-3": "#40E0D0",
    "R": "#FF00FF",
    "NM-1": "#20B2AA",
    "MHP": "#8B0000",
    "NL-1": "#4682B4",
    "BP": "#FFDEAD",
    "CR-3": "#DA70D6",
    "PUD-UR": "#FF1493",
    "P": "#00BFFF",
    "CR-2": "#B22222",
    "DC-2": "#FFD700",
    "DC-1": "#228B22",
    "TS-1": "#D2691E",
    "TS-2": "#FF4500",
    "PUD-NL-3": "#2E8B57",
    "PUD-NM-2": "#9932CC",
    "PUD-NL-2": "#8B4513",
    "PR": "#00FA9A",
    "PUD-NM-2": "#C71585"
  },
  county: {
    'R1': '#1E90FF',        // Blue
    'R2': '#FF7F50',        // Coral
    'R3': '#32CD32',        // Lime Green
    'PUD R1': '#DAA520',    // Goldenrod
    'PUD R2': '#8A2BE2',    // Blue Violet
    'PUD R3': '#D2691E',    // Chocolate
    'PUD - NC': '#FFB6C1',  // Light Pink
    'P': '#FFD700',         // Gold
    'P/SP': '#FF4500',      // Orange Red
    'S': '#A52A2A',         // Brown
    'WC': '#00CED1',        // Dark Turquoise
    'WHB': '#9400D3',       // Dark Violet
    'NC': '#FF69B4',        // Hot Pink
    'NR-1': '#FF6347',      // Tomato
    'AR': '#ADFF2F',        // Green Yellow
    'BP': '#7FFF00',        // Chartreuse
    'PR': '#FF1493',        // Bright Pink
    'R': '#2E8B57'          // Sea Green
  },
    townOverlayColors: {
    'LDG': '#FFA07A',     // Light Salmon
    'DDO-2': '#87CEFA',   // Light Sky Blue
    'DDO-1': '#4682B4',   // Steel Blue
    'NRO': '#3CB371',     // Medium Sea Green
    'OUP': '#FFD700',     // Gold
    'SRO': '#FF6347'      // Tomato
  },
    countyOverlayColors: {
    'LDG 6': '#FF7F50',    // Coral
    'SRO': '#FF6347',      // Tomato
    'LDG 3': '#FFA07A',    // Light Salmon
    'LDG 2': '#FA8072',    // Salmon
    'NRO': '#3CB371',      // Medium Sea Green
    'SRO 3': '#FF4500',    // Orange Red
    'NRO 3': '#2E8B57',    // Sea Green
    'NRO 4': '#8FBC8F',    // Dark Sea Green
    'NRO 2': '#66CDAA',    // Medium Aquamarine
  },
    roadColors: {
    'US': '#FF0000',   // Bright Red for type US Highway
    'WY': '#0000FF',   // Bright Blue Wy Highway/Road
    'CO': '#FFA500',   // Bright Orange for County
    'CM': '#FFA500',   // Bright Orange for County
    'NP': '#FFFF00',   // Bright Yellow for type NP
    'np': '#FFFF00',   // Bright Yellow for type np (same as NP)
    'FS': '#32CD32',   // Bright Magenta for type FS
    'ID': '#FF69B4',   // Bright Red for type ID (Other State)
    'MT': '#FF69B4',   // Bright Pink for type MT (Other State)
    'JA': '#9c8f59',   // Bright Pink for type MT (Other State)
    // Bright Gold for type WY
  },
  publicLandColors: {
    'Bureau of Land Management': '#F4C430', // Golden Yellow (darker pastel yellow)
    'Fish & Wildlife Service': '#FFA07A', // Light Coral (darker pastel orange)
    'Forest Service': '#77DD77', // Pastel Green
    'Local Government': '#DB35E0', // Steel Blue (replacing red with a calm blue tone)
    'National Park Service': '#a670db', // Medium Purple (slightly darker pastel purple)
    'Private': '#A9A9A9', // Dark Gray (for better visibility if needed)
    'State': '#4169E1', // Cadet Blue (slightly darker pastel blue)
    'State (Wyoming Game & Fish)': '#4169E1', // Royal Blue (darker blue for Game & Fish)
    'Water': '#87CEEB', // Sky Blue (a deeper pastel cyan)
    'default': '#A9A9A9', // Dark Gray (default)
  },
  conservation_easements: {
    'Jackson Hole Land': '#006400', // Dark Green (unchanged - represents dense forests)
    'Teton County Scenic Preserve Trust': '#8B4513', // Saddle Brown (for preserved lands with trees and open spaces)
    'The Nature Conservancy': '#4682B4', // Steel Blue (introducing blue for environmental conservation & water-related areas)
    'Wyoming Game & Fish': '#D2691E', // Chocolate (to represent mixed wildlife and habitat)
    'Teton Regional Land Trust': '#FFD700', // Gold (to add variety and highlight regional uniqueness)
    'USFS': '#708090', // Slate Gray (unchanged, representing federal land)
  },
  
  precinctColorMap:{
    '01-01': '#00BFFF', // Red-Orange
    '01-02': '#33FF57', // Green
    '01-03': '#3357FF', // Blue
    '01-04': '#FF33A1', // Pink
    '01-05': '#A133FF', // Purple
    '01-06': '#FF8C00', // Dark Orange
    '01-07': '#FF5733', // Deep Sky Blue
    '01-08': '#FFD700', // Gold
    '01-09': '#32CD32', // Lime Green
    '01-10': '#FF1493', // Deep Pink
    '01-11': '#8A2BE2', // Blue Violet
    '02-01': '#DC143C', // Crimson
    '03-01': '#00CED1', // Dark Turquoise
    '04-01': '#FF4500', // Orange Red
    '04-02': '#2E8B57', // Sea Green
    '04-03': '#DA70D6', // Orchid
    '04-04': '#8FBC8F', // Dark Sea Green
    '05-01': '#6495ED', // Cornflower Blue
},
femaColorMap: {
  "AE": "#FF4500",  // Orange-Red (high-risk)
  "AO": "#FFA500",  // Orange (moderate risk)
  "AH": "#FFD700",  // Gold/Yellow (lower risk)
  "A": "#FF6347",   // Tomato (general high-risk zone)
}

};


export const loadCustomIcons = (map) => {
  if (!map) {
    console.error('Map instance not available');
    return;
  }

  map.on('load', () => {
    map.loadImage(
      'src/assets/images/icon/map-marker.jpg', // Path to your marker file
      (error, image) => {
        if (error) {
          console.error('Error loading custom marker icon:', error);
        } else {
          // Add the custom image to the map
          map.addImage('custom-home-marker', image);
        }
      }
    );
  });
};
  // src/mapStyles.js

// Define static color maps for different zoning codes

  
  // Function to get the color map for a specific zoning layer
  const getColorMapForLayer = (layerName) => {
    
    if (layerName === "zoning") {
      return zoningColorMaps.county;
    } else if (layerName == "zoning_toj_zoning") {
      return zoningColorMaps.toj;
    } else if (layerName === "zoning_toj_zoning_overlay") {
      return zoningColorMaps.townOverlayColors;
    }else if (layerName === "zoning_zoverlay") {
        return zoningColorMaps.countyOverlayColors;
    }else if (layerName === "roads") {
        return zoningColorMaps.roadColors;
    }else if (layerName == "public_land"){
      return zoningColorMaps.publicLandColors;
    }else if (layerName == "conservation_easements"){
      return zoningColorMaps.conservation_easements;
    }else if (layerName == "precincts"){
      return zoningColorMaps.precinctColorMap;
    }else if (layerName == "FEMA_updated"){
      return zoningColorMaps.femaColorMap;
    }

  
    return {}; // Default empty object if no color map is found
  };
  
  // Function to parse the description and extract zoning code and objectid
  const parseDescription = (htmlString) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const rows = doc.querySelectorAll('tr');
  
    const properties = {};
    rows.forEach((row) => {
      const cells = row.querySelectorAll('th, td');
      if (cells.length === 2) {
        const key = cells[0].textContent.trim().toLowerCase().replace(/ /g, '_');
        const value = cells[1].textContent.trim();
        properties[key] = value;
      }
    });
  
    return properties;
  };
  
  // General function to get color based on zoning code from the provided color map
  const getZoningColor = (zoningCode, colorMap) => {
    return colorMap[zoningCode] || '#808080'; // Default to gray if zoning code is not mapped
  };
  
  // General function to get the zoning paint style based on features and the zoning layer name
  // General function to get the zoning paint style based on features and the zoning layer name
  export const getDynamicStyle = (features, layerName) => {
    if (!features || features.length === 0) {
      console.warn(`No features found to parse for layer: ${layerName}.`);
      return {
        'fill-color': '#808080', // Default color
        'fill-opacity': 0.5,
      };
    }
  
    // Get the color map for the given layer
    const colorMap = getColorMapForLayer(layerName);
  
    // Determine the property key based on the layer name
    let propertyKey;
    switch (layerName) {
      case 'roads':
        propertyKey = 'type';
        break;
      case 'zoning_toj_zoning_overlay':
      case 'zoning_zoverlay':
        propertyKey = 'overlay';
        break;
      case 'public_land':
        propertyKey = 'SURFACE'; // Assuming `SURFACE` is the key for public land features
        break;
      case 'conservation_easements':
        propertyKey = 'org_name'; // Use org_name for conservation easements
        break;
      default:
        propertyKey = 'zoning'; // Default to zoning
    }
  
    // Create a mapping of "Name" (e.g., "kml_249") to colors
    const featureColorMapping = {};
    features.forEach((feature) => {
      if (feature.properties) {
        let colorKey;
        let keyForMapping; // Key to use for featureColorMapping
        const { FLD_AR_ID, precinct, OBJECTID, Name, description } = feature.properties;
  
        if (layerName === 'public_land') {
          // Directly use OBJECTID as the key for public_land layers
          keyForMapping = OBJECTID;
          colorKey = feature.properties.SURFACE?.trim();
        } else if (layerName === 'conservation_easements' && description) {
          // Parse description to extract org_name
          const parsedProperties = parseDescription(description);
          keyForMapping = Name; // Use Name as the mapping key
          colorKey = parsedProperties[propertyKey]?.trim(); // Extract org_name
        } else if (layerName === 'FEMA_updated') {
          // Parse description to extract org_name
          
          keyForMapping = FLD_AR_ID;
          colorKey = feature.properties.FLD_ZONE; // Extract org_nameelse if (layerName === 'precincts') {
          // Parse description to extract org_name
          
        } else if (description) {
          // Parse description for other layers
          const parsedProperties = parseDescription(description);
          keyForMapping = Name; // Default key for non-public_land layers
          colorKey = parsedProperties[propertyKey]?.trim();
        }
        if (colorKey && keyForMapping) {
          console.log("Came here")
          const color = colorMap[colorKey] || '#808080'; // Default color if no match
          featureColorMapping[keyForMapping] = color;
        }
      }
    });
  
    // Create an expression for data-driven styling
    const matchKey = layerName === 'public_land' ? 'OBJECTID' 
              : layerName === 'precincts' ? 'precinct' 
              : layerName === 'FEMA_updated' ? 'FLD_AR_ID' 
              : 'Name';
    const colorExpression = ['match', ['get', matchKey]];
    const opacityExpression = ['match', ['get', layerName === 'public_land' ? 'OBJECTID' : 'Name']];
    Object.keys(featureColorMapping).forEach((key) => {
      // Convert key to number for Mapbox match expression
      const numericKey = layerName === 'public_land' ? parseInt(key, 10) : key;
      colorExpression.push(numericKey);
      colorExpression.push(featureColorMapping[key]);
  
      // Set opacity to 0 for "Private" and "Water," otherwise 0.5
      const isTransparent = 
        featureColorMapping[key] === zoningColorMaps.publicLandColors['Private'] || 
        featureColorMapping[key] === zoningColorMaps.publicLandColors['Water'];
      
      opacityExpression.push(numericKey); // Use numericKey here
      opacityExpression.push(isTransparent ? 0 : 0.5); // Fully transparent for Private and Water
    });
  
    colorExpression.push('#9c8f59'); // Default color if no match is found
    opacityExpression.push(0.5); // Default opacity if no match is found
  
    // Return style based on layer type
    if (layerName === 'roads') {
      return {
        'line-color': colorExpression,
        'line-width': 2,
      };
    } else {
      return {
        'fill-color': colorExpression,
        'fill-opacity': opacityExpression, // Use dynamic opacity expression
      };
    }
  };
  
  

  
  // Define styles for different layers
  export const layerStyles = {
    ownership: {
      id: 'ownership-layer',
      type: 'fill', // Keep it as 'fill' to retain clickability on the interior
      'source-layer': 'combined_ownership', // This should match your Martin tile server
      paint: {
        'fill-color': 'rgba(0, 0, 0, 0.01)', // Very light fill (almost transparent)
        'fill-outline-color': 'rgb(255, 0, 0)', // Red border to highlight boundaries
        'fill-opacity': 0.5, // Adjust opacity for better visibility (0.2 is very light)
      },
      layout: {
        visibility: 'visible',
      },
    },
    
    precincts: {
      id: 'precincts-layer',
      type: 'fill',
      'source-layer': 'precincts', // Adjust based on your vector tile source
      paint: {}, // Dynamic paint will be applied later
      layout: {
          visibility: 'visible',
      },
    },
    FEMA_updated: {
      id: 'FEMA_updated-layer',
      type: 'fill',
      'source-layer': 'FEMA_updated', // Adjust based on your vector tile source
      paint: {}, // Dynamic paint will be applied later
      layout: {
          visibility: 'visible',
      },
    },
  ownership_outer_borders: {
    id: "ownership_outer_borders",
    type: "line",
    "source-layer": "combined_ownership",
    paint: {
      "line-color": "rgb(0, 0, 0)", // Black outline (default, changes based on basemap)
      "line-width": 0.5, // 0.5px line
      "line-opacity": 1, // Make it visible
    },
    layout: {
      visibility: "visible",
    },
  },
  ownership_inner_borders: {
    id: "ownership_inner_borders",
    type: "line",
    "source-layer": "combined_ownership",
    paint: {
      "line-color": "rgb(255, 255, 255)", // White outline
      "line-width": 0, // Hidden - not using this layer
      "line-opacity": 0, // Hidden
    },
    layout: {
      visibility: "visible",
    },
  },
    
    zoning: {
      id: 'zoning-layer',
      type: 'fill',
      'source-layer': 'zoning', // This should match your vector tile metadata
      paint: {}, // This will be filled dynamically
      layout: {
        visibility: 'visible',
      },
    },
    zoning_toj_zoning: {
      id: 'zoning_toj_zoning-layer',
      type: 'fill',
      'source-layer': 'zoning_toj_zoning', // This should match your vector tile metadata
      paint: {}, // This will be filled dynamically
      layout: {
        visibility: 'visible',
      },
    },
    zoning_toj_zoning_overlay: {
        id: 'zoning_toj_zoning_overlay-layer',
        type: 'fill',
        'source-layer': 'zoning_toj_zoning_overlay', // This should match your vector tile metadata
        paint: {}, // This will be filled dynamically
        layout: {
          visibility: 'visible',
        },
      },
      
      zoning_zoverlay: {
    id: 'zoning_zoverlay-layer',
    type: 'fill',
    'source-layer': 'zoning_zoverlay', // This should match your vector tile metadata
    paint: {}, // This will be filled dynamically
    layout: {
        visibility: 'visible',
        },
    },
    zoning_toj_corp_limity: {
      id: 'zoning_toj_corp_limit-fill-layer',
      type: 'fill', // Interior area remains clickable
      'source-layer': 'zoning_toj_corp_limit', // This should match your vector tile metadata
      paint: {
        'fill-color': 'rgba(0, 0, 0, 0)', // Fully transparent fill
        'fill-outline-color': '#0000FF', // Blue outline (used only if line layer isn't rendered)
        'fill-opacity': 1, // Fully transparent interior
      },
      layout: {
        visibility: 'visible',
      },
    },
    
    // New line layer for a thicker border
    zoning_toj_corp_limit: {
      id: 'zoning_toj_corp_limit-layer',
      type: 'line', // Line type for adjustable thickness
      'source-layer': 'zoning_toj_corp_limit', // This should match your vector tile metadata
      paint: {
        'line-color': '#0000FF', // Blue border
        'line-width': 4, // Adjust the thickness of the border (increase for thicker lines)
        'line-opacity': 1, // Ensure full visibility
      },
      layout: {
        visibility: 'visible',
      },
    },
    
      public_land: {
        id: 'public_land-layer',
        type: 'fill', // Keep it as 'fill' to retain clickability on the interior
        'source-layer': 'public_land', // This should match your vector tile metadata
        paint: {},
        layout: {
          visibility: 'visible',
        },
      },
      
      roads: {
        id: 'roads-layer',
        type: 'line', // Add a line layer to handle the thicker border
        'source-layer': 'roads', // This should match your vector tile metadata
        paint: {
          'line-color': '#0000FF', // Blue border color
          'line-width': 2, // Adjust thickness of the outline
        },
        layout: {
          visibility: 'visible',
        },
      },
    
    conservation_easements: {
      id: 'conservation_easements-layer',
      type: 'fill',
      'source-layer': 'conservation_easements',
      paint: {
        'fill-color': '#116e20',
        'fill-opacity': 0.5,
      },
      layout: {
        visibility: 'visible',
      },
    },
    mooose_reprojected: {
      id: 'mooose_reprojected-layer',
      type: 'fill',
      'source-layer': 'mooose_reprojected',
      paint: {
        'fill-color': 'rgb(78, 43, 4)',
        'fill-opacity': 0.7,
      },
      layout: {
        visibility: 'visible',
      },
    },
    reporjected_elk: {
      id: 'reporjected_elk-layer',
      type: 'fill',
      'source-layer': 'reporjected_elk',
      paint: {
        'fill-color': 'rgb(187, 124, 53)',
        'fill-opacity': 0.7,
      },
      layout: {
        visibility: 'visible',
      },
    },
    bigHorn_reporjected: {
      id: 'bigHorn_reporjected-layer',
      type: 'fill',
      'source-layer': 'bigHorn_reporjected',
      paint: {
        'fill-color': 'rgb(129, 142, 148)',
        'fill-opacity': 0.8,
      },
      layout: {
        visibility: 'visible',
      },
    },
    mule_deer_reporjected: {
      id: 'mule_deer_reporjected-layer',
      type: 'fill',
      'source-layer': 'mule_deer_reporjected',
      paint: {
        'fill-color': 'rgb(107, 85, 59)',
        'fill-opacity': 0.7,
      },
      layout: {
        visibility: 'visible',
      },
    },
    owndrship_address: {
      id: 'ownership_address-layer',
      type: 'symbol',
      'source-layer': 'ownership_address',
      defaultPaint: {},
      defaultLayout: {
        'icon-image': 'dot-10', // Default Mapbox marker icon (scaled for 15px size)
        'icon-size': 1.5,         // Adjust the size of the icon
        'icon-anchor': 'bottom',  // Anchor the icon at the bottom
        'icon-allow-overlap': true, // Allow markers to overlap
      },
      layout: {
        visibility: 'visible',
      },
    },
  };
  
  // Updated `getLayerStyle` function
  export const getLayerStyle = (layerName, features, baseMap) => {
    console.log('Getting style for layer:', layerName);
    console.log(baseMap)
    // Get the base style from layerStyles
    let style = layerStyles[layerName];
    console.log('Layer Name:', layerName);
  
    // Define layers that need dynamic styling based on zoning features
    const dynamicZoningLayers = ["FEMA_updated", "precincts", 'conservation_easements', 'zoning', 'public_land', 'zoning_toj_zoning', 'toj_zoning', 'zoning_toj_zoning_overlay','roads', 'zoning_zoverlay'];
    console.log(dynamicZoningLayers.includes(layerName))
    console.log(style)
    console.log(layerName.toLowerCase().includes('plss'))
    if (style) {
        if (dynamicZoningLayers.includes(layerName)) {
            console.log("Applying dynamic style for layer: ", layerName );
            const paint = getDynamicStyle(features, layerName);
            console.log('Generated Paint:', paint);
            style = {
                ...style,
                paint, // Use the dynamically created paint style
                source: layerName,
            };
        }
         else {
            console.log("came here edditing layers =============================================")
            const adjustedSource = 
            layerName === "ownership_borders" || 
            layerName === "ownership_outer_borders" || 
            layerName === "ownership_inner_borders" 
              ? "ownership"  // Use "ownership" source (not "combined_ownership")
              : layerName;
        

            style = {
                ...style,
                source: adjustedSource, // Set the source to match the layer name
            };
            console.log(layerName)
            console.log(baseMap.current)
            // 🔹 Adjust ownership border color based on basemap
            if(adjustedSource == "combined_ownership" || adjustedSource == "ownership"){
              // Handle fill layer (ownership)
              if (layerName === "ownership") {
                const isSatellite = baseMap.current === "satellite-streets-v12";
                const isHighDef = baseMap.current && (
                  baseMap.current.includes('high-def') || 
                  baseMap.current === 'teton-ortho-2024'
                );
                // White outline for all satellite layers (including high-def and teton-ortho)
                // Black on other basemaps
                const fillOutlineColor = (isSatellite || isHighDef) ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)";
                style.paint = {
                  ...style.paint,
                  "fill-outline-color": fillOutlineColor,
                };
              } 
              // Handle border layers - color changes based on basemap (like fill layer)
              else if (layerName === "ownership_outer_borders") {
                const isSatellite = baseMap.current === "satellite-streets-v12";
                const isHighDef = baseMap.current && (
                  baseMap.current.includes('high-def') || 
                  baseMap.current === 'teton-ortho-2024'
                );
                // White border for all satellite layers (including high-def and teton-ortho)
                // Black border for other basemaps
                const borderColor = (isSatellite || isHighDef) ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)";
                // Show the border layer with 0.5px border
                style.paint = {
                  "line-color": borderColor, // White on satellite, black on others
                  "line-width": 0.5, // 0.5px thick
                  "line-opacity": 1, // Fully visible
                };
                style.layout = {
                  visibility: "visible", // Show the layer
                };
                // Ensure source-layer is set correctly
                style["source-layer"] = "combined_ownership";
              }
              else if (layerName === "ownership_inner_borders") {
                // Hide inner border
                style.paint = {
                  "line-color": "rgb(255, 255, 255)",
                  "line-width": 0, // Hidden
                  "line-opacity": 0, // Hidden
                };
                style.layout = {
                  visibility: "visible",
                };
                // Ensure source-layer is set correctly
                style["source-layer"] = "combined_ownership";
              }
            }
            console.log("Will return this style: ", style);
        }
      return style;
    }
    if (layerName.toLowerCase().includes('plss')) {
        // Special styling for layers that have "plss" in their name
        console.log("Applying special styling for PLSS layer");
        return {
            id: `${layerName}-layer`,
            type: 'fill', // Polygon fill type for clickability
            source: layerName,
            'source-layer': layerName,
            paint: {
                'fill-color': 'rgba(0, 0, 0, 0)', // Fully transparent fill
                'fill-outline-color': '#000000', // Black outline
                'fill-opacity': 1, // No opacity
            },
            layout: {
                visibility: 'visible',
            },
        };
    }

    // If no style is found for the given layer, return a default style for testing purposes
    console.warn(`No style found for layer: ${layerName}. Using default style.`);
    let defaultPaint;
    let defaultLayout = {}; // Initialize defaultLayout
    let layerType;
    console.log(layerName);

    switch (layerName) {
      case 'ownership_address': // For points
      layerType = 'symbol';
      defaultPaint = {}; // No paint properties for symbols
      defaultLayout = {
        'icon-image': 'custom-pin', // Default Mapbox marker icon (scaled for 15px size)
        'icon-size': 0.05,         // Adjust the size of the icon
        'icon-anchor': 'bottom',  // Anchor the icon at the bottom
        'icon-allow-overlap': true, // Allow markers to overlap
      };

      // Add the source with clustering enabled
      style = {
        id: 'ownership-address-layer',
        type: layerType,
        source: {
          type: 'geojson',
           // Path to your GeoJSON file
          cluster: true, // Enable clustering
          clusterMaxZoom: 12, // Reduce max zoom to keep clusters grouped for longer
          clusterRadius: 100, // Radius of each cluster in pixels
        },
        paint: defaultPaint,
        layout: defaultLayout,
      };
      break;

      case 'control_points_controls': // For points
        layerType = 'circle';
        defaultPaint = {
          'circle-radius': 6,
          'circle-color': '#FF0000', // Red for testing visibility
          'circle-stroke-width': 1,
          'circle-stroke-color': '#000000', // Black outline for points
        };
        break;

      case 'precincts_polling_centers': // For points (NO CLUSTERING)
      layerType = 'circle';
      defaultPaint = {
        'circle-radius': 6,
        'circle-color': '#FF0000', // Red for testing visibility
        'circle-stroke-width': 1,
        'circle-stroke-color': '#000000', // Black outline for points
      };
      style = {
        id: 'precincts-polling-centers-layer',
        type: layerType,
        source: {
          type: 'geojson',
          data: 'src/assets/data/precincts_polling_centers.geojson',
          cluster: false, // Enable clustering // Ensure correct path

          // No clustering properties included here
        },
        paint: defaultPaint,
        layout: defaultLayout,
      };
      break;
      

      case 'plss_plss_labels': // For point labels
        layerType = 'symbol'; // Use symbol type for labels
        defaultPaint = {
          'text-color': '#000000', // Black text
          'text-halo-color': '#FFFFFF', // White halo for better readability
          'text-halo-width': 1,
        };
        defaultLayout = {
          'text-field': ['get', 'label'], // Ensure the "label" property exists in the features
          'text-size': 14, // Adjust text size
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], // Specify font
          'text-anchor': 'center', // Center the label
          visibility: 'visible',
        };
        break;

      case 'roads_easements': // Example for lines
        layerType = 'line';
        defaultPaint = {
          'line-color': '#896B3D', // Blue for roads
          'line-width': 1.25,
        };
        break;

      default: // Polygons (default)
        layerType = 'fill';
        defaultPaint = {
          'fill-color': '#FF00FF', // Magenta for testing visibility
          'fill-opacity': 0.5,
          'fill-outline-color': '#000000', // Black border for polygons
        };
        break;
    }

    return {
      id: `${layerName}-layer`,
      type: layerType,
      source: layerName,
      'source-layer': layerName,
      paint: defaultPaint,
      layout: {
        ...defaultLayout, // Include layout properties
        visibility: 'visible',
      },
    };
}

// Function to create label layer style for a given layer
export const getLabelLayerStyle = (layerName) => {
  const labelField = getLabelFieldForLayer(layerName);
  
  // Determine the correct source-layer name
  let sourceLayer = layerName;
  if (layerName === 'ownership') {
    sourceLayer = 'combined_ownership';
  }
  
  console.log(`Creating label layer for ${layerName}:`, {
    labelField,
    sourceLayer,
    source: layerName
  });
  
  return {
    id: `${layerName}-label-layer`,
    type: 'symbol',
    source: layerName,
    'source-layer': sourceLayer,
    layout: {
      'text-field': ['get', labelField],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-size': 12,
      'text-anchor': 'center',
      'text-offset': [0, 0],
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      visibility: 'visible',
    },
    paint: {
      'text-color': '#000000',
      'text-halo-color': '#FFFFFF',
      'text-halo-width': 2,
      'text-halo-blur': 1,
    },
  };
};
  
  
  
  
  
  