import React from 'react';
import './SaveDefaultCountyPrompt.css';

/**
 * @param {{
 *   county: { display?: string } | null,
 *   onSave: () => void,
 *   onDismiss: () => void,
 *   isSaving?: boolean,
 * }} props
 */
export default function SaveDefaultCountyPrompt({
  county,
  onSave,
  onDismiss,
  isSaving = false,
}) {
  if (!county) return null;

  const display = county.display || 'this county';

  return (
    <div className="county-save-prompt-overlay" role="presentation">
      <div
        className="county-save-prompt"
        role="dialog"
        aria-labelledby="county-save-prompt-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="county-save-prompt-header">
          <h3 id="county-save-prompt-title">Set your default search area</h3>
          <button
            type="button"
            className="county-save-prompt-close"
            onClick={onDismiss}
            disabled={isSaving}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="county-save-prompt-body">
          We detected <strong>{display}</strong> from your map. Save it as your default county so
          search opens locally without another lookup?
        </p>
        <div className="county-save-prompt-actions">
          <button
            type="button"
            className="county-save-prompt-primary"
            onClick={() => void onSave()}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save as default'}
          </button>
          <button
            type="button"
            className="county-save-prompt-secondary"
            onClick={onDismiss}
            disabled={isSaving}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
