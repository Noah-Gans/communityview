import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'cv_interactive_tour_completed_v1';

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
    title: 'Welcome',
    body: `We’ll start from a clean default:
• High Def basemap (flat, not 3D)
• Ownership layer on
• No active drawings/highlights

Then we’ll walk through navigation, map interaction, parcel info, and search.`,
    center: true,
    blurMap: true,
  },
  {
    id: 'header',
    title: 'Main navigation',
    body: `What each top button does:
• Home logo: returns to the landing page
• Map: opens the interactive parcel map
• Search: finds parcels by owner, address, or APN
• Maps: create and share custom property maps for listings
• ? button: starts this guided walkthrough
• Account: settings, subscription, and sign out`,
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
      '[data-tour="location-zoom"]',
    ],
    tooltipAnchorSelector: '[data-tour="product-nav"]',
    tooltipPlacement: 'bottom',
  },
  {
    id: 'geolocate',
    title: 'Zoom to your area',
    body: `Click the location button on the map to fly to where you are.
Zooming to yourself also resets your default view — the map will open here the next time you return.
Does this look like your local area?`,
    targetSelector: '[data-tour="location-zoom"]',
    tooltipAnchorSelector: '[data-tour="product-nav"]',
    tooltipPlacement: 'bottom',
  },
  {
    id: 'parcel-select',
    title: 'Select a nearby parcel',
    body:
      'Click a parcel boundary near where you zoomed. The side panel will open with ownership and property details for that parcel.',
    overlayMode: 'blocks-only',
    blockSelectors: [
      '[data-tour="product-nav"]',
      '[data-tour="tool-panel"]',
      '[data-tour="basemap-selector"]',
      '[data-tour="location-zoom"]',
    ],
    tooltipAnchorSelector: '[data-tour="product-nav"]',
    tooltipPlacement: 'bottom',
  },
  {
    id: 'side-info',
    title: 'Parcel info card',
    body: `You selected a parcel — here is where the details live:
• Owner
• Parcel ID
• Address and location

You can scroll here, and use the Property Details control inside the card when you want more fields.`,
    targetSelector: '[data-tour="info-tab-scroll"]',
    placement: 'left',
    tooltipPlacement: 'sidepanel-right',
  },
  {
    id: 'info-details',
    title: 'Expand property details',
    body:
      'Click the Property details control in the parcel card to expand the deeper parcel fields. The tour will continue as soon as those details open.',
    targetSelector: '[data-tour="info-see-more-details"]',
    placement: 'left',
    tooltipPlacement: 'sidepanel-right',
  },
  {
    id: 'side-layers',
    title: 'Side panel — Layers',
    body:
      'Stay on Info for a second, then click the Layers tab above. The tour auto-continues as soon as you switch tabs.',
    targetSelector: '[data-tour="side-panel-tabs"]',
    placement: 'left',
    tooltipPlacement: 'sidepanel-right',
  },
  {
    id: 'public-land-layer',
    title: 'Public Land and owner names',
    body:
      'In Layers, turn on Public Land in Environment, then turn on the owner-name label button in Ownership. The tour will continue automatically after both are on.',
    targetSelector: '[data-tour="side-panel-shell"]',
    placement: 'left',
    tooltipPlacement: 'sidepanel-right',
  },
  {
    id: 'basemap-control',
    title: 'Basemap picker',
    body: `Use this popup to swap the map background.
Try Discover, Imagery, Satellite, or Streets depending on whether you want cleaner labels or more photo detail.`,
    targetSelector: '[data-tour="basemap-popup"]',
    placement: 'left',
    tooltipPlacement: 'screen-center',
  },
  {
    id: 'basemap-3d',
    title: '3D terrain',
    body:
      'The 3D button tilts the imagery basemap onto terrain so ridges, slopes, and elevation changes read more clearly.',
    targetSelector: '[data-tour="map-3d-toggle"]',
    placement: 'left',
  },
  {
    id: 'basemap-contours',
    title: 'Contour lines',
    body:
      'Turn contours on when you want topo context layered over the basemap. It is useful for reading terrain without leaving the map view.',
    targetSelector: '[data-tour="map-contours-toggle"]',
    placement: 'left',
  },
  {
    id: 'tools-overview',
    title: 'Tool panel',
    body:
      'This desktop tool stack gives you quick map actions. The top buttons zoom in and out, and the lower buttons help draw and clean up shapes.',
    targetSelector: '[data-tour="tool-panel"]',
    placement: 'left',
    responsiveNote: 'This tool panel is hidden on smaller mobile layouts.',
  },
  {
    id: 'tools-draw',
    title: 'Draw tools',
    body:
      'Use the line and polygon tools to measure or sketch directly on the map. Finish a shape with a double-click.',
    targetSelector: '[data-tour="tool-draw-line"]',
    placement: 'left',
    responsiveNote: 'These drawing controls are desktop-only in the current layout.',
  },
  {
    id: 'tools-clear',
    title: 'Delete and clear',
    body:
      'Use the trash button to remove the selected drawing, or the X button to clear every drawing and temporary shape from the map.',
    targetSelector: '[data-tour="tool-delete-selected"]',
    placement: 'left',
    responsiveNote: 'These cleanup controls are desktop-only in the current layout.',
  },
  {
    id: 'search-nav',
    title: 'Open Search',
    body:
      'Click Search in the bar above to open the search page. We’ll use Standard Search only.',
    targetSelector: '[data-tour="header-tab-search"]',
    placement: 'bottom',
    tooltipAnchorSelector: '[data-tour="header-tab-search"]',
    tooltipPlacement: 'bottom',
  },
  {
    id: 'search-type',
    title: 'Run a search',
    body:
      'Enter an owner, address, or APN, then press Enter or click the Search button. Next unlocks once results appear.',
    targetSelector: '[data-tour="search-bar-controls"]',
    placement: 'bottom',
  },
  {
    id: 'search-county-filter',
    title: 'County filtering',
    body:
      'Use county filters to narrow the search. If no counties are selected, the search runs nationwide.',
    targetSelector: '[data-tour="county-filter"]',
    placement: 'bottom',
  },
  {
    id: 'search-actions',
    title: 'Map a result',
    body:
      'Each result row includes Map so you can jump back to the parcel on the map and keep working there.',
    center: true,
  },
];

