import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMapContext } from '../pages/MapContext';
import { hasPropertyBoundary } from '../utils/printPropertyBoundary';

const STORAGE_KEYS = {
  map: 'cv_map_tour_completed_v1',
  'print-map': 'cv_print_map_tour_completed_v1',
};

function tourStorageKey(mode) {
  return STORAGE_KEYS[mode] || STORAGE_KEYS.map;
}

function readTourCompleted(mode) {
  try {
    return localStorage.getItem(tourStorageKey(mode)) === '1';
  } catch {
    return false;
  }
}

function writeTourCompleted(mode) {
  try {
    localStorage.setItem(tourStorageKey(mode), '1');
  } catch {
    /* ignore */
  }
}

/** Route a step must be on so Next/Back always land in the right place. */
function requiredRouteForStep(step, mode) {
  if (!step) return null;
  if (step.navigateTo) return step.navigateTo;
  if (mode === 'print-map') return '/print';
  const id = step.id;
  if (id === 'search-county' || id === 'search-run' || id === 'search-actions') {
    return '/search';
  }
  // Header/nav step can be explored elsewhere; every other map-tour step needs the map.
  if (id === 'header') return null;
  return '/map';
}

/**
 * overlayMode: 'spotlight' (default) | 'blocks-only' — blocks-only uses UI blockers, no 4-rect hole (map stays usable).
 * blockSelectors: extra pointer + dim layers on top of these elements (Chrome).
 * tooltipAnchorSelector: position the card relative to this element instead of the spotlight hole.
 * tooltipPlacement: 'bottom' | 'top' | 'left' | 'right' | 'center' | 'sidepanel-right' | 'basemap-left' | 'tools-left'
 */
