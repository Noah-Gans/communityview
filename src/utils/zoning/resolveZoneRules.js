import nm2Rules from '../../data/zoning/wy-jackson-town/nm-2.json';
import { getZoningOrdinanceReviewLinks } from './jacksonLdrLinks';

/** Curated LDR rule packs (highest confidence). */
const ZONE_RULES_BY_CODE = {
  'NM-2': nm2Rules,
};

/** Regrid sentinel values for standardized zoning numerics. */
const REGRID_VARIES = -5555;
const REGRID_NA = -9999;

function candidatesFromRaw(raw) {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  const upper = s.toUpperCase();
  const out = new Set([upper, upper.replace(/\s+/g, '')]);
  const m = upper.match(/\b([A-Z]{1,4})-?(\d+[A-Z]?)\b/);
  if (m) {
    out.add(`${m[1]}-${m[2]}`);
    out.add(`${m[1]}${m[2]}`);
  }
  return [...out];
}

function displayZoneCode(raw, tries) {
  if (tries?.[0]) {
    const m = String(tries[0]).match(/^([A-Z]{1,4})-?(\d+[A-Z]?)$/);
    if (m) return `${m[1]}-${m[2]}`;
    return tries[0];
  }
  return String(raw || '').trim() || 'UNKNOWN';
}

/**
 * Parse a Regrid zoning numeric. Skips "Varies"; treats N/A as 0.
 * @returns {number|null}
 */
export function parseRegridZoningFeet(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n === REGRID_VARIES) return null;
  if (n === REGRID_NA) return 0;
  if (n < 0) return null;
  return n;
}

function firstFeet(...vals) {
  for (const v of vals) {
    const n = parseRegridZoningFeet(v);
    if (n != null) return n;
  }
  return null;
}

/** Pull scalar zoning props from parcel + attached Regrid zoning feature(s). */
function collectZoningScalars(parcelProps = {}) {
  const out = { ...parcelProps };
  const features = parcelProps.__regridZoningFeatures;
  if (Array.isArray(features)) {
    features.forEach((f) => {
      const p = f?.properties;
      if (!p || typeof p !== 'object') return;
      Object.entries(p).forEach(([k, v]) => {
        if (v == null || v === '') return;
        if (typeof v === 'object') return;
        if (out[k] == null || out[k] === '') out[k] = v;
      });
    });
  }
  return out;
}

/**
 * Estimate primary-building setbacks when Regrid/LDR numbers are missing.
 * Tuned as rough Town of Jackson / Teton residential defaults — labeled approximate.
 */
export function estimateSetbacksForZoneCode(zoneCode, zoningType = '') {
  const code = String(zoneCode || '').toUpperCase();
  const type = String(zoningType || '').toLowerCase();

  if (/^NL-?[1-5]/.test(code)) {
    return { primaryStreet: 25, secondaryStreet: 15, side: 10, rear: 25 };
  }
  if (/^NM-?[12]/.test(code)) {
    return { primaryStreet: 20, secondaryStreet: 10, side: 10, rear: 10 };
  }
  if (/^NH/.test(code)) {
    return { primaryStreet: 10, secondaryStreet: 10, side: 5, rear: 10 };
  }
  if (/^(DC|CR|OR|BP|TS|P\/?SP|S-)/.test(code) || /commercial|office|business/.test(type)) {
    return { primaryStreet: 0, secondaryStreet: 0, side: 5, rear: 5 };
  }
  if (/^R-?1|^R-?2|^RR|^WR|^AR/.test(code) || /residential|rural/.test(type)) {
    return { primaryStreet: 25, secondaryStreet: 15, side: 10, rear: 25 };
  }
  // Universal fallback so any click still draws an envelope.
  return { primaryStreet: 15, secondaryStreet: 10, side: 10, rear: 10 };
}

function buildRulesShell({
  zoneCode,
  zoneName,
  jurisdictionName,
  ldrUrl,
  ldrSection,
  confidence,
  source,
  setbacks,
  extras = {},
  parcelProps = {},
}) {
  const side = setbacks.side ?? 10;
  const review = getZoningOrdinanceReviewLinks(
    { ...parcelProps, zoning: zoneCode },
    { zoneCode, zoneName, ldrSection, ldrUrl }
  );
  return {
    jurisdictionId: 'regrid-derived',
    jurisdictionName: jurisdictionName || 'From Regrid parcel',
    zoneCode,
    zoneName: zoneName || zoneCode,
    ldrSection: ldrSection || review.section || null,
    ldrUrl: review.primary?.url || ldrUrl || null,
    ldrLabel: review.primary?.label || null,
    reviewLinks: review.links,
    confidence,
    source,
    geo: {
      primaryBuildingSetbacksFt: {
        primaryStreet: setbacks.primaryStreet,
        secondaryStreet: setbacks.secondaryStreet ?? setbacks.primaryStreet,
        side,
        rear: setbacks.rear ?? side,
      },
      farMax: extras.farMax || null,
      maxBuildingHeightFt: extras.maxBuildingHeightFt ?? null,
      minLotAreaSf: extras.minLotAreaSf ?? null,
      maxCoveragePct: extras.maxCoveragePct ?? null,
    },
    classification: {
      intent:
        confidence === 'structured'
          ? null
          : source === 'regrid'
            ? 'Setbacks from Regrid / Zoneomics standardized zoning fields on this parcel.'
            : 'Approximate setbacks — Regrid did not provide numeric yards for this zone. Verify against the LDR.',
      uses: [],
    },
  };
}

