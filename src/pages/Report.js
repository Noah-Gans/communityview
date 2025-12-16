import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Report.css';
import { useMapContext } from './MapContext';
import ReportTable from './ReportTable'; // path depends on your file structure
import { getCountyCodeFromFeature, getCountyParcelIdFromFeature } from '../utils/parseGFI';

const Reports = () => {
  const { setGlobalActiveTab, startPolygonDraw, polygonData, toggleLayerVisibility, clearGeoFilter, selectedColumns, toggleColumn, selectedFeature, isFilterTriggered, setIsFilterTriggered } = useMapContext();
  // NOTE: reportData from DataContext is deprecated in favor of the local API
  const [rows, setRows] = useState([]); // Rows built from API response
  const [filteredRows, setFilteredRows] = useState([]); // State for filtered rows
  const [page, setPage] = useState(0);
  const [visibleColumns, setVisibleColumns] = useState([]); // Track visible columns
  const rowsPerPage = 50; // Number of rows per page
  const navigate = useNavigate();
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null }); // Sorting state
  const [filters, setFilters] = useState({}); // Filtering state
  const [availableGroups, setAvailableGroups] = useState([]); // Dynamically built attribute groups from API

  const [dropdownState, setDropdownState] = useState({});
  
  // ===== Helpers: API fetch + mapping =====
  const fetchReportForParcels = async (parcels) => {
    try {
      const response = await fetch('https://34.10.19.103.nip.io/report/batch-retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parcels }),
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const json = await response.json();
      return json;
    } catch (err) {
      console.error('Error fetching report from local API:', err);
      return null;
    }
  };

  const titleCase = (s) => {
    return String(s)
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };


  const formatCountyState = (county) => {
    if (!county || typeof county !== 'string') return '';
    
    // Format: "teton_county_wy" -> "Teton County, WY"
    // Format: "lincoln_county_wy" -> "Lincoln County, WY"
    const parts = county.split('_');
    if (parts.length < 3) return county;
    
    // Get county name (everything except last 2 parts which are "county" and state)
    const countyName = parts.slice(0, -2).join(' ');
    const state = parts[parts.length - 1].toUpperCase();
    
    return `${titleCase(countyName)} County, ${state}`;
  };

  const parseMailingAddress = (mailingAddress) => {
    if (!mailingAddress || typeof mailingAddress !== 'string') {
      return { complete: mailingAddress || '', city: '', state: '', zip: '' };
    }

    // Format: "PO BOX 1230, WILSON, WY, 830141230" or similar comma-separated
    const parts = mailingAddress.split(',').map(p => p.trim());
    
    let complete = mailingAddress;
    let city = '';
    let state = '';
    let zip = '';

    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      
      // Check if last part is a zip (all digits)
      if (/^\d+$/.test(lastPart)) {
        zip = lastPart;
        if (parts.length >= 3) {
          // Second to last is state
          state = parts[parts.length - 2];
          // Everything before state is address + city, last part before state is city
          if (parts.length >= 4) {
            // Address, City, State, Zip format
            city = parts[parts.length - 3];
          } else {
            // City, State, Zip format
            city = parts[0];
          }
        }
      } else if (parts.length >= 3) {
        // Might be: "ADDRESS, CITY, STATE ZIP" or "ADDRESS, CITY, STATE"
        const secondLast = parts[parts.length - 2];
        const last = parts[parts.length - 1];
        
        // Check if last part has state and zip together: "WY 83014"
        const stateZipMatch = last.match(/^([A-Z]{2})\s+(.+)$/);
        if (stateZipMatch) {
          state = stateZipMatch[1];
          zip = stateZipMatch[2];
          city = secondLast;
        } else if (last.match(/^[A-Z]{2}$/)) {
          // Just state: "WY"
          state = last;
          city = secondLast;
        }
      }
    }

    return { complete, city, state, zip };
  };

  const collectAvailableGroups = (apiJson) => {
    if (!apiJson || !Array.isArray(apiJson.parcels) || apiJson.parcels.length === 0) return [];

    const scalarKeys = (obj, excludeKeys = []) => Object.keys(obj || {}).filter((k) => {
      if (excludeKeys.includes(k)) return false;
      const v = obj[k];
      const isScalar = v === null || ['string', 'number', 'boolean'].includes(typeof v);
      return isScalar;
    });

    // Track fields we've seen to avoid duplicates
    const seenFields = new Set();
    
    // Common duplicate fields to prioritize in general_info
    const duplicateFields = ['tax_id', 'owner_name', 'account_number', 'county_parcel_id', 'physical_address', 'mailing_address'];

    // Collect all unique fields from ALL parcels (not just the first one)
    const allGeneralFields = new Set();
    const allPropertyFields = new Set();
    const allTaxFields = new Set();
    let hasTaxHistory = false;

    // Iterate through all parcels to collect all available fields
    apiJson.parcels.forEach((parcel) => {
      const generalInfo = parcel?.general_info || {};
      const prop = parcel?.property_data?.data || {};
      const tax = parcel?.tax_data?.data || {};

      // Collect general info fields
      scalarKeys(generalInfo).forEach((k) => {
        allGeneralFields.add(k);
      });

      // Collect property fields
      scalarKeys(prop, ['developments', 'acreage_breakdown']).forEach((k) => {
        const fieldKey = k.toLowerCase();
        if (!duplicateFields.includes(fieldKey)) {
          allPropertyFields.add(k);
        }
      });

      // Collect tax fields
      scalarKeys(tax, ['historical_data']).forEach((k) => {
        const fieldKey = k.toLowerCase();
        if (!duplicateFields.includes(fieldKey)) {
          allTaxFields.add(k);
        }
      });

      // Check if any parcel has tax history
      if (tax?.historical_data && Array.isArray(tax.historical_data)) {
        hasTaxHistory = true;
      }
    });

    // General Info fields - highest priority
    const generalFields = [];
    Array.from(allGeneralFields).forEach((k) => {
      if (k === 'mailing_address') {
        // Replace mailing_address with parsed versions
        generalFields.push({ key: 'General: Mailing Address', source: 'general', rawKey: 'mailing_address_complete' });
        generalFields.push({ key: 'General: Mailing City', source: 'general', rawKey: 'mailing_address_city' });
        generalFields.push({ key: 'General: Mailing State', source: 'general', rawKey: 'mailing_address_state' });
        generalFields.push({ key: 'General: Mailing Zip', source: 'general', rawKey: 'mailing_address_zip' });
        seenFields.add('mailing_address');
      } else {
        const fieldKey = k.toLowerCase();
        generalFields.push({ 
          key: `General: ${titleCase(k)}`, 
          source: 'general', 
          rawKey: k 
        });
        seenFields.add(fieldKey);
      }
    });

    // Always include county_state (will be generated from county if not present)
    if (!seenFields.has('county_state')) {
      generalFields.push({ 
        key: 'General: County State', 
        source: 'general', 
        rawKey: 'county_state' 
      });
      seenFields.add('county_state');
    }

    // Property fields - exclude duplicates and developments array
    const propertyFields = [];
    Array.from(allPropertyFields).forEach((k) => {
      const fieldKey = k.toLowerCase();
      if (!seenFields.has(fieldKey) && !duplicateFields.includes(fieldKey)) {
        propertyFields.push({ 
          key: `Property: ${titleCase(k)}`, 
          source: 'property', 
          rawKey: k 
        });
        seenFields.add(fieldKey);
      }
    });

    // Tax fields - exclude duplicates and historical_data array
    const taxFields = [];
    Array.from(allTaxFields).forEach((k) => {
      const fieldKey = k.toLowerCase();
      if (!seenFields.has(fieldKey) && !duplicateFields.includes(fieldKey)) {
        taxFields.push({ 
          key: `Tax: ${titleCase(k)}`, 
          source: 'tax', 
          rawKey: k 
        });
        seenFields.add(fieldKey);
      }
    });

    // Add tax history years count if any parcel has it
    if (hasTaxHistory) {
      taxFields.push({ 
        key: 'Tax: Tax History Years', 
        source: 'tax', 
        rawKey: 'tax_history_years' 
      });
    }

    // Build groups dynamically
    const groups = [];
    
    // Always include PIDN identifier
    groups.push({ 
      id: 'identifier', 
      label: 'Identifier', 
      fields: [{ key: 'PIDN' }] 
    });

    if (generalFields.length > 0) {
      groups.push({ id: 'general_info', label: 'General Info', fields: generalFields });
    }
    
    if (propertyFields.length > 0) {
      groups.push({ id: 'property_data', label: 'Property Data', fields: propertyFields });
    }
    if (taxFields.length > 0) {
      groups.push({ id: 'tax_data', label: 'Tax Data', fields: taxFields });
    }

    return groups;
  };

  const mapApiToRows = (apiJson) => {
    if (!apiJson || !Array.isArray(apiJson.parcels)) return [];
    return apiJson.parcels.map((p) => {
      const generalInfo = p?.general_info || {};
      const tax = p?.tax_data?.data || {};
      const prop = p?.property_data?.data || {};

      // Fields that are duplicates - only show from general_info
      const duplicateFields = ['tax_id', 'owner_name', 'account_number', 'county_parcel_id', 'physical_address', 'mailing_address'];

      // Start with PIDN as the identifier (from API response)
      const row = {
        PIDN: p?.county_parcel_id || '',
      };

      // Track which fields we've added to avoid duplicates
      const addedFields = new Set();

      // Add General Info fields (top level) - highest priority
      Object.keys(generalInfo).forEach((k) => {
        const v = generalInfo[k];
        // Skip nested objects like county_links
        if (k === 'county_links') return;
        
        if (k === 'mailing_address') {
          // Parse mailing address into components
          const parsed = parseMailingAddress(v);
          row['General: Mailing Address'] = parsed.complete;
          row['General: Mailing City'] = parsed.city;
          row['General: Mailing State'] = parsed.state;
          row['General: Mailing Zip'] = parsed.zip;
          addedFields.add('mailing_address');
        } else if (k === 'county_state') {
          // Generate county_state from top-level county if it's null/empty
          const countyStateValue = (v && typeof v === 'string' && v.trim()) ? v : formatCountyState(p?.county);
          row[`General: ${titleCase(k)}`] = countyStateValue;
          addedFields.add(k.toLowerCase());
        } else if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
          row[`General: ${titleCase(k)}`] = v;
          addedFields.add(k.toLowerCase());
        }
      });

      // If county_state wasn't in generalInfo, add it from the county field
      if (!addedFields.has('county_state') && p?.county) {
        row['General: County State'] = formatCountyState(p.county);
        addedFields.add('county_state');
      }

      // Add Property Data fields - exclude duplicates, developments array, and acreage_breakdown
      Object.keys(prop).forEach((k) => {
        const fieldKey = k.toLowerCase();
        if (k === 'developments' || k === 'acreage_breakdown') return;
        if (addedFields.has(fieldKey) || duplicateFields.includes(fieldKey)) return;
        
        const v = prop[k];
        if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
          row[`Property: ${titleCase(k)}`] = v;
          addedFields.add(fieldKey);
        }
      });

      // Add Tax Data fields - exclude duplicates and historical_data array
      Object.keys(tax).forEach((k) => {
        const fieldKey = k.toLowerCase();
        if (k === 'historical_data') return;
        if (addedFields.has(fieldKey) || duplicateFields.includes(fieldKey)) return;
        
        const v = tax[k];
        if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
          row[`Tax: ${titleCase(k)}`] = v;
          addedFields.add(fieldKey);
        }
      });

      // Add tax history years count
      if (tax?.historical_data && Array.isArray(tax.historical_data)) {
        row['Tax: Tax History Years'] = tax.historical_data.length;
      }

      return row;
    });
  };
  
  // Pagination logic
  const totalPages = Math.ceil(
    (filteredRows.length > 0 ? filteredRows.length : rows.length) / rowsPerPage
  );  
  const currentRows = (filteredRows.length > 0 ? filteredRows : rows).slice(
    page * rowsPerPage,
    (page + 1) * rowsPerPage
  );  
  // Define grouped columns
  const toggleDropdown = useCallback((group) => {
    setDropdownState((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  }, []);

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  
    const sortedRows = [...filteredRows].sort((a, b) => {
      if (a[key] < b[key]) return direction === 'ascending' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'ascending' ? 1 : -1;
      return 0;
    });
  
    setFilteredRows(sortedRows);
  };

  const parsePidnFromDescription = (description) => {
    if (!description) {
      return null;
    }
  
    const parser = new DOMParser();
    const doc = parser.parseFromString(description, 'text/html');
    const rows = doc.querySelectorAll('tr');
  
    for (const row of rows) {
      const th = row.querySelector('th')?.textContent?.trim().toLowerCase();
      const td = row.querySelector('td')?.textContent?.trim();
      if (th === 'pidn') {
        return td;
      }
    }
  
    return null; // Return null if pidn not found
  };

  const handleFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  
    const filtered = rows.filter((row) => {
      return Object.entries(filters).every(([filterKey, filterValue]) => {
        return row[filterKey]?.toString().toLowerCase().includes(filterValue.toLowerCase());
      });
    });
  
    setFilteredRows(filtered);
  };

  useEffect(() => {
    console.log("Selected Columns from MapContext:", selectedColumns);
  }, [selectedColumns]);
  useEffect(() => {
    if (polygonData) {
      console.log('Using Polygon in Reports:', polygonData);
    }
  }, [polygonData]);



