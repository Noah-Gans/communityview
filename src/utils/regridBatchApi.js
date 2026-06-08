import { REGRID_API_BASE_URL, REGRID_API_TOKEN } from '../config/regridApi';
import { regridBatchRequest } from '../services/regridService';

/** US-scoped and global batch bases (Regrid docs use both). */
export const REGRID_BATCH_BASE_URLS = [
  `${REGRID_API_BASE_URL}/us/batch`,
  `${REGRID_API_BASE_URL}/batch`,
];

export const REGRID_BATCH_POINT_LIMIT = 100000;

/** Query flags for POST /batch/points (Regrid Batch API). */
export const REGRID_BATCH_PRESETS = {
  report: {
    return_geometry: false,
    return_stacked: true,
    return_custom: true,
    return_field_labels: false,
    radius: 0,
  },
  lean: {
    return_geometry: false,
    return_stacked: true,
    return_custom: false,
    return_field_labels: false,
    radius: 0,
  },
};

const ACTIVE_BATCH_STATUSES = new Set(['queued', 'running']);

async function readErrorBody(response) {
  try {
    const text = await response.text();
    if (!text) return '';
    return text.length > 300 ? `${text.slice(0, 300)}...` : text;
  } catch (_) {
    return '';
  }
}

function buildBatchQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  return search.toString() ? `?${search.toString()}` : '';
}

/**
 * Try each batch base URL until one succeeds (or all fail).
 * Uses Cloud Function when no client token is set.
 */
export async function fetchRegridBatch(buildPath, options = {}) {
  const path = buildPath.split('?')[0];
  const queryString = buildPath.includes('?') ? buildPath.split('?')[1] : '';
  const queryParams = Object.fromEntries(new URLSearchParams(queryString));

  if (REGRID_API_TOKEN) {
    let lastError = null;
    const qs = buildBatchQuery({ ...queryParams, token: REGRID_API_TOKEN });
    for (const baseUrl of REGRID_BATCH_BASE_URLS) {
      const response = await fetch(`${baseUrl}${path}${qs}`, options);
      if (response.ok) {
        return { response, baseUrl };
      }
      const details = await readErrorBody(response);
      if (response.status === 401 || response.status === 404) {
        lastError = new Error(`Batch request failed (${response.status}) ${details}`.trim());
        continue;
      }
      throw new Error(`Batch request failed (${response.status}) ${details}`.trim());
    }
    throw lastError || new Error('Batch request failed on all known Regrid batch endpoints.');
  }

  const method = options.method || 'GET';
  let body;
  if (options.body) {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = undefined;
    }
  }

  const result = await regridBatchRequest({
    method,
    path,
    queryParams,
    body,
  });

  if (!result?.ok) {
    throw new Error('Regrid batch request failed');
  }

  const response = {
    ok: true,
    async json() {
      if (result.json != null) return result.json;
      try {
        return JSON.parse(result.text || '{}');
      } catch {
        return {};
      }
    },
    async text() {
      if (result.text != null) return result.text;
      return JSON.stringify(result.json || {});
    },
  };

  return { response, baseUrl: REGRID_BATCH_BASE_URLS[0] };
}

export function extractBatchJob(json) {
  if (!json || typeof json !== 'object') return null;
  const job = json?.job || json?.data?.job || json;
  return {
    job_uuid: job?.job_uuid || job?.jobUuid || job?.uuid || null,
    job_type: job?.job_type || null,
    status: job?.status || 'queued',
    percent_complete: Number(job?.percent_complete ?? 0),
    processed_count: Number(job?.processed_count ?? 0),
    failed_count: Number(job?.failed_count ?? 0),
    updated_at: job?.updated_at || null,
    time_remaining: Number(job?.time_remaining ?? 0),
  };
}

/**
 * POST batch/points — GeoJSON FeatureCollection of points with optional custom_id.
 */
export async function createRegridBatchPointsJob(geojson, options = {}) {
  const preset =
    typeof options.preset === 'string' && REGRID_BATCH_PRESETS[options.preset]
      ? REGRID_BATCH_PRESETS[options.preset]
      : {};
  const {
    preset: _presetKey,
    return_geometry = preset.return_geometry ?? false,
    return_stacked = preset.return_stacked ?? true,
    return_custom = preset.return_custom ?? false,
    return_field_labels = preset.return_field_labels ?? false,
    radius = preset.radius ?? 0,
    callback_url,
  } = options;

  const query = buildBatchQuery({
    return_geometry,
    return_stacked,
    return_custom,
    return_field_labels,
    radius,
    callback_url,
  });

  const { response } = await fetchRegridBatch(`/points${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ geojson }),
  });

  const json = await response.json();
  const job = extractBatchJob(json);
  if (!job?.job_uuid) {
    throw new Error('Batch creation response missing job_uuid');
  }
  return job;
}

/** Status paths differ slightly in Regrid docs; try both. */
async function fetchBatchStatus(jobUuid) {
  const paths = [
    `/${encodeURIComponent(jobUuid)}/status`,
    `/status/${encodeURIComponent(jobUuid)}`,
  ];

  let lastError = null;
  for (const path of paths) {
    try {
      const { response } = await fetchRegridBatch(`${path}${buildBatchQuery()}`);
      const json = await response.json();
      const job = extractBatchJob(json);
      if (job?.job_uuid) return job;
      lastError = new Error('Batch status response missing job_uuid');
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to fetch batch job status');
}

export async function getRegridBatchJobStatus(jobUuid) {
  return fetchBatchStatus(jobUuid);
}

export async function listRegridBatchJobs(returnAll = false) {
  const query = buildBatchQuery({ return_all: returnAll ? 'true' : undefined });
  const { response } = await fetchRegridBatch(`/jobs${query}`);
  const json = await response.json();
  return Array.isArray(json?.jobs) ? json.jobs : [];
}

export async function downloadRegridBatchNdjson(jobUuid) {
  const { response } = await fetchRegridBatch(
    `/${encodeURIComponent(jobUuid)}/download${buildBatchQuery()}`
  );
  return response.text();
}

export async function deleteRegridBatchJob(jobUuid) {
  await fetchRegridBatch(`/${encodeURIComponent(jobUuid)}${buildBatchQuery()}`, {
    method: 'DELETE',
  });
}

export function parseNdjsonFeatures(ndjsonText) {
  if (!ndjsonText) return [];
  return ndjsonText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

export function isBatchJobActive(status) {
  return ACTIVE_BATCH_STATUSES.has(status);
}

export function buildBatchPointsGeoJson(features, { getPoint, getCustomId }) {
  const deduped = [];
  const seen = new Set();

  features.forEach((feature, index) => {
    const point = getPoint(feature);
    if (!point) return;

    const customId = getCustomId(feature, index);
    const dedupeKey = `${customId}|${point.lat}|${point.lon}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    deduped.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
      properties: { custom_id: customId },
    });
  });

  return { type: 'FeatureCollection', features: deduped };
}
