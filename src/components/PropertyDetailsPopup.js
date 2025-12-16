import React, { useState, useEffect } from 'react';
import './PropertyDetailsPopup.css';
import { getCountyCodeFromFeature, getCountyParcelIdFromFeature } from '../utils/parseGFI';

const PropertyDetailsPopup = ({ feature, onClose }) => {
  const [propertyData, setPropertyData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isFresh, setIsFresh] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('property');

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

  useEffect(() => {
    fetchPropertyData();
  }, [feature]);

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
    
    return (
      <div className="general-info-section">
        <h3>General Info for PIDN: {generalInfo.county_parcel_id}</h3>
        <div className="general-info-grid-3x2">
          <div className="general-info-card">
            <div className="card-header">👤 Owner Name</div>
            <div className="card-content">{generalInfo.owner_name || 'N/A'}</div>
          </div>
          <div className="general-info-card">
            <div className="card-header">📍 Physical Address</div>
            <div className="card-content">{generalInfo.physical_address || 'N/A'}</div>
          </div>
          <div className="general-info-card">
            <div className="card-header">📮 Mailing Address</div>
            <div className="card-content">{generalInfo.mailing_address || 'N/A'}</div>
          </div>
          <div className="general-info-card">
            <div className="card-header">🆔 Tax ID</div>
            <div className="card-content">{generalInfo.tax_id || 'N/A'}</div>
          </div>
          <div className="general-info-card">
            <div className="card-header">📄 Account Number</div>
            <div className="card-content">{generalInfo.account_number || 'N/A'}</div>
          </div>
          <div className="general-info-card">
            <div className="card-header">🏕️ Total Acres</div>
            <div className="card-content">{generalInfo.acres || 'N/A'}</div>
          </div>

          {/* Zoning - Only for Teton County WY */}
          {isTetonCounty && zoning && (
            <div className="general-info-card">
              <div className="card-header">🏛️ Zoning</div>
              <div className="card-content">{zoning}</div>
            </div>
          )}

          {/* County Links Buttons in the same grid */}
          {generalInfo.county_links?.tax_records && (
            <a 
              href={generalInfo.county_links.tax_records} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="general-info-card county-link-card"
            >
              <div className="card-header">💰 Tax Records</div>
              <div className="card-content">View County Site</div>
            </a>
          )}
          {generalInfo.county_links?.property_details && (
            <a 
              href={generalInfo.county_links.property_details} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="general-info-card county-link-card"
            >
              <div className="card-header">🏠 Property Details</div>
              <div className="card-content">View County Site</div>
            </a>
          )}
          {generalInfo.county_links?.clerk_records && (
            <a 
              href={generalInfo.county_links.clerk_records} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="general-info-card county-link-card"
            >
              <div className="card-header">📋 Clerk Records</div>
              <div className="card-content">View County Site</div>
            </a>
          )}
          {generalInfo.county_links?.map_no && (
            <a 
              href={generalInfo.county_links.map_no} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="general-info-card county-link-card"
            >
              <div className="card-header">🗺️ Map No</div>
              <div className="card-content">View County Site</div>
            </a>
          )}
          {generalInfo.county_links?.deed_no && (
            <a 
              href={generalInfo.county_links.deed_no} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="general-info-card county-link-card"
            >
              <div className="card-header">📜 Deed No</div>
              <div className="card-content">View County Site</div>
            </a>
          )}
          {generalInfo.county_links?.smart_gov && (
            <a 
              href={generalInfo.county_links.smart_gov} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="general-info-card county-link-card"
            >
              <div className="card-header">🏛️ Smart Gov</div>
              <div className="card-content">View County Site</div>
            </a>
          )}
          {generalInfo.county_links?.ldr_plan && (
            <a 
              href={generalInfo.county_links.ldr_plan} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="general-info-card county-link-card"
            >
              <div className="card-header">📐 LDR Plan</div>
              <div className="card-content">View County Site</div>
            </a>
          )}
        </div>
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
    
    return (
      <div className="property-details-content">
        {/* Basic Property Information */}
        <div className="property-section">
          <h4>🏠 Basic Information</h4>
          <div className="property-grid">
            <div className="property-item">
              <strong>Physical Address:</strong> {details.physical_address || 'N/A'}
            </div>
            <div className="property-item">
              <strong>Mailing Address:</strong> {details.mailing_address || 'N/A'}
            </div>
            <div className="property-item">
              <strong>Owner Name:</strong> {details.owner_name || 'N/A'}
            </div>
            <div className="property-item">
              <strong>County Parcel ID:</strong> {details.county_parcel_id || 'N/A'}
            </div>
            <div className="property-item">
              <strong>Tax ID:</strong> {details.tax_id || 'N/A'}
            </div>
            <div className="property-item">
              <strong>Legal Description:</strong> {details.legal_description || 'N/A'}
            </div>
          </div>
        </div>

        {/* Property Values */}
        <div className="value-section">
          <h4>📊 Property Values</h4>
          <div className="value-grid">
            <div className="value-item">
              <strong>Total Property Value:</strong> {formatCurrency(details.total_property_value)}
            </div>
            <div className="value-item">
              <strong>Land Value:</strong> {formatCurrency(details.land_value)}
            </div>
            <div className="value-item">
              <strong>Developments Value:</strong> {formatCurrency(details.developments_value)}
            </div>
          </div>
        </div>

        {/* Acreage Information */}
        <div className="acreage-section">
          <h4>📏 Acreage Information</h4>
          <div className="acreage-grid">
            <div className="acreage-item">
              <strong>Total Acreage:</strong> {details.total_acreage || 'N/A'} acres
            </div>
            {details.acreage_breakdown && (
              <>
                <div className="acreage-item">
                  <strong>Residential:</strong> {details.acreage_breakdown.residential || 0} acres
                </div>
                <div className="acreage-item">
                  <strong>Agricultural:</strong> {details.acreage_breakdown.agricultural || 0} acres
                </div>
                <div className="acreage-item">
                  <strong>Commercial:</strong> {details.acreage_breakdown.commercial || 0} acres
                </div>
                <div className="acreage-item">
                  <strong>Industrial:</strong> {details.acreage_breakdown.industrial || 0} acres
                </div>
                <div className="acreage-item">
                  <strong>Other:</strong> {details.acreage_breakdown.other || 0} acres
                </div>
              </>
            )}
          </div>
        </div>

        {/* Developments */}
        {details.developments && details.developments.length > 0 && (
          <div className="developments-section">
            <h4>🏗️ Buildings & Developments ({details.num_developments})</h4>
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

        <div className="popup-content">
          {/* Show loading spinner only if we don't have any data yet */}
          {loading && !propertyData && (
            <div className="loading-section">
              <div className="spinner"></div>
              <p>Loading property information...</p>
            </div>
          )}

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
                  🏠 Property Details
                </button>
                <button 
                  className={`tab-button ${activeTab === 'tax' ? 'active' : ''}`}
                  onClick={() => setActiveTab('tax')}
                >
                  💰 Tax Information
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
