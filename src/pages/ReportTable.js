import React, { memo } from 'react';

function ReportTable({
  currentRows,
  selectedColumns,
  filters,
  handleFilter,
  handleSort,
}) {
  return (
    <div className="table-container">
      <table className="report-table">
        <thead>
          <tr>
            {selectedColumns.map((header, index) => (
              <th key={index}>
                <div className="header-cell">
                  {/* Sort on column name */}
                  <span onClick={() => handleSort(header)}>
                    {header}
                  </span>
                  {/* Filter input */}
                  <input
                    type="text"
                    placeholder="Filter..."
                    value={filters[header] || ''}
                    onChange={(e) => handleFilter(header, e.target.value)}
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
                <td key={cellIndex}>{row[header]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Wrap in memo so it re-renders only if props change
export default memo(ReportTable);
