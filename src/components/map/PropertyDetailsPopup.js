import React, { useState, useEffect, useCallback } from 'react';
import './PropertyDetailsPopup.css';
import { getCountyCodeFromFeature, getCountyParcelIdFromFeature } from '../../utils/parseGFI';
import { fetchRegridParcelRecord } from '../../utils/regridParcelApi';

/**
 * @param {'scrape' | 'regrid'} [dataSource] — scrape: legacy county scrape SSE; regrid: GET /parcels/{ll_uuid} (same as SidePanel)
 */
const PropertyDetailsPopup = ({ feature, onClose, dataSource = 'scrape' }) => {
  const [propertyData, setPropertyData] = useState(null);
  const [regridParcelProps, setRegridParcelProps] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isFresh, setIsFresh] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('property');
  const [isPropertyDetailsCollapsed, setIsPropertyDetailsCollapsed] = useState(false);
  const [regridAllFieldsOpen, setRegridAllFieldsOpen] = useState(false);

  // Fetch property data using Server-Sent Events (SSE)
  const fetchPropertyData = () => {
    if (!feature?.properties) {
      console.log('❌ No feature properties found');
      return;
    }

    setLoading(true);
    setIsFresh(false);
    setError(null);

    const countyCode = getCountyCodeFromFeature(feature);
    const parcelId = getCountyParcelIdFromFeature(feature);
    
    let taxField = feature.properties.tax_details_key || '';
    if (countyCode === 'lincoln_county_wy' && taxField && !taxField.startsWith('00')) {
      taxField = '00' + taxField;
    }
    
    const requestBody = {
      county: countyCode,
      county_parcel_id: parcelId,
      fields: {
        tax_field: taxField,
        property_details_field: feature.properties.property_details_key || '',
        clerk_field: feature.properties.clerk_records_key || ''
      }
    };

    fetch('https://34.10.19.103.nip.io/property/scrape-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = ({ done, value }) => {
        if (done) {
          console.log('🏁 SSE stream ended');
          setLoading(false);
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            
            try {
              const jsonData = JSON.parse(jsonStr);
              
              if (jsonData.status === 'cached') {
                console.log('📦 FIRST YIELD (cached):', jsonData.status);
                console.log('📦 Cached data keys:', Object.keys(jsonData.data || {}));
                console.log('📦 General info:', jsonData.data?.general_info);
                console.log('📦 Tax info:', jsonData.data?.tax?.status);
                console.log('📦 Property details:', jsonData.data?.property_details?.status);
                
                setPropertyData(jsonData);
                setIsFresh(false);
                setLoading(true);
                
              } else if (jsonData.status === 'fresh') {
                console.log('✨ SECOND YIELD (fresh):', jsonData.status);
                console.log('✨ Fresh data keys:', Object.keys(jsonData.data || {}));
                console.log('✨ General info:', jsonData.data?.general_info);
                console.log('✨ Tax info:', jsonData.data?.tax?.status);
                console.log('✨ Property details:', jsonData.data?.property_details?.status);
                
                setPropertyData(jsonData);
                setIsFresh(true);
                setLoading(false);
                
              } else if (jsonData.status === 'complete') {
                console.log('✅ Stream complete');
                setLoading(false);
                return;
              }
            } catch (err) {
              console.error('❌ Error parsing SSE event:', err);
            }
          }
        }

        return reader.read().then(processStream);
      };

      return reader.read().then(processStream);
    })
    .catch(err => {
      console.error('❌ Error with SSE connection:', err);
      setError(err.message);
      setLoading(false);
    });
  };

  const fetchRegridParcelByUuid = useCallback(async () => {
    const llUuid =
      feature?.properties?.ll_uuid ||
      feature?.properties?.global_parcel_uid ||
      (typeof feature?.properties?.GFI === 'string' && feature.properties.GFI.includes('-')
        ? feature.properties.GFI
        : null);

    if (!llUuid) {
      setError('No Regrid parcel id (ll_uuid) on this result. Try opening the parcel from the map.');
      setRegridParcelProps(null);
      return;
    }

    setLoading(true);
    setError(null);
    setRegridParcelProps(null);
    setRegridAllFieldsOpen(false);

    try {
      const { merged } = await fetchRegridParcelRecord({
        ll_uuid: llUuid,
        path: feature?.properties?.path,
        preset: 'detail',
        seed: feature?.properties || {},
      });
      setRegridParcelProps(merged);
    } catch (e) {
      console.error('Regrid parcel fetch failed:', e);
      setError(e?.message || 'Failed to load parcel from Regrid');
    } finally {
      setLoading(false);
    }
  }, [feature]);

  useEffect(() => {
    if (dataSource === 'regrid') {
      setPropertyData(null);
      fetchRegridParcelByUuid();
      return;
    }
    setRegridParcelProps(null);
    fetchPropertyData();
    // scrape path uses legacy SSE fetch; intentionally not listing fetchPropertyData (non-memoized)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature, dataSource, fetchRegridParcelByUuid]);

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return 'N/A';
    const num = parseFloat(value);
    if (isNaN(num)) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const renderGeneralInfo = () => {
    if (!propertyData?.data?.general_info) return null;

    const generalInfo = propertyData.data.general_info;
    
    // Check if this is Teton County WY - check both general_info and property_details
    const countyState = generalInfo.county_state?.toLowerCase() || '';
    const countyFromDetails = propertyData?.data?.property_details?.data?.county?.toLowerCase() || '';
    const isTetonCounty = (countyState.includes('teton') && countyState.includes('wy')) ||
                         (countyFromDetails.includes('teton') && countyFromDetails.includes('wy'));
    
    // Get zoning from property details if available
    const zoning = propertyData?.data?.property_details?.data?.zoning;
    
    const summaryRows = [
      { label: 'Owner', value: generalInfo.owner_name || 'N/A' },
      { label: 'Parcel ID', value: generalInfo.county_parcel_id || 'N/A' },
      { label: 'Physical address', value: generalInfo.physical_address || 'N/A' },
      { label: 'Mailing address', value: generalInfo.mailing_address || 'N/A' },
      { label: 'Tax ID', value: generalInfo.tax_id || 'N/A' },
      { label: 'Account number', value: generalInfo.account_number || 'N/A' },
      { label: 'Total acres', value: generalInfo.acres || 'N/A' },
      ...(isTetonCounty && zoning ? [{ label: 'Zoning', value: zoning }] : [])
    ];

    const countyLinks = [
      { key: 'tax_records', label: 'Tax records' },
      { key: 'property_details', label: 'Property details' },
      { key: 'clerk_records', label: 'Clerk records' },
      { key: 'map_no', label: 'Map' },
      { key: 'deed_no', label: 'Deed' },
      { key: 'smart_gov', label: 'SmartGov' },
      { key: 'ldr_plan', label: 'LDR plan' }
    ].filter((item) => generalInfo.county_links?.[item.key]);

    return (
      <div className="general-info-section clean-details-shell">
        <div className="clean-details-header">
          <h3>Parcel Overview</h3>
          <p>{generalInfo.county_state || 'County data'}</p>
        </div>

        <div className="details-rows">
          {summaryRows.map((row) => (
            <div key={row.label} className="details-row">
              <span className="details-label">{row.label}</span>
              <span className="details-value">{row.value}</span>
            </div>
          ))}
        </div>

        {countyLinks.length > 0 && (
          <div className="clean-links-row">
            {countyLinks.map((item) => (
              <a
                key={item.key}
                href={generalInfo.county_links[item.key]}
                target="_blank"
                rel="noopener noreferrer"
                className="county-link-chip"
              >
                {item.label}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderPropertyDetails = () => {
    const propertyDetails = propertyData?.data?.property_details;
    
    console.log('Property Details Debug:', propertyDetails);
    
    if (!propertyDetails || propertyDetails.status === 'error') {
      return (
        <div className="no-data-section">
          <div className="no-data-icon">🏠</div>
          <h4>Property Details Unavailable</h4>
          <p>{propertyDetails?.message || 'Property details are not available for this property.'}</p>
        </div>
      );
    }

    const details = propertyDetails.data;
    console.log('Property Details Data:', details);
    
    if (!details) {
      return (
        <div className="no-data-section">
          <div className="no-data-icon">🏠</div>
          <h4>No Property Details Found</h4>
          <p>No detailed property information is available for this property.</p>
        </div>
      );
    }
    
    const formatAcres = (value) => {
      if (value === null || value === undefined || value === '') return 'N/A';
      return `${value} acres`;
    };

    const renderDetailRows = (rows) => (
      <div className="details-rows">
        {rows.map((row) => (
          <div key={row.label} className="details-row">
            <span className="details-label">{row.label}</span>
            <span className="details-value">{row.value || 'N/A'}</span>
          </div>
        ))}
      </div>
    );

    const basicRows = [
      { label: 'Owner', value: details.owner_name },
      { label: 'Physical address', value: details.physical_address },
      { label: 'Mailing address', value: details.mailing_address },
      { label: 'Parcel ID', value: details.county_parcel_id },
      { label: 'Tax ID', value: details.tax_id },
      { label: 'Legal description', value: details.legal_description }
    ];

    const valuationRows = [
      { label: 'Total property value', value: formatCurrency(details.total_property_value) },
      { label: 'Land value', value: formatCurrency(details.land_value) },
      { label: 'Development value', value: formatCurrency(details.developments_value) }
    ];

    const acreageRows = [
      { label: 'Total acreage', value: formatAcres(details.total_acreage) },
      { label: 'Residential', value: formatAcres(details.acreage_breakdown?.residential || 0) },
      { label: 'Agricultural', value: formatAcres(details.acreage_breakdown?.agricultural || 0) },
      { label: 'Commercial', value: formatAcres(details.acreage_breakdown?.commercial || 0) },
      { label: 'Industrial', value: formatAcres(details.acreage_breakdown?.industrial || 0) },
      { label: 'Other', value: formatAcres(details.acreage_breakdown?.other || 0) }
    ];

    return (
      <div className="property-details-content property-details-redesign">
        <div className="property-details-toggle-row">
          <button
            type="button"
            className="property-details-collapse-btn"
            onClick={() => setIsPropertyDetailsCollapsed((prev) => !prev)}
          >
            {isPropertyDetailsCollapsed ? 'Show Property Details' : 'Hide Property Details'}
          </button>
        </div>

        {!isPropertyDetailsCollapsed && (
          <>
            <div className="details-block">
              <h4>Property Information</h4>
              {renderDetailRows(basicRows)}
            </div>

            <div className="details-block">
              <h4>Valuation</h4>
              {renderDetailRows(valuationRows)}
            </div>

            <div className="details-block">
              <h4>Land Information</h4>
              {renderDetailRows(acreageRows)}
            </div>

            {details.developments && details.developments.length > 0 && (
              <div className="details-block">
                <h4>Buildings & Developments ({details.num_developments || details.developments.length})</h4>
                {details.developments.map((development, index) => (
                  <div key={index} className="development-card">
                    <div className="development-header">
                      <strong>Development {development.id || index + 1}</strong>
                    </div>
                    <div className="development-details">
                      <div><strong>Description:</strong> {development.description || 'N/A'}</div>
                      <div><strong>Stories:</strong> {development.stories || 'N/A'}</div>
                      <div><strong>Square Feet:</strong> {development.sq_ft || 'N/A'}</div>
                      <div><strong>Exterior:</strong> {development.exterior || 'N/A'}</div>
                      <div><strong>Roof Cover:</strong> {development.roof_cover || 'N/A'}</div>
                      <div><strong>Bedrooms:</strong> {development.bedrooms || 'N/A'}</div>
                      <div><strong>Year Built:</strong> {development.year_built || 'N/A'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderTaxDetails = () => {
    const taxData = propertyData?.data?.tax;
    
    if (!taxData || taxData.status === 'error') {
      return (
        <div className="no-data-section">
          <div className="no-data-icon">💰</div>
          <h4>Tax Information Unavailable</h4>
          <p>{taxData?.message || 'Tax information is not available for this property.'}</p>
        </div>
      );
    }

    const tax = taxData.data;
    if (!tax) {
      return (
        <div className="no-data-section">
          <div className="no-data-icon">💰</div>
          <h4>No Tax Information Found</h4>
          <p>No tax information is available for this property.</p>
        </div>
      );
    }

    // Check if this is Teton County WY
    const isTetonCounty = propertyData?.data?.general_info?.county_state?.toLowerCase().includes('teton') && 
                         propertyData?.data?.general_info?.county_state?.toLowerCase().includes('wy');
    
    return (
      <div className="tax-details-content">
        {/* General Tax Information */}
        <div className="current-tax-section">
          <h4>General Tax Info</h4>
          <div className="tax-grid">
            <div className="tax-item">
              <strong>Tax ID:</strong> {tax.tax_id || 'N/A'}
            </div>
            <div className="tax-item">
              <strong>Account Number:</strong> {tax.account_number || 'N/A'}
            </div>
            <div className="tax-item">
              <strong>Tax District:</strong> {tax.tax_district || 'N/A'}
            </div>
            <div className="tax-item">
              <strong>Mill Levy:</strong> {tax.mill_levy || 'N/A'}
            </div>
            
              <>
                <div className="tax-item">
                  <strong>Status:</strong> 
                  <span className={`status-badge ${tax.status?.toLowerCase()}`}>
                    {tax.status?.toUpperCase() || 'N/A'}
                  </span>
                </div>
                <div className="tax-item">
                  <strong>Amount Due:</strong> {formatCurrency(tax.amount_due)}
                </div>
              </>
            
            <div className="tax-item">
              <strong>Total Tax Levied:</strong> {formatCurrency(tax.total_tax_levied)}
            </div>
            <div className="tax-item">
              <strong>Tax Received:</strong> {formatCurrency(tax.tax_received)}
            </div>
          </div>
        </div>

        {/* Current Year Tax Breakdown */}
        {tax.first_half && tax.second_half && (
          <div className="payment-breakdown-section">
            <h4>Current Year Tax Break Down</h4>
            <div className="payment-breakdown-grid">
              <div className="payment-half">
                <h5>First Half</h5>
                <div className="payment-details">
                  <div><strong>Due Date:</strong> {formatDate(tax.first_half_due_date)}</div>
                  <div><strong>Levied:</strong> {formatCurrency(tax.first_half.levied)}</div>
                  <div><strong>Paid:</strong> {formatCurrency(tax.first_half.paid)}</div>
                  <div><strong>Balance:</strong> {formatCurrency(tax.first_half.balance)}</div>
                  <div><strong>Days Delinquent:</strong> {tax.first_half.days_delinquent || 'N/A'}</div>
                </div>
              </div>
              <div className="payment-half">
                <h5>Second Half</h5>
                <div className="payment-details">
                  <div><strong>Due Date:</strong> {formatDate(tax.second_half_due_date)}</div>
                  <div><strong>Levied:</strong> {formatCurrency(tax.second_half.levied)}</div>
                  <div><strong>Paid:</strong> {formatCurrency(tax.second_half.paid)}</div>
                  <div><strong>Balance:</strong> {formatCurrency(tax.second_half.balance)}</div>
                  <div><strong>Days Delinquent:</strong> {tax.second_half.days_delinquent || 'N/A'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Historical Tax Information */}
        {tax.historical_data && tax.historical_data.length > 0 && (
          <div className="historical-tax-section">
            <h4>📈 Tax History</h4>
            <div className="historical-taxes">
              {/* Table Header */}
              <div className="historical-tax-header">
                <div className="historical-year">Year</div>
                <div className="historical-total-levied">Total Tax Levied</div>
                <div className="historical-total-paid">Total Tax Paid</div>
                <div className="historical-first-levied">First Half Levied</div>
                <div className="historical-first-paid">First Half Paid</div>
                <div className="historical-first-date">First Half Date of Pay</div>
                <div className="historical-second-levied">Second Half Levied</div>
                <div className="historical-second-paid">Second Half Paid</div>
                <div className="historical-second-date">Second Half Date of Pay</div>
                <div className="historical-status">Status</div>
              </div>
              
              {/* Table Rows */}
              {tax.historical_data.map((historical, index) => {
                // Determine payment status with 5% tolerance on low side
                const taxLevied = parseFloat(historical.tax_levied) || 0;
                const taxPaid = parseFloat(historical.tax_paid) || 0;
                
                // For counties with first/second half, calculate total paid from those
                let totalActualPaid = taxPaid;
                if (historical.first_half && historical.second_half) {
                  const firstPaid = parseFloat(historical.first_half.tax_paid) || 0;
                  const secondPaid = parseFloat(historical.second_half.tax_paid) || 0;
                  totalActualPaid = firstPaid + secondPaid;
                }
                
                let status = 'unpaid';
                
                // Calculate 5% buffer on the low side
                const lowSideBuffer = taxLevied * 0.95; // 95% of levied amount
                
                // If paid >= levied amount, always PAID
                // If paid >= 95% of levied amount, also PAID (5% buffer on low side)
                if (totalActualPaid >= lowSideBuffer) {
                  status = 'paid';
                } else if (totalActualPaid > 0) {
                  status = 'partial';
                }

                return (
                  <div key={index} className="historical-tax-item">
                    <div className="historical-year">{historical.year || 'N/A'}</div>
                    <div className="historical-total-levied">{formatCurrency(historical.tax_levied)}</div>
                    <div className="historical-total-paid">{formatCurrency(totalActualPaid)}</div>
                    <div className="historical-first-levied">
                      {historical.first_half ? formatCurrency(historical.first_half.tax_levied) : 'N/A'}
                    </div>
                    <div className="historical-first-paid">
                      {historical.first_half ? formatCurrency(historical.first_half.tax_paid) : '$0'}
                    </div>
                    <div className="historical-first-date">
                      {historical.first_half?.date_paid ? formatDate(historical.first_half.date_paid) : ''}
                    </div>
                    <div className="historical-second-levied">
                      {historical.second_half ? formatCurrency(historical.second_half.tax_levied) : 'N/A'}
                    </div>
                    <div className="historical-second-paid">
                      {historical.second_half ? formatCurrency(historical.second_half.tax_paid) : '$0'}
                    </div>
                    <div className="historical-second-date">
                      {historical.second_half?.date_paid ? formatDate(historical.second_half.date_paid) : ''}
                    </div>
                    <div className="historical-status">
                      <span className={`status-badge ${status}`}>{status.toUpperCase()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const formatRegridLabel = (key) =>
    key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .replace(/ll\s+/gi, '')
      .replace(/gis\s+/gi, '')
      .trim();

  const formatRegridValue = (key, value) => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'number') {
      if (key.includes('price') || key.includes('value') || key.includes('val')) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
      }
      if (key.includes('acre') || key.includes('gisacre')) return `${Number(value).toFixed(2)} acres`;
      if (key.includes('sqft') || key.includes('gissqft')) return `${parseInt(value, 10).toLocaleString()} sq ft`;
      return value.toLocaleString();
    }
    return String(value);
  };

  const REGGRID_EXCLUDE_FIELDS = new Set([
    'll_uuid',
    'parcelnumb',
    'owner',
    'address',
    'fid',
    'ogc_fid',
    'path',
    'id',
    'geometry',
    'geom',
    'wkb_geometry',
    'shape',
    'centroid',
    'fields',
    'context',
    'addresses',
    'enhanced_ownership',
    'field_labels',
    'headline',
  ]);

  if (dataSource === 'regrid') {
    const p = regridParcelProps || {};
    const title = p.owner || feature?.properties?.owner || 'Parcel';
    const subtitle = p.path || feature?.properties?.path || '';

    return (
      <div className="property-details-popup-overlay" onClick={onClose}>
        <div className="property-details-popup property-details-popup--regrid" onClick={(e) => e.stopPropagation()}>
          <div className="popup-header">
            <h3>Parcel record</h3>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          <div className="popup-content" aria-busy={loading && !regridParcelProps}>
            {error && (
              <div className="error-section">
                <div className="error-icon">⚠️</div>
                <h4>Unable to load parcel</h4>
                <p>{error}</p>
                <button type="button" onClick={fetchRegridParcelByUuid} className="retry-button">
                  Try again
                </button>
              </div>
            )}

            {!error && regridParcelProps && (
              <div className="property-data-content">
                <div className="general-info-section clean-details-shell">
                  <div className="clean-details-header">
                    <h3>{title}</h3>
                    {subtitle ? <p className="regrid-path-subtitle">{subtitle}</p> : null}
                  </div>
                  <div className="details-rows">
                    {[
                      { label: 'Owner', value: p.owner },
                      { label: 'Parcel number', value: p.parcelnumb },
                      { label: 'Address', value: p.address },
                      { label: 'Mailing address', value: p.mailing_address },
                      { label: 'County', value: p.county },
                      { label: 'State', value: p.state || p.state2 },
                      { label: 'Acres (GIS)', value: p.ll_gisacre != null ? `${Number(p.ll_gisacre).toFixed(2)} acres` : null },
                    ]
                      .filter((row) => row.value != null && row.value !== '')
                      .map((row) => (
                        <div key={row.label} className="details-row">
                          <span className="details-label">{row.label}</span>
                          <span className="details-value">{String(row.value)}</span>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="property-details-toggle-row" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="property-details-collapse-btn"
                    onClick={() => setRegridAllFieldsOpen((o) => !o)}
                  >
                    {regridAllFieldsOpen ? 'Hide all attributes' : 'Show all attributes'}
                  </button>
                </div>

                {regridAllFieldsOpen && (
                  <div className="details-rows regrid-all-fields" style={{ maxHeight: '45vh', overflowY: 'auto' }}>
                    {Object.keys(p)
                      .filter((k) => !REGGRID_EXCLUDE_FIELDS.has(k))
                      .sort((a, b) => a.localeCompare(b))
                      .map((key) => {
                        const raw = p[key];
                        if (raw === null || raw === undefined || raw === '') return null;
                        if (typeof raw === 'object') return null;
                        return (
                          <div key={key} className="details-row">
                            <span className="details-label">{formatRegridLabel(key)}</span>
                            <span className="details-value">{formatRegridValue(key, raw)}</span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="property-details-popup-overlay" onClick={onClose}>
      <div className="property-details-popup" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <h3>
            {propertyData?.data?.general_info?.county_state || 'Property'} Property Info
            {/* Show "Updating..." badge when we have cached data but waiting for fresh */}
            {propertyData && !isFresh && loading && (
              <span className="updating-badge">Updating...</span>
            )}
          </h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="popup-content" aria-busy={loading && !propertyData}>
          {error && (
            <div className="error-section">
              <div className="error-icon">⚠️</div>
              <h4>Unable to Load Property Data</h4>
              <p>{error}</p>
              <button onClick={fetchPropertyData} className="retry-button">
                Try Again
              </button>
            </div>
          )}

          {/* Show data as soon as we have it (cached or fresh) */}
          {propertyData && !error && (
            <div className="property-data-content">
              {/* General Information Header */}
              {renderGeneralInfo()}
              
              {/* Tab Navigation */}
              <div className="tab-navigation">
                <button 
                  className={`tab-button ${activeTab === 'property' ? 'active' : ''}`}
                  onClick={() => setActiveTab('property')}
                >
                  Property Details
                </button>
                <button 
                  className={`tab-button ${activeTab === 'tax' ? 'active' : ''}`}
                  onClick={() => setActiveTab('tax')}
                >
                  Tax Information
                </button>
              </div>

              {/* Tab Content */}
              <div className="tab-content">
                {activeTab === 'property' && renderPropertyDetails()}
                {activeTab === 'tax' && renderTaxDetails()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PropertyDetailsPopup;
