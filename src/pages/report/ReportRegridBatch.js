import React, { useCallback, useState, useEffect, useMemo } from 'react';
import * as turf from '@turf/turf';
import './Report.css';
import { useMapContext } from '../MapContext';
import ReportTable from './ReportTable';
import { getCountyCodeFromFeature, getCountyParcelIdFromFeature } from '../../utils/parseGFI';
import {
  REGRID_BATCH_POINT_LIMIT,
  buildBatchPointsGeoJson,
  createRegridBatchPointsJob,
  downloadRegridBatchNdjson,
  getRegridBatchJobStatus,
  isBatchJobActive,
  parseNdjsonFeatures,
} from '../../utils/regridBatchApi';
import {
  batchFeaturesToCsv,
  mapBatchFeaturesToReportData,
} from '../../utils/regridBatchReport';
import { buildReportSelectionPreviewItems } from '../../utils/reportSelectionPreview';

/** Regrid batch report UI — enable via REACT_APP_ENABLE_REGRID_BATCH_REPORTS=true */
const ReportRegridBatch = () => {
  const {
    selectedColumns,
    toggleColumn,
    selectedFeature,
    isFilterTriggered,
    setIsFilterTriggered,
  } = useMapContext();

  const [rows, setRows] = useState([]);
  const [filteredRows, setFilteredRows] = useState([]);
  const [page, setPage] = useState(0);
  const rowsPerPage = 50;
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [filters, setFilters] = useState({});
  const [availableGroups, setAvailableGroups] = useState([]);
  const [batchJob, setBatchJob] = useState(null);
  const [hydratedBatchJobUuid, setHydratedBatchJobUuid] = useState('');
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [dropdownState, setDropdownState] = useState({});

  const displayColumnName = (column) =>
    column.replace(/^(General|Property|Tax|Parcel):\s*/i, '');

  const getFeatureCustomId = (feature, index) => {
    const county = getCountyCodeFromFeature(feature);
    const countyParcelId = getCountyParcelIdFromFeature(feature);
    const fallback = `feature_${index}`;
    if (county && countyParcelId) return `${county}|${countyParcelId}`;
    return feature?.properties?.GFI || countyParcelId || fallback;
  };

  const getPointFromFeature = (feature) => {
    if (!feature) return null;
    const props = feature.properties || {};
    const fields = props.fields && typeof props.fields === 'object' ? props.fields : {};

    const lat = Number(props.lat ?? fields.lat ?? props.latitude);
    const lon = Number(props.lon ?? fields.lon ?? props.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon };
    }

    if (!feature.geometry) return null;
    const { geometry } = feature;

    try {
      if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
        const [pointLon, pointLat] = geometry.coordinates;
        if (Number.isFinite(pointLat) && Number.isFinite(pointLon)) {
          return { lat: pointLat, lon: pointLon };
        }
      }

      const center = turf.centerOfMass(feature);
      const [centerLon, centerLat] = center?.geometry?.coordinates || [];
      if (Number.isFinite(centerLat) && Number.isFinite(centerLon)) {
        return { lat: centerLat, lon: centerLon };
      }
    } catch (err) {
      console.warn('Failed to derive point from feature:', err);
    }

    return null;
  };

  const applySuggestedColumns = useCallback(
    (suggestedColumns) => {
      if (!suggestedColumns?.length || selectedColumns.length > 0) return;
      suggestedColumns.forEach((col) => {
        if (!selectedColumns.includes(col)) {
          toggleColumn(col);
        }
      });
    },
    [selectedColumns, toggleColumn]
  );

  const hydrateReportFromBatch = useCallback(
    async (jobUuid) => {
      const ndjsonText = await downloadRegridBatchNdjson(jobUuid);
      const features = parseNdjsonFeatures(ndjsonText);
      const { rows: mappedRows, groups, suggestedColumns } = mapBatchFeaturesToReportData(features);

      setRows(mappedRows);
      setFilteredRows([]);
      setPage(0);
      setAvailableGroups(groups);
      setHydratedBatchJobUuid(jobUuid);

      const initialState = {};
      groups.forEach((group) => {
        initialState[group.id] = false;
      });
      setDropdownState(initialState);
      applySuggestedColumns(suggestedColumns);

      return features;
    },
    [applySuggestedColumns]
  );

  const pollBatchStatus = useCallback(async (jobUuid) => {
    const job = await getRegridBatchJobStatus(jobUuid);
    setBatchJob(job);
    return job;
  }, []);

  const submitRegridBatchJob = useCallback(async () => {
    if (!selectedFeature?.length) {
      setBatchError('Select properties on the map before generating a report.');
      return;
    }

    setBatchError('');
    setIsBatchSubmitting(true);
    setRows([]);
    setFilteredRows([]);
    setAvailableGroups([]);
    setHydratedBatchJobUuid('');

    try {
      const geojson = buildBatchPointsGeoJson(selectedFeature, {
        getPoint: getPointFromFeature,
        getCustomId: getFeatureCustomId,
      });
      const totalPoints = geojson.features.length;

      if (!totalPoints) {
        throw new Error('No valid feature coordinates were found for batch processing.');
      }
      if (totalPoints > REGRID_BATCH_POINT_LIMIT) {
        throw new Error(
          `Selected ${totalPoints} points. Regrid batch max is ${REGRID_BATCH_POINT_LIMIT}.`
        );
      }

      const job = await createRegridBatchPointsJob(geojson, { preset: 'report' });

      setBatchJob(job);
      await pollBatchStatus(job.job_uuid);
    } catch (err) {
      console.error('Error creating Regrid batch job:', err);
      setBatchError(err?.message || 'Failed to start Regrid batch job.');
    } finally {
      setIsBatchSubmitting(false);
    }
  }, [pollBatchStatus, selectedFeature]);

  useEffect(() => {
    if (!batchJob?.job_uuid || !isBatchJobActive(batchJob.status)) return undefined;

    const interval = setInterval(() => {
      pollBatchStatus(batchJob.job_uuid).catch((err) => {
        console.error('Batch status polling error:', err);
        setBatchError(err?.message || 'Failed to refresh batch status.');
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [batchJob?.job_uuid, batchJob?.status, pollBatchStatus]);

  useEffect(() => {
    if (!batchJob?.job_uuid || batchJob.status !== 'ready') return;
    if (hydratedBatchJobUuid === batchJob.job_uuid) return;

    hydrateReportFromBatch(batchJob.job_uuid).catch((err) => {
      console.error('Error hydrating report from batch:', err);
      setBatchError(err?.message || 'Failed to load batch results.');
    });
  }, [batchJob, hydratedBatchJobUuid, hydrateReportFromBatch]);

  useEffect(() => {
    if (batchJob?.status === 'failed') {
      setBatchError(
        'Regrid batch job failed. Try again with fewer parcels or confirm batch API access on your Regrid plan.'
      );
    }
  }, [batchJob?.status]);

  useEffect(() => {
    if (!isFilterTriggered || !selectedFeature?.length) return;

    (async () => {
      await submitRegridBatchJob();
      setIsFilterTriggered(false);
    })();
  }, [isFilterTriggered, selectedFeature, submitRegridBatchJob, setIsFilterTriggered]);

  const downloadBatchResults = async () => {
    if (!batchJob?.job_uuid || batchJob.status !== 'ready') return;

    setIsBatchDownloading(true);
    setBatchError('');
    try {
      const features = await hydrateReportFromBatch(batchJob.job_uuid);
      const csv = batchFeaturesToCsv(features);
      if (!csv) {
        throw new Error('Batch download returned no records.');
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `regrid_batch_${batchJob.job_uuid}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      setBatchJob((prev) => (prev ? { ...prev, status: 'downloaded' } : prev));
    } catch (err) {
      console.error('Error downloading batch results:', err);
      setBatchError(err?.message || 'Failed to download batch results.');
    } finally {
      setIsBatchDownloading(false);
    }
  };

  const toggleDropdown = useCallback((group) => {
    setDropdownState((prev) => ({ ...prev, [group]: !prev[group] }));
  }, []);

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });

    const source = filteredRows.length > 0 ? filteredRows : rows;
    const sortedRows = [...source].sort((a, b) => {
      if (a[key] < b[key]) return direction === 'ascending' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'ascending' ? 1 : -1;
      return 0;
    });

    setFilteredRows(sortedRows);
  };

  const handleFilter = (key, value) => {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);

    const filtered = rows.filter((row) =>
      Object.entries(nextFilters).every(([filterKey, filterValue]) => {
        if (!filterValue) return true;
        return row[filterKey]?.toString().toLowerCase().includes(filterValue.toLowerCase());
      })
    );

    setFilteredRows(filtered);
    setPage(0);
  };

  const handleDownload = () => {
    const csvContent = generateCSV();
    if (!csvContent) return;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'property_report.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const generateCSV = () => {
    if (!selectedColumns.length) {
      alert('Select at least one column to download.');
      return '';
    }

    const dataToDownload = filteredRows.length ? filteredRows : rows;
    const escapeValue = (value) => {
      if (value === null || value === undefined) return '';
      return `"${String(value).replace(/"/g, '""')}"`;
    };

    const csvHeader = selectedColumns.map(escapeValue).join(',');
    const csvRows = dataToDownload.map((row) =>
      selectedColumns.map((col) => escapeValue(row[col] || '')).join(',')
    );

    return [csvHeader, ...csvRows].join('\n');
  };

  const totalRows = filteredRows.length > 0 ? filteredRows.length : rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const currentRows = (filteredRows.length > 0 ? filteredRows : rows).slice(
    page * rowsPerPage,
    (page + 1) * rowsPerPage
  );

  const batchBusy =
    isBatchSubmitting || (batchJob && isBatchJobActive(batchJob.status));
  const selectionCount = selectedFeature?.length ?? 0;
  const selectionPreviewItems = useMemo(
    () => buildReportSelectionPreviewItems(selectedFeature),
    [selectedFeature]
  );
  const showSelectionPreview = selectionPreviewItems.length > 0 && !rows.length && !batchBusy;
  const resultCountLabel =
    totalRows > 0
      ? `${totalRows} parcel${totalRows === 1 ? '' : 's'} loaded`
      : selectionCount > 0
        ? `${selectionCount} selected on map — run Regrid batch to load attributes`
        : 'Select parcels on the map, then open Report';

  return (
    <div className="reports-container">
      <header className="reports-toolbar">
        <h1>Property Reports</h1>
        <span className="reports-toolbar-meta">{resultCountLabel}</span>
      </header>

      <div className="reports-body">
        <aside className="report-side-panel">
          {!selectionCount && !rows.length && (
            <p className="report-onboarding">
              On the map, select two or more parcels, then click{' '}
              <strong>See features in Report Builder</strong> at the top of the map.
            </p>
          )}

          <div className="report-actions">
            <button
              type="button"
              className="action-button"
              onClick={submitRegridBatchJob}
              disabled={batchBusy || !selectedFeature?.length}
            >
              {isBatchSubmitting
                ? 'Submitting batch…'
                : batchBusy
                  ? 'Processing batch…'
                  : 'Run Regrid batch'}
            </button>
            <button
              type="button"
              className="action-button action-button--secondary"
              onClick={handleDownload}
              disabled={!selectedColumns.length || !rows.length}
            >
              Download CSV
            </button>
          </div>

          {batchBusy && (
            <div className="report-loading-banner" role="status">
              Regrid is processing your selection. Results load automatically when ready.
            </div>
          )}

          {batchJob && (
            <div
              className={`batch-status-card${
                batchJob.status === 'ready' ? ' batch-status-card--ready' : ''
              }`}
            >
              <div className="batch-status-row">
                <span className="batch-status-label">Status</span>
                <span className="batch-status-value">{batchJob.status}</span>
              </div>
              {batchJob.percent_complete > 0 && batchJob.status !== 'ready' && (
                <>
                  <div className="batch-progress-track" aria-hidden>
                    <div
                      className="batch-progress-fill"
                      style={{ width: `${Math.min(100, batchJob.percent_complete)}%` }}
                    />
                  </div>
                  <div className="batch-status-row">
                    <span className="batch-status-label">Progress</span>
                    <span className="batch-status-value">{batchJob.percent_complete}%</span>
                  </div>
                </>
              )}
              {batchJob.processed_count > 0 && (
                <div className="batch-status-row">
                  <span className="batch-status-label">Processed</span>
                  <span className="batch-status-value">{batchJob.processed_count}</span>
                </div>
              )}
              {batchJob.failed_count > 0 && (
                <div className="batch-status-row">
                  <span className="batch-status-label">Failures</span>
                  <span className="batch-status-value">{batchJob.failed_count}</span>
                </div>
              )}
              <div className="batch-status-row">
                <span className="batch-status-label">Job</span>
                <span className="batch-status-value batch-status-value--mono">
                  {batchJob.job_uuid?.slice(0, 8)}…
                </span>
              </div>
              <button
                type="button"
                className="action-button action-button--secondary"
                disabled={batchJob.status !== 'ready' || isBatchDownloading}
                onClick={downloadBatchResults}
              >
                {isBatchDownloading ? 'Downloading…' : 'Download raw batch CSV'}
              </button>
            </div>
          )}

          {batchError && <div className="batch-error">{batchError}</div>}

          <div className="selected-columns-section">
            <h3>Selected columns</h3>
            {selectedColumns.length > 0 ? (
              <div className="selected-columns-list">
                {selectedColumns.map((column, index) => (
                  <div key={index} className="selected-column-item">
                    <span>{displayColumnName(column)}</span>
                    <button
                      type="button"
                      className="remove-column-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleColumn(column);
                      }}
                      title="Remove column"
                      aria-label={`Remove ${displayColumnName(column)}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-columns-message">Choose columns below after data loads</p>
            )}
          </div>

          {availableGroups.length > 0 && (
            <div className="attribute-dropdown-reports">
              <h3>Available columns</h3>
              {availableGroups.map((group) => (
                <div key={group.id} className="dropdown-group-reports">
                  <button
                    type="button"
                    className="dropdown-header-reports"
                    onClick={() => toggleDropdown(group.id)}
                  >
                    {group.label} {dropdownState[group.id] ? '▲' : '▼'}
                  </button>
                  {dropdownState[group.id] && (
                    <div className="dropdown-menu-reports">
                      {group.fields.map((f, index) => (
                        <div
                          key={`${group.id}-${index}`}
                          className="dropdown-item-reports"
                          onClick={() => toggleColumn(f.key)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') toggleColumn(f.key);
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <input
                            type="checkbox"
                            checked={selectedColumns.includes(f.key)}
                            readOnly
                            tabIndex={-1}
                          />
                          {displayColumnName(f.key)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>

        <main className="reports-main-panel">
          {showSelectionPreview && (
            <section className="report-selection-preview" aria-labelledby="report-selection-preview-title">
              <div className="report-selection-preview-header">
                <h2 id="report-selection-preview-title">
                  Parcels in this report ({selectionPreviewItems.length})
                </h2>
                <p>
                  Review your map selection below, then run Regrid batch to load full attributes and
                  download.
                </p>
              </div>
              <ul className="report-selection-preview-list">
                {selectionPreviewItems.map((item) => (
                  <li key={item.key} className="report-selection-preview-item">
                    <div className="report-selection-preview-owner">{item.owner}</div>
                    {item.address ? (
                      <div className="report-selection-preview-address">{item.address}</div>
                    ) : null}
                    <div className="report-selection-preview-meta">
                      <span>Parcel {item.parcelId}</span>
                      {item.location ? <span>{item.location}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ReportTable
            currentRows={currentRows}
            selectedColumns={selectedColumns}
            filters={filters}
            handleFilter={handleFilter}
            handleSort={handleSort}
            isLoading={batchBusy && !rows.length}
            hasSelectionPreview={showSelectionPreview}
          />

          <div className="pagination">
            <span>
              Showing {currentRows.length} of {totalRows} on page {page + 1} of {totalPages}
            </span>
            <div className="pagination-controls">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
                disabled={page === 0}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages - 1))}
                disabled={page >= totalPages - 1 || totalRows === 0}
              >
                Next
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ReportRegridBatch;