/** @type {any[]} */
export const TUTORIAL_WALKTHROUGH_STEPS = [
  {
    id: 'intro',
    title: 'Welcome to the Map!',
    body: `This is the main map for property ownership and any other layer.

We're going to walk through how to use the platform starting from this view of the USA.`,
    center: true,
    blurMap: true,
  },
  {
    id: 'header',
    title: 'Navigation Bar',
    body: `Before hopping into the map you **NEED** to understand this header navigation.

Clicking the buttons in this header navigate you to the features on the platform.

• Map takes you to the land map.
• Search allows you to search for properties.
• Marketing will help you sell your listing.

You can manage your account details in the top right, and re-enter the tutorial with the question mark.`,
    targetSelector: '[data-tour="product-nav"]',
    placement: 'bottom',
    responsiveNote:
      'On small screens some tabs hide—use the strip during this tour or a wider window.',
  },
  {
    id: 'map-main',
    title: 'The main map',
    body: `Map interaction basics:
• Click and drag to pan the map
• Scroll wheel / trackpad pinch to zoom`,
    overlayMode: 'blocks-only',
    blockSelectors: [
      '[data-tour="product-nav"]',
      '[data-tour="side-panel-shell"]',
      '[data-tour="tool-panel"]',
      '[data-tour="basemap-selector"]',
      '[data-tour="map-3d-toggle"]',
      '[data-tour="map-contours-toggle"]',
      '[data-tour="location-zoom"]',
    ],
    tooltipAnchorSelector: '[data-tour="product-nav"]',
    tooltipPlacement: 'bottom',
  },
  {
    id: 'geolocate',
    title: 'Zoom to you',
    body: `Let's start by zooming to your location.

When you click the zoom to me button the map view will zoom to your location.

This location will then be saved as your default location in the future.

Click the crosshair in the bottom right to continue.`,
    targetSelector: '[data-tour="location-zoom"]',
    tooltipAnchorSelector: '[data-tour="product-nav"]',
    tooltipPlacement: 'bottom',
  },
  {
    id: 'parcel-select',
    title: 'Select a nearby parcel',
    body: `Now let's see some ownership information.

Click a parcel nearby and the side panel will open showing its details.`,
    overlayMode: 'blocks-only',
    blockSelectors: [
      '[data-tour="product-nav"]',
      '[data-tour="tool-panel"]',
      '[data-tour="basemap-selector"]',
      '[data-tour="map-3d-toggle"]',
      '[data-tour="map-contours-toggle"]',
      '[data-tour="location-zoom"]',
    ],
    tooltipAnchorSelector: '[data-tour="product-nav"]',
    tooltipPlacement: 'bottom',
  },
  {
    id: 'side-info',
    title: 'Parcel info card',
    body: `When you click a parcel, its generic basic information will populate here.

This will show:
• Owner
• Parcel ID
• Address and location

Click the Property Details in the card to see more details on the property. When you're ready to move on click Next.`,
    targetSelector: '[data-tour="info-tab-scroll"]',
    placement: 'left',
    tooltipPlacement: 'sidepanel-right',
  },
  {
    id: 'side-layers',
    title: 'Side Panel Layers and Info',
    body: `The side panel has two main uses. It shows information about parcels and clicked features, and it manages what layers are toggled.

You are currently on the Info pane of the side panel. Click Layers to see what layers you can toggle.`,
    targetSelector: '[data-tour="side-panel-tabs"]',
    placement: 'left',
    tooltipPlacement: 'sidepanel-right',
  },
  {
    id: 'public-land-layer',
    title: 'Layer Tab',
    body: `The Layers tab has all the layers CommunityView can show on the map. They are in categories which can be expanded and minimized.

To toggle a layer simply click the box next to it.

**Toggle the Public Land layer.**`,
    targetSelector: '[data-tour="side-panel-shell"]',
    placement: 'left',
    tooltipPlacement: 'sidepanel-right',
  },
  {
    id: 'layers-explore',
    title: 'Legend and owner names',
    body: `**Expand the Public Land legend by clicking Legend below the layer name** to see what each color means on the map.

Then **turn on Owner name** on the Ownership layer so names appear on parcels.

Explore freely — Next unlocks after both are done.`,
    overlayMode: 'blocks-only',
    tooltipAnchorSelector: '[data-tour="side-panel-shell"]',
    tooltipPlacement: 'sidepanel-right',
  },
  {
    id: 'basemap-open',
    title: 'Click to change basemaps',
    body: 'Click the basemap button in the bottom right to open the basemap picker.',
    targetSelector: '[data-tour="basemap-toggle-button"]',
    placement: 'left',
    tooltipPlacement: 'basemap-button-left',
  },
  {
    id: 'basemap-select',
    title: 'Select a new basemap',
    body: 'Choose a different basemap — try Imagery, Satellite, Streets, or Discover. Next unlocks after you change it once.',
    targetSelector: '[data-tour="basemap-popup"]',
    placement: 'left',
    tooltipPlacement: 'screen-center',
  },
  {
    id: 'basemap-3d',
    title: '3D terrain',
    body: `The 3D button makes the map 3D so you can see the layout of land better.

Click 3D to turn it on. Then hold Control and drag on the map to tilt and rotate — or right-click and drag. Try it, then click Next when you're ready.`,
    targetSelector: '[data-tour="map-3d-toggle"]',
    placement: 'left',
    overlayMode: 'blocks-only',
    blockSelectors: [
      '[data-tour="product-nav"]',
      '[data-tour="side-panel-shell"]',
      '[data-tour="tool-panel"]',
      '[data-tour="basemap-selector"]',
      '[data-tour="location-zoom"]',
      '[data-tour="map-contours-toggle"]',
    ],
    tooltipAnchorSelector: '[data-tour="map-3d-toggle"]',
    tooltipPlacement: 'tools-left',
  },
  {
    id: 'basemap-contours',
    title: 'Contour lines',
    body: 'Turn contours on when you want topo context layered over the basemap.',
    targetSelector: '[data-tour="map-contours-toggle"]',
    placement: 'left',
  },
  {
    id: 'tools-zoom',
    title: 'Zoom controls',
    body:
      'The + and − buttons on the tool panel zoom the map in and out. Try them if you want, then click Next.',
    targetSelector: '[data-tour="tool-zoom"]',
    placement: 'left',
    responsiveNote: 'This tool panel is hidden on smaller mobile layouts.',
  },
  {
    id: 'tools-draw-line',
    title: 'Draw a line',
    body:
      'Click the line tool (highlighted), then click on the map to start measuring or sketching. Double-click to finish the line. Click Next when you are done.',
    targetSelector: '[data-tour="tool-draw-line"]',
    placement: 'left',
    overlayMode: 'blocks-only',
    blockSelectors: [
      '[data-tour="product-nav"]',
      '[data-tour="side-panel-shell"]',
      '[data-tour="basemap-selector"]',
      '[data-tour="location-zoom"]',
      '[data-tour="map-3d-toggle"]',
      '[data-tour="map-contours-toggle"]',
      '[data-tour="tool-zoom"]',
      '[data-tour="tool-draw-polygon"]',
      '[data-tour="tool-delete-selected"]',
      '[data-tour="tool-clear-all"]',
    ],
    tooltipAnchorSelector: '[data-tour="tool-draw-line"]',
    tooltipPlacement: 'tools-left',
    responsiveNote: 'These drawing controls are desktop-only in the current layout.',
  },
  {
    id: 'tools-draw-polygon',
    title: 'Draw a polygon',
    body:
      'The polygon tool works the same way for areas — click to place corners, double-click to finish. You can try it quickly, then click Next.',
    targetSelector: '[data-tour="tool-draw-polygon"]',
    placement: 'left',
    responsiveNote: 'These drawing controls are desktop-only in the current layout.',
  },
  {
    id: 'tools-trash',
    title: 'Delete selected',
    body:
      'Use the trash button to remove the drawing you have selected on the map.',
    targetSelector: '[data-tour="tool-delete-selected"]',
    placement: 'left',
    responsiveNote: 'These cleanup controls are desktop-only in the current layout.',
  },
  {
    id: 'tools-clear',
    title: 'Clear all',
    body:
      'Click the X button to clear every drawing and temporary shape from the map. Next unlocks after you clear.',
    targetSelector: '[data-tour="tool-clear-all"]',
    placement: 'left',
    responsiveNote: 'These cleanup controls are desktop-only in the current layout.',
  },
  {
    id: 'search-nav',
    title: 'Open Search',
    body:
      "Let's search for a property. Click Search to open the search bar.",
    targetSelector: '[data-tour="header-tab-search"]',
    placement: 'bottom',
    tooltipAnchorSelector: '[data-tour="header-tab-search"]',
    tooltipPlacement: 'bottom',
    responsiveNote: 'On phones, use the Search button in the tour strip at the top.',
  },
  {
    id: 'search-county',
    title: 'Search your county',
    body: `Before searching, it's best to filter down the results by county.

Click **Map center** on the right to search the county the map is centered in. That county choice will be saved as your default for later searches.

If you want to search nationwide, click **Nationwide** on the left.`,
    targetSelector: '[data-tour="county-filter"]',
    placement: 'bottom',
  },
  {
    id: 'search-run',
    title: 'Run a county search',
    body: `Enter the name of someone or an address and press Enter to search.

Next unlocks once results appear.`,
    overlayMode: 'blocks-only',
    tooltipAnchorSelector: '[data-tour="search-bar-controls"]',
    tooltipPlacement: 'bottom',
    emphasizeTarget: true,
  },
  {
    id: 'search-actions',
    title: 'Map a result',
    body:
      'Each result row includes Map so you can jump back to the parcel on the map and keep working there.',
    overlayMode: 'blocks-only',
    tooltipAnchorSelector: '[data-tour="search-bar-controls"]',
    tooltipPlacement: 'bottom',
  },
];