const handleDownload = () => {
  console.log("Filtered Rows:", filteredRows);
  console.log("Selected Columns:", selectedColumns);
  const csvContent = generateCSV();
  if (!csvContent) return; // Stop if there's no data

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `filtered_report.csv`; // File name
  link.click();

  URL.revokeObjectURL(url); // Clean up URL object
};

useEffect(() => {
  if (isFilterTriggered && selectedFeature.length > 0) {
    console.log('Fetching report for selected features:', selectedFeature);

    // Map features to parcels
    const allParcels = selectedFeature.map((feature) => ({
      county: getCountyCodeFromFeature(feature),
      county_parcel_id: getCountyParcelIdFromFeature(feature),
    }));

    // Remove duplicates based on county + county_parcel_id combination
    const seen = new Set();
    const parcels = allParcels.filter((parcel) => {
      const key = `${parcel.county}|${parcel.county_parcel_id}`;
      if (seen.has(key)) {
        return false; // Duplicate, filter it out
      }
      seen.add(key);
      return true; // Unique, keep it
    });

    console.log(`Removed ${allParcels.length - parcels.length} duplicate parcels. Sending ${parcels.length} unique parcels.`);

    (async () => {
      const apiJson = await fetchReportForParcels(parcels);
      const mapped = mapApiToRows(apiJson);
      const groups = collectAvailableGroups(apiJson);
      setRows(mapped);
      setAvailableGroups(groups);
      setFilteredRows([]); // clear any prior filters; show all fetched rows by default
      setPage(0);
      setIsFilterTriggered(false);
      
      // Initialize dropdown state for all groups (all closed by default)
      const initialState = {};
      groups.forEach((group) => {
        initialState[group.id] = false;
      });
      setDropdownState(initialState);
    })();
  }
}, [isFilterTriggered, selectedFeature]);

