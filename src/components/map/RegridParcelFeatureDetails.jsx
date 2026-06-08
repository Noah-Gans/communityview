import React, { useCallback, useMemo } from 'react';
import { getPropertySectionIcon } from './propertyFieldIcons';
import { parseRegridLocation } from '../../utils/regridDetailSections';
import { buildRegridPropertyLayout } from '../../utils/regridPropertyLayout';

/* detail section builders live in utils/regridDetailSections.js */


function renderSectionCategoryTitle(title, isCollapsed, onToggle) {
  const SectionIcon = getPropertySectionIcon(title);
  return (
    <h4 className="enhanced-details-category-title">
      <button
        type="button"
        className="enhanced-details-category-toggle"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${title}`}
      >
        <span className="enhanced-details-category-toggle-main">
          {SectionIcon && (
            <span className="enhanced-details-category-icon" aria-hidden="true">
              <SectionIcon />
            </span>
          )}
          <span className="enhanced-details-category-title-text">{title}</span>
        </span>
        <span className="enhanced-details-category-toggle-indicator" aria-hidden="true">
          {isCollapsed ? '+' : '−'}
        </span>
      </button>
    </h4>
  );
}

function defaultRenderDetailField(label, displayValue, options = {}) {
  const { multiline = false, linkUrl } = options;
  const value =
    displayValue === null || displayValue === undefined || displayValue === ''
      ? 'N/A'
      : displayValue;
  const labelText = String(label || '').trim();
  const labelWithColon = labelText.endsWith(':') ? labelText : `${labelText}:`;

  return (
    <div
      className={`feature-field-row enhanced-details-field-row${multiline ? ' feature-field-row--multiline' : ''}`}
      key={`${labelWithColon}-${String(value).slice(0, 24)}`}
    >
      <div className="feature-field-label">
        <strong>{labelWithColon}</strong>
      </div>
      <span
        className={`field-value enhanced-details-field-value${multiline ? ' field-value--multiline' : ''}`}
      >
        {linkUrl ? (
          <a href={linkUrl} target="_blank" rel="noopener noreferrer">
            {value}
          </a>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

export { parseRegridLocation };
export { buildRegridPropertyLayout } from '../../utils/regridPropertyLayout';

export default function RegridParcelFeatureDetails({
  feature,
  index,
  ll_uuid,
  parcelCacheKey: parcelCacheKeyProp,
  detailedData,
  detailError,
  detailFetchFailed = false,
  isLoading,
  hasDetailedData,
  collapsedCategories,
  setCollapsedCategories,
  fetchRegridParcelDetails,
  renderField,
  renderDetailField: renderDetailFieldProp,
  onZoomToFeature,
  handleCreateMap,
  isMobile,
  isMapAppView,
}) {
  const renderDetailField = renderDetailFieldProp || defaultRenderDetailField;
  const locationDisplay = parseRegridLocation(
    feature?.properties?.path,
    detailedData,
    feature
  );

  const parcelCacheKey =
    parcelCacheKeyProp || ll_uuid || feature?.properties?.path || null;
  const detailsToggleKey = parcelCacheKey ? `enhancedDetails_${parcelCacheKey}` : null;
  const isEnhancedDetailsCollapsed =
    detailsToggleKey != null ? (collapsedCategories[detailsToggleKey] ?? true) : true;

  const toggleEnhancedDetails = useCallback(() => {
    if (!parcelCacheKey || !detailsToggleKey) return;
    const shouldExpand = isEnhancedDetailsCollapsed;
    if (shouldExpand && !hasDetailedData && !isLoading && !detailFetchFailed) {
      fetchRegridParcelDetails(ll_uuid || null, feature?.properties || {});
    }
    setCollapsedCategories((prev) => ({
      ...prev,
      [detailsToggleKey]: !isEnhancedDetailsCollapsed,
    }));
  }, [
    parcelCacheKey,
    ll_uuid,
    feature?.properties,
    detailsToggleKey,
    isEnhancedDetailsCollapsed,
    hasDetailedData,
    isLoading,
    detailFetchFailed,
    fetchRegridParcelDetails,
    setCollapsedCategories,
  ]);

  const getSectionToggleKey = useCallback(
    (sectionTitle) => {
      const parcelKey =
        parcelCacheKey ||
        feature?.properties?.parcelnumb ||
        feature?.properties?.address ||
        'parcel';
      return `enhancedDetailsSection_${parcelKey}_${sectionTitle}`;
    },
    [feature?.properties?.address, feature?.properties?.parcelnumb, parcelCacheKey]
  );

  const toggleSectionCategory = useCallback(
    (sectionTitle) => {
      const key = getSectionToggleKey(sectionTitle);
      setCollapsedCategories((prev) => ({
        ...prev,
        [key]: !(prev[key] ?? false),
      }));
    },
    [getSectionToggleKey, setCollapsedCategories]
  );

  const expandedDetailLayout = useMemo(() => {
    if (!hasDetailedData) {
      return { mailingLegal: [], sections: [] };
    }
    const pathValue = detailedData?.path || feature?.properties?.path;
    let county = detailedData?.county || feature?.properties?.county || null;
    let state = detailedData?.state || feature?.properties?.state || null;
    if (pathValue) {
      const pathParts = pathValue.split('/').filter((part) => part.length > 0);
      if (pathParts.length >= 3 && pathParts[0] === 'us') {
        if (!state) state = pathParts[1]?.toUpperCase() || null;
        if (!county && pathParts[2]) {
          county = pathParts[2]
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        }
      }
    }
    return buildRegridPropertyLayout(detailedData || {}, { path: pathValue, county, state }, feature);
  }, [detailedData, feature, hasDetailedData]);

  const regridEnhancedParts = useMemo(() => {
    if (!parcelCacheKey) {
      return { toolbar: null, expand: null };
    }

    const toolbar = (
      <div className="enhanced-details-panel enhanced-details-panel--regrid-toolbar-only">
        <div className="enhanced-details-toolbar">
          <button
            type="button"
            className="enhanced-details-toggle enhanced-details-toggle--regrid-single"
            onClick={toggleEnhancedDetails}
            aria-expanded={!isEnhancedDetailsCollapsed}
            aria-label={
              isEnhancedDetailsCollapsed ? 'Expand parcel details' : 'Collapse parcel details'
            }
            data-tour={index === 0 ? 'info-see-more-details' : undefined}
          >
            <span className="enhanced-details-toggle-label">Property details</span>
            <span className="enhanced-details-toggle-icon" aria-hidden="true">
              {isEnhancedDetailsCollapsed ? '▼' : '▲'}
            </span>
          </button>
        </div>
      </div>
    );

    const { sections } = expandedDetailLayout;

    const expand = (
      <div className="enhanced-details-panel enhanced-details-panel--regrid-expand-only">
        <div
          className={`enhanced-details-expand${!isEnhancedDetailsCollapsed ? ' is-open' : ''}`}
          aria-hidden={isEnhancedDetailsCollapsed}
          data-tour={index === 0 ? 'info-details-expanded' : undefined}
        >
          <div className="enhanced-details-expand-inner">
            {isLoading && !hasDetailedData && (
              <div className="enhanced-details-loading">Loading property details...</div>
            )}

            {!isLoading && detailError && (
              <div className="enhanced-details-error" role="alert">
                {detailError}
              </div>
            )}

            {!isLoading && !detailError && !hasDetailedData && (
              <div className="enhanced-details-empty">
                Could not load property details. Check that you are signed in and that the Regrid API
                token is configured on the server.
              </div>
            )}

            {hasDetailedData && (
              <>
                {sections.length > 0 && (
                  <div className="enhanced-details-sections enhanced-details-sections--regrid">
                    {sections.map((section) => {
                      const sectionToggleKey = getSectionToggleKey(section.title);
                      const isSectionCollapsed = collapsedCategories[sectionToggleKey] ?? false;
                      return (
                        <div
                          key={section.title}
                          className={`enhanced-details-category enhanced-details-category--regrid${
                            isSectionCollapsed ? ' is-collapsed' : ''
                          }`}
                        >
                          {renderSectionCategoryTitle(section.title, isSectionCollapsed, () =>
                            toggleSectionCategory(section.title)
                          )}
                          {!isSectionCollapsed && section.entries.length > 0 && (
                            <div className="enhanced-details-rows enhanced-details-rows--core">
                              {section.entries.map((entry) => (
                                <div
                                  key={entry.key || entry.label}
                                  className="enhanced-details-grid-cell"
                                >
                                  {renderDetailField(entry.label, entry.displayValue, {
                                    multiline: entry.multiline,
                                    linkUrl: entry.linkUrl,
                                  })}
                                </div>
                              ))}
                            </div>
                          )}
                          {!isSectionCollapsed && section.resourceLinks?.length > 0 && (
                            <div className="regrid-zoning-links" role="navigation" aria-label="Zoning resources">
                              {section.resourceLinks.map((link) => (
                                <a
                                  key={link.id}
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="regrid-zoning-link"
                                >
                                  {link.label}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {sections.length === 0 && (
                  <div className="enhanced-details-empty">No additional details found for this parcel.</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );

    return { toolbar, expand };
  }, [
    parcelCacheKey,
    isEnhancedDetailsCollapsed,
    isLoading,
    detailError,
    hasDetailedData,
    expandedDetailLayout,
    index,
    collapsedCategories,
    getSectionToggleKey,
    renderDetailField,
    toggleEnhancedDetails,
    toggleSectionCategory,
  ]);

  return (
    <div className="feature-details-regrid-primary">
      <div className="feature-header">
        <h3 className="feature-owner-name">{feature?.properties?.owner || 'N/A'}</h3>
        <div className="feature-address">{feature?.properties?.address || 'N/A'}</div>
      </div>

      <div className="regrid-action-buttons">
        {!isMobile && (
          <div className="action-buttons-row">
            {onZoomToFeature && (
              <button
                type="button"
                className="sp-map-button sp-button-half"
                onClick={() => onZoomToFeature(feature)}
                title="Zoom to this feature on the map"
              >
                Zoom to
              </button>
            )}
            <button
              type="button"
              className="sp-property-button sp-button-half"
              onClick={() => handleCreateMap(feature)}
              title="Create a map from this parcel"
            >
              Create Map
            </button>
          </div>
        )}
        {isMobile && (
          <div className="feature-details-regrid-mobile-actions">
            {isMapAppView && onZoomToFeature && (
              <button
                type="button"
                className="sp-map-button"
                onClick={() => onZoomToFeature(feature)}
                title="Zoom to this feature on the map"
              >
                Zoom to
              </button>
            )}
            <button
              type="button"
              className="sp-property-button"
              onClick={() => handleCreateMap(feature)}
              title="Create a map from this parcel"
            >
              Create Map
            </button>
          </div>
        )}
      </div>

      <div className="regrid-summary-fields">
        {renderField('Parcel Number:', feature?.properties?.parcelnumb || 'N/A')}
        {renderField('Owner:', feature?.properties?.owner || 'N/A')}
        {renderField('Address:', feature?.properties?.address || 'N/A')}
        {renderField('Location:', locationDisplay)}
        {hasDetailedData &&
          expandedDetailLayout.mailingLegal.map((entry) => (
            <React.Fragment key={entry.label}>
              {renderField(entry.label, entry.rawValue, entry.displayValue)}
            </React.Fragment>
          ))}
      </div>

      <div className="regrid-controls-stack">
        {regridEnhancedParts.toolbar}
      </div>

      {regridEnhancedParts.expand}

      {isLoading && (
        <div className="regrid-summary-loading" style={{ padding: '10px', textAlign: 'center', color: '#666' }}>
          Loading detailed information...
        </div>
      )}

    </div>
  );
}