/** @type {any[]} */
export const PRINT_MAP_WALKTHROUGH_STEPS = [
  {
    id: 'print-intro',
    title: 'Map maker',
    body:
      'This quick tour covers the map-making workspace: the side panel, the live map, and save/share in the header.',
    center: true,
    blurMap: true,
  },
  {
    id: 'print-panel',
    title: 'Map builder panel',
    body:
      'Use this panel to control the map you are building. It groups basemap choices, layer access, map items, image uploads, and map elements in one place.',
    targetSelector: '[data-tour="print-builder-panel"]',
    placement: 'right',
    tooltipPlacement: 'sidepanel-right',
  },
  {
    id: 'print-elements',
    title: 'Map elements',
    body:
      'Choose a map element here, then click on the map to place it. This is where you add notes, symbols, lines, shapes, and other layout graphics.',
    targetSelector: '[data-tour="print-elements-panel"]',
    placement: 'right',
    tooltipPlacement: 'sidepanel-right',
  },
  {
    id: 'print-basemap-layers',
    title: 'Basemap and layers',
    body:
      'Use Basemap to change the background, or use Layers when you want the full layer list from the main map while editing this map.',
    targetSelector: '[data-tour="print-basemap-panel"]',
    placement: 'right',
    tooltipPlacement: 'sidepanel-right',
  },
  {
    id: 'print-save-share',
    title: 'Save and share',
    body:
      'Save Map stores your work, Back to Maps exits edit mode, and Share & generate opens the sharing kit for this map.',
    targetSelector: '[data-tour="print-header-actions"]',
    placement: 'bottom',
  },
];