const generateCSV = () => {

  if (!selectedColumns.length) {
    alert('No data available to download.');
    return '';
  }


  const dataToDownload = filteredRows.length ? filteredRows : rows;

  // Helper function to safely wrap a value in double quotes and escape internal quotes
  const escapeValue = (value) => {
    if (value === null || value === undefined) return '';
    const stringValue = value.toString();
    return `"${stringValue.replace(/"/g, '""')}"`; // Escape double quotes
  };

  // Generate header row with selected columns
  const csvHeader = selectedColumns.map(escapeValue).join(',');

  // Generate rows for each filtered row
  // Generate CSV rows
  const csvRows = dataToDownload.map((row) =>
    selectedColumns.map((col) => escapeValue(row[col] || '')).join(',')
  );

  // Combine header and rows into a CSV string
  return [csvHeader, ...csvRows].join('\n');
};



  // Clear GeoFilter
  const handleClearGeoFilter = () => {
    clearGeoFilter(); // Clear GeoFilter in MapContext
    localStorage.removeItem('polygonData'); // Remove stored GeoFilter
    console.log('GeoFilter cleared');
  };

  const handleGeoFilter = () => {
    console.log('Geo Filter button clicked.');

    // Switch to the map tab
    console.log('Switching to map tab...');
    setGlobalActiveTab('map');
    navigate('/map'); // Navigate to the map route

    // Ensure the ownership layer is visible
    console.log('Ensuring ownership layer is visible...');
    toggleLayerVisibility('ownership');

    // Start polygon drawing tool
    console.log('Starting polygon drawing tool...');
    startPolygonDraw(true);
  };

  return (
    <div className="reports-background-blur">
      <div className="reports-container">
        {/* Title */}
        <div className="reports-title">
          <h1>Reports</h1>
        </div>
  
        {/* Content Area */}
        <div className="reports-content">
          {/* Side Panel */}
          <div className="report-side-panel">
            <button className="action-button" onClick={handleDownload}>
              Download
            </button>
            
            {/* Selected Columns Section - Above dropdowns */}
            <div className="selected-columns-section">
              <h3>Selected Columns</h3>
              {selectedColumns.length > 0 ? (
                <div className="selected-columns-list">
                  {selectedColumns.map((column, index) => {
                    // Remove prefix from display (keep for internal use)
                    const displayName = column.replace(/^(General|Property|Tax):\s*/i, '');
                    return (
                      <div key={index} className="selected-column-item">
                        <span>{displayName}</span>
                        <button
                          className="remove-column-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn(column);
                          }}
                          title="Remove column"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="no-columns-message">No columns selected</p>
              )}
            </div>

            {/* Column Selection Dropdowns */}
            <div className="attribute-dropdown-reports">
              <h3>Select Columns</h3>
              {availableGroups.map((group) => (
                <div key={group.id} className="dropdown-group-reports">
                  <button
                    className="dropdown-header-reports"
                    onClick={() => toggleDropdown(group.id)}
                  >
                    {group.label} {dropdownState[group.id] ? '▲' : '▼'}
                  </button>
                  {dropdownState[group.id] && (
                    <div className="dropdown-menu-reports">
                      {group.fields.map((f, index) => {
                        // Remove prefix (e.g., "General: ", "Property: ", "Tax: ") from display
                        const displayName = f.key.replace(/^(General|Property|Tax):\s*/i, '');
                        return (
                          <div
                            key={`${group.id}-${index}`}
                            className="dropdown-item-reports"
                            onClick={() => toggleColumn(f.key)}
                          >
                            <input
                              type="checkbox"
                              checked={selectedColumns.includes(f.key)}
                              readOnly
                            />
                            {displayName}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
  
          {/* Main Panel */}
          <div className="main-panel">
            <div className="table-container">
            <ReportTable
              currentRows={currentRows}
              selectedColumns={selectedColumns}
              filters={filters}
              handleFilter={handleFilter}
              handleSort={handleSort}
            />
            </div>
            {/* Pagination component */}
            <div className="pagination">
              <span>
                Showing {currentRows.length} of{' '}
                {filteredRows.length > 0 ? filteredRows.length : rows.length} results
              </span>
              <button
                onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
                disabled={page === 0}
              >
                Previous
              </button>
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages - 1))}
                disabled={page === totalPages - 1}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  
};

export default Reports;