function rulesFromRegridFields(parcelProps, zoneCode) {
  const z = collectZoningScalars(parcelProps);
  const front = firstFeet(z.min_front_setback_ft, z.front_setback_ft, z.min_front);
  const rear = firstFeet(z.min_rear_setback_ft, z.rear_setback_ft, z.min_rear);
  const side = firstFeet(z.min_side_setback_ft, z.side_setback_ft, z.min_side);

  if (front == null && rear == null && side == null) return null;

  const setbacks = {
    primaryStreet: front ?? side ?? 10,
    secondaryStreet: front != null ? Math.min(front, side ?? front) : side ?? 10,
    side: side ?? front ?? 10,
    rear: rear ?? side ?? front ?? 10,
  };

  const far = parseRegridZoningFeet(z.max_far);
  const height = parseRegridZoningFeet(z.max_building_height_ft);
  const lot = parseRegridZoningFeet(z.min_lot_area_sq_ft);
  const coverage = parseRegridZoningFeet(z.max_coverage_pct);

  return buildRulesShell({
    zoneCode,
    zoneName: z.zoning_description || z.zoning_desc || zoneCode,
    jurisdictionName: z.municipality_name || z.scity || z.city || 'From Regrid parcel',
    ldrUrl: z.zoning_code_link || z.zoning_link || z.zoning_url || null,
    confidence: 'regrid',
    source: 'regrid',
    setbacks,
    parcelProps: z,
    extras: {
      farMax:
        far != null
          ? { detachedDwelling: far, otherAllowedUses: far }
          : null,
      maxBuildingHeightFt: height,
      minLotAreaSf: lot,
      maxCoveragePct: coverage,
    },
  });
}

function rulesFromEstimate(parcelProps, zoneCode) {
  const z = collectZoningScalars(parcelProps);
  const setbacks = estimateSetbacksForZoneCode(zoneCode, z.zoning_type || z.zoning_subtype);
  return buildRulesShell({
    zoneCode,
    zoneName: z.zoning_description || z.zoning_desc || zoneCode,
    jurisdictionName: z.municipality_name || z.scity || z.city || 'Estimated',
    ldrUrl: z.zoning_code_link || z.zoning_link || null,
    confidence: 'estimated',
    source: 'estimated',
    setbacks,
    parcelProps: z,
  });
}

/**
 * Resolve setback/FAR rules for any parcel zone code.
 * Priority: curated LDR pack → Regrid numeric yards → estimated defaults.
 *
 * @returns {{ ok: true, zoneCode: string, rules: object } | { ok: false, zoneCode: string, error: string }}
 */
export function resolveZoneRulesFromParcel(parcelProps = {}) {
  const raw =
    parcelProps.zoning ||
    parcelProps.zoning_code ||
    parcelProps.zoning_description ||
    '';
  const tries = candidatesFromRaw(raw);
  const zoneCode = displayZoneCode(raw, tries);

  if (!zoneCode || zoneCode === 'UNKNOWN') {
    const fromRegrid = rulesFromRegridFields(parcelProps, 'UNKNOWN');
    if (fromRegrid) {
      return { ok: true, zoneCode: 'UNKNOWN', rules: fromRegrid };
    }
    return {
      ok: false,
      zoneCode: '',
      error: 'No zoning code on this parcel from Regrid.',
    };
  }

  for (const key of tries) {
    if (ZONE_RULES_BY_CODE[key]) {
      const base = ZONE_RULES_BY_CODE[key];
      const review = getZoningOrdinanceReviewLinks(parcelProps, base);
      return {
        ok: true,
        zoneCode: base.zoneCode,
        rules: {
          ...base,
          source: 'ldr',
          confidence: base.confidence || 'structured',
          ldrUrl: review.primary?.url || base.ldrUrl,
          ldrLabel: review.primary?.label || `Review §${base.ldrSection} ${base.zoneCode}`,
          reviewLinks: review.links,
        },
      };
    }
  }

  const fromRegrid = rulesFromRegridFields(parcelProps, zoneCode);
  if (fromRegrid) {
    return { ok: true, zoneCode, rules: fromRegrid };
  }

  const estimated = rulesFromEstimate(parcelProps, zoneCode);
  return { ok: true, zoneCode, rules: estimated };
}