/** @type {any[]} */
export const PRINT_MAP_WALKTHROUGH_STEPS = [
  {
    id: 'print-intro',
    title: 'Map maker',
    body:
      'This quick tour covers the map-making workspace: the print builder panel on the left, the live map canvas in the middle, and the save/share controls in the header.',
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
      'Save Map stores your work, Back to Maps exits edit mode, and Share Map opens the sharing flow for this map.',
    targetSelector: '[data-tour="print-header-actions"]',
    placement: 'bottom',
  },
];

const TutorialWalkthroughContext = createContext(null);

export function TutorialWalkthroughProvider({ children }) {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [mode, setMode] = useState('map');
  const steps = mode === 'print-map' ? PRINT_MAP_WALKTHROUGH_STEPS : TUTORIAL_WALKTHROUGH_STEPS;

  const currentStep = isActive ? steps[stepIndex] || null : null;
  const isLastStep = stepIndex >= steps.length - 1;

  const start = useCallback((nextMode = 'map') => {
    setMode(nextMode);
    setStepIndex(0);
    setIsActive(true);
    navigate(nextMode === 'print-map' ? '/print' : '/map');
  }, [navigate]);

  const startPrint = useCallback(() => {
    start('print-map');
  }, [start]);

  const stop = useCallback((markComplete = false) => {
    setIsActive(false);
    setStepIndex(0);
    setMode('map');
    if (markComplete) {
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        /* ignore */
      }
    }
  }, []);

  const next = useCallback(() => {
    if (!isActive) return;
    const nextIndex = stepIndex + 1;
    if (nextIndex >= steps.length) {
      stop(true);
      return;
    }
    const nextStep = steps[nextIndex];
    if (nextStep?.navigateTo) {
      navigate(nextStep.navigateTo);
    }
    setStepIndex(nextIndex);
  }, [isActive, stepIndex, navigate, stop, steps]);

  const back = useCallback(() => {
    if (!isActive || stepIndex <= 0) return;
    const prevIndex = stepIndex - 1;
    const leaving = steps[stepIndex];
    const prevStep = steps[prevIndex];
    if (mode === 'map' && leaving?.id === 'search-type' && prevStep?.id === 'search-nav') {
      navigate('/map');
    }
    setStepIndex(prevIndex);
  }, [isActive, stepIndex, navigate, mode, steps]);

  const value = useMemo(
    () => ({
      isActive,
      mode,
      stepIndex,
      currentStep,
      isLastStep,
      totalSteps: steps.length,
      start,
      startPrint,
      stop,
      next,
      back,
      hasCompletedTour: () => {
        try {
          return localStorage.getItem(STORAGE_KEY) === '1';
        } catch {
          return false;
        }
      },
    }),
    [isActive, mode, stepIndex, currentStep, isLastStep, steps.length, start, startPrint, stop, next, back]
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
