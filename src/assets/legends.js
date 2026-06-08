import {
  SURFACE_WATER_LEGEND,
  WETLAND_LEGEND,
  WILDFIRE_HAZARD_LEGEND,
  PRINCIPAL_AQUIFER_COLORS,
  TRANSMISSION_VOLT_CLASS_COLORS,
} from '../utils/hostedMapLayerConfig';

export const legends = {
  public_land: [
    { label: 'BLM — Bureau of Land Management', color: '#F4C430' },
    { label: 'FWS — Fish & Wildlife Service', color: '#FFA07A' },
    { label: 'USFS — Forest Service', color: '#77DD77' },
    { label: 'NPS — National Park Service', color: '#a670db' },
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
  soil: [{ label: 'Colored by map unit (earth tones)', color: '#a67c52', opacity: 0.72 }],
  surface_water: SURFACE_WATER_LEGEND,
  wetlands: WETLAND_LEGEND,
  boundaries_counties: [{ label: 'Colored by county ID', color: '#94a3b8' }],
  boundaries_congressional: [{ label: 'Colored by district ID', color: '#a78bfa' }],
  boundaries_places: [{ label: 'Colored by place ID', color: '#d97706' }],
  boundaries_urban_areas: [{ label: 'Colored by urban area ID', color: '#64748b' }],
  boundaries_tribal_lands: [{ label: 'Colored by tribal area ID', color: '#0f766e' }],
  opportunity_zones: [{ label: 'Qualified Opportunity Zone tract', color: '#f59e0b' }],
  principal_aquifers: Object.entries(PRINCIPAL_AQUIFER_COLORS)
    .filter(([key]) => key !== 'default')
    .map(([label, color]) => ({ label, color })),
  transmission_lines: Object.entries(TRANSMISSION_VOLT_CLASS_COLORS)
    .filter(([key]) => key !== 'default')
    .map(([label, color]) => ({ label: `Voltage ${label}`, color })),
  wildfire_hazard: WILDFIRE_HAZARD_LEGEND,
  ownership: [{ label: '', color: '#000000' }],
};
