import React, { memo } from 'react';

function displayColumnName(column) {
  return column.replace(/^(General|Property|Tax|Parcel):\s*/i, '');
}

function ReportTable({
  currentRows,
  selectedColumns,
  filters,
  handleFilter,
  handleSort,
  isLoading = false,
  hasSelectionPreview = false,
}) {
  if (isLoading) {
    return (
      <div className="table-container">
        <p className="report-table-empty">Loading parcel data from Regrid batch API…</p>
      </div>
    );
  }

  if (!selectedColumns.length && !hasSelectionPreview) {
    return (
      <div className="table-container">
        <p className="report-table-empty">
          Select columns in the side panel to build your report table.
        </p>
      </div>
    );
  }

  if (!selectedColumns.length && hasSelectionPreview) {
    return null;
  }

  if (!currentRows.length) {
    return (
      <div className="table-container">
        <p className="report-table-empty">
          No rows to display. Select parcels on the map and run a batch report.
        </p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="report-table">
        <thead>
          <tr>
            {selectedColumns.map((header, index) => (
              <th key={index}>
                <div className="header-cell">
                  <span onClick={() => handleSort(header)} role="button" tabIndex={0}>
                    {displayColumnName(header)}
                  </span>
                  <input
                    type="text"
                    placeholder="Filter…"
                    value={filters[header] || ''}
                    onChange={(e) => handleFilter(header, e.target.value)}
                    aria-label={`Filter ${displayColumnName(header)}`}
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {currentRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {selectedColumns.map((header, cellIndex) => (
                <td key={cellIndex}>{row[header] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default memo(ReportTable);