/**
 * Map-maker tour when a property boundary is already on the map
 * (Create Map or wizard).
 * @type {any[]}
 */
export const PRINT_MAP_BOUNDARY_WALKTHROUGH_STEPS = [
  {
    id: 'print-intro',
    title: 'Your listing map',
    body: `Your property boundary is already on this map.

We'll walk through how to make a custom map for your listing.`,
    center: true,
    blurMap: true,
  },
  {
    id: 'print-workspace',
    title: 'The side panel',
    body: `This side panel is your workspace while you build a listing map.

• **Layers** — toggle map data layers (ownership, public land, and more)
• **Info** — details for parcels or features you click on the map (layer must be toggled)
• **Editor** — everything you need to build the map: basemap, map items, and property photos`,
    targetSelector: '[data-tour="side-panel-tabs"]',
    placement: 'right',
    tooltipPlacement: 'sidepanel-right',
  },
  {
    id: 'print-editor-sections',
    title: 'Editor sections',
    body: `The **Editor** tab has sections for building your map.

• **Basemap** — choose the basemap you want
• **Layers** — takes you to the Layers tab
• **Map items** — shows what's already on the map
• **Image gallery** — upload photos for the map
• **Map elements** — add icons, lines, and shapes to the map`,
    targetSelector: '[data-tour="print-builder-panel"]',
    placement: 'right',
    tooltipPlacement: 'sidepanel-right',
  },
  {
    id: 'print-elements',
    title: 'Map elements',
    body: `Scroll down to **Map elements** to see the different icons and shapes you can add to the map.`,
    targetSelector: '[data-tour="print-elements-panel"]',
    placement: 'right',
    tooltipPlacement: 'sidepanel-right',
  },
  {
    id: 'print-select-boundary',
    title: 'Select the property boundary',
    body: `Click the **property boundary** outline on the map.

That selects it and opens the feature editor so you can style and label it.`,
    overlayMode: 'blocks-only',
    blockSelectors: [
      '[data-tour="product-nav"]',
      '[data-tour="side-panel-shell"]',
      '[data-tour="tool-panel"]',
      '[data-tour="basemap-selector"]',
      '[data-tour="location-zoom"]',
      '[data-tour="map-3d-toggle"]',
      '[data-tour="map-contours-toggle"]',
      '[data-tour="print-header-actions"]',
    ],
    tooltipPlacement: 'basemap-away',
  },
  {
    id: 'print-feature-editor',
    title: 'Edit the boundary',
    body: `The panel on the right lets you edit the feature's attributes.

Change the name at the top, then toggle **Show label**.

You can drag this label.

You can add photos, change the color, and even change the label attributes.

Explore around and click Next when ready.`,
    overlayMode: 'blocks-only',
    blockSelectors: [
      '[data-tour="product-nav"]',
      '[data-tour="side-panel-shell"]',
      '[data-tour="print-header-actions"]',
    ],
    tooltipPlacement: 'basemap-away',
  },
  {
    id: 'print-save',
    title: 'Save your map',
    body: `Click **Save Map** in the header.

We'll fill in the title and description next.`,
    targetSelector: '[data-tour="print-save-button"]',
    placement: 'bottom',
  },
  {
    id: 'print-save-dialog',
    title: 'Name and description',
    body: `Give your map a **title** and an optional **property description** (comments for clients).

Then click **Save** in this popup to store the map.`,
    targetSelector: '[data-tour="print-save-dialog"]',
    placement: 'left',
    tooltipPlacement: 'basemap-away',
    emphasizeTarget: true,
  },
  {
    id: 'print-share-click',
    title: 'Share & generate',
    body: `Click **Share & generate** in the header to see what ways you can share your map.`,
    targetSelector: '[data-tour="print-share-button"]',
    placement: 'bottom',
  },
  {
    id: 'print-share',
    title: 'Your listing share options',
    body: `Here are your listing share options.

Each of them has a description and shows off your property in a different way.

Click Finish and explore the share options.`,
    center: true,
  },
];

