import {
  SURFACE_WATER_LEGEND,
  WETLAND_LEGEND,
  PRINCIPAL_AQUIFER_COLORS,
  PUBLIC_LAND_STATE_COLOR,
  TRANSMISSION_VOLT_CLASS_COLORS,
} from '../utils/hostedMapLayerConfig';

/** Per-feature symbology — a static legend cannot represent the layer. */
export const LEGEND_CLICK_FOR_DETAILS_LAYERS = new Set([
  'soil',
  'boundaries_counties',
  'boundaries_congressional',
  'boundaries_places',
  'boundaries_urban_areas',
  'boundaries_tribal_lands',
]);

/** Multi-item legends with at most this many entries start expanded. */
export const LEGEND_AUTO_EXPAND_MAX_ITEMS = 6;

export const legends = {
  public_land: [
    { label: 'BLM — Bureau of Land Management', color: '#F4C430' },
    { label: 'FWS — Fish & Wildlife Service', color: '#FFA07A' },
    { label: 'USFS — Forest Service', color: '#77DD77' },
    { label: 'NPS — National Park Service', color: '#a670db' },
    { label: 'State land', color: PUBLIC_LAND_STATE_COLOR },
    { label: 'NRCS', color: '#4169E1' },
    { label: 'DOD', color: '#708090' },
    { label: 'USACE', color: '#5F9EA0' },
    { label: 'USBR', color: '#4682B4' },
    { label: 'DOE', color: '#9370DB' },
    { label: 'TVA', color: '#20B2AA' },
    { label: 'Other federal (OTHF)', color: '#A9A9A9' },
  ],
  conservation_easements: [
    { label: 'Conservation easement', color: '#9ca3af', opacity: 0.42 },
  ],
  surface_water: SURFACE_WATER_LEGEND,
  wetlands: WETLAND_LEGEND,
  opportunity_zones: [{ label: 'Qualified Opportunity Zone tract', color: '#f59e0b' }],
  principal_aquifers: Object.entries(PRINCIPAL_AQUIFER_COLORS)
    .filter(([key]) => key !== 'default')
    .map(([label, color]) => ({ label, color })),
  transmission_lines: Object.entries(TRANSMISSION_VOLT_CLASS_COLORS)
    .filter(([key]) => key !== 'default')
    .map(([label, color]) => ({ label: `Voltage ${label}`, color })),
  ownership: [{ label: '', color: '#000000' }],
};
