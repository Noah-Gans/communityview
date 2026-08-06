import React from 'react';

/**
 * Parcel-pick wizard panel for listing content (instructions + continue/cancel).
 * Parcel search uses the main header Search tab /search page.
 */
export default function PropertyMapWizardBar({
  selectedCount = 0,
  isBusy = false,
  isPanelOpen = false,
  onCancel,
  onContinue,
}) {
  const dockShiftClass = isPanelOpen ? ' property-map-wizard--panel-open' : '';

  return (
    <div
      className={`property-map-wizard-bar${dockShiftClass}${isBusy ? ' property-map-wizard-bar--busy' : ''}`}
      aria-busy={isBusy ? 'true' : 'false'}
    >
      <div className="property-map-wizard-bar-inner">
          <p className="property-map-wizard-title">Select the parcel or parcels of your listing.</p>
        <p className="property-map-wizard-help">
          <strong>
            Hold <kbd className="property-map-wizard-kbd">Shift</kbd> and click for multiple parcel
            listings. Or use Search above to find your listing.
          </strong>
        </p>
        {isBusy && (
          <p className="property-map-wizard-help property-map-wizard-help-secondary">
            Building your property outline…
          </p>
        )}
        <div className="property-map-wizard-footer-row">
          <p className="property-map-wizard-count">
            Selected: <strong>{selectedCount}</strong>
          </p>
          <div className="property-map-wizard-actions">
            <button
              type="button"
              className="property-map-wizard-btn property-map-wizard-btn-secondary"
              onClick={onCancel}
              disabled={isBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`property-map-wizard-btn property-map-wizard-btn-primary${isBusy ? ' property-map-wizard-btn-primary--busy' : ''}`}
              onClick={onContinue}
              disabled={isBusy || selectedCount === 0}
            >
              {isBusy ? (
                <>
                  <span className="property-map-wizard-spinner" aria-hidden="true" />
                  Building…
                </>
              ) : (
                'Continue'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