const TutorialWalkthroughContext = createContext(null);

export function TutorialWalkthroughProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { printElements } = useMapContext();
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [mode, setMode] = useState('map');
  const [printTourVariant, setPrintTourVariant] = useState('basic');
  const steps =
    mode === 'print-map'
      ? printTourVariant === 'boundary'
        ? PRINT_MAP_BOUNDARY_WALKTHROUGH_STEPS
        : PRINT_MAP_WALKTHROUGH_STEPS
      : TUTORIAL_WALKTHROUGH_STEPS;

  const currentStep = isActive ? steps[stepIndex] || null : null;
  const isLastStep = stepIndex >= steps.length - 1;

  const ensureStepRoute = useCallback(
    (step) => {
      const route = requiredRouteForStep(step, mode);
      if (!route) return;
      if (location.pathname !== route) {
        navigate(route);
      }
    },
    [location.pathname, mode, navigate]
  );

  const start = useCallback((nextMode = 'map', options = {}) => {
    setMode(nextMode);
    setStepIndex(0);
    setIsActive(true);
    if (nextMode === 'print-map') {
      const forced = options.variant === 'boundary' || options.variant === 'basic' ? options.variant : null;
      setPrintTourVariant(
        forced || (hasPropertyBoundary(printElements) ? 'boundary' : 'basic')
      );
      if (!options.skipNavigate) {
        navigate('/print');
      }
    } else {
      setPrintTourVariant('basic');
      if (!options.skipNavigate) {
        navigate('/map');
      }
    }
  }, [navigate, printElements]);

  const startPrint = useCallback((options) => {
    start('print-map', options || {});
  }, [start]);

  const stop = useCallback((markComplete = false) => {
    if (markComplete) {
      writeTourCompleted(mode);
    }
    setIsActive(false);
    setStepIndex(0);
    setMode('map');
    setPrintTourVariant('basic');
  }, [mode]);

  const next = useCallback(() => {
    if (!isActive) return;
    const nextIndex = stepIndex + 1;
    if (nextIndex >= steps.length) {
      stop(true);
      return;
    }
    const nextStep = steps[nextIndex];
    ensureStepRoute(nextStep);
    setStepIndex(nextIndex);
  }, [isActive, stepIndex, stop, steps, ensureStepRoute]);

  const back = useCallback(() => {
    if (!isActive || stepIndex <= 0) return;
    const prevIndex = stepIndex - 1;
    const prevStep = steps[prevIndex];
    ensureStepRoute(prevStep);
    setStepIndex(prevIndex);
  }, [isActive, stepIndex, steps, ensureStepRoute]);

  const value = useMemo(
    () => ({
      isActive,
      mode,
      printTourVariant,
      stepIndex,
      currentStep,
      isLastStep,
      totalSteps: steps.length,
      start,
      startPrint,
      stop,
      next,
      back,
      hasCompletedTour: (tourMode = 'map') => readTourCompleted(tourMode),
    }),
    [
      isActive,
      mode,
      printTourVariant,
      stepIndex,
      currentStep,
      isLastStep,
      steps.length,
      start,
      startPrint,
      stop,
      next,
      back,
    ]
  );

  return (
    <TutorialWalkthroughContext.Provider value={value}>{children}</TutorialWalkthroughContext.Provider>
  );
}

export function useTutorialWalkthrough() {
  const ctx = useContext(TutorialWalkthroughContext);
  if (!ctx) {
    throw new Error('useTutorialWalkthrough must be used within TutorialWalkthroughProvider');
  }
  return ctx;
}
