import React from 'react';

/**
 * Collapsible section for the print side panel (Basemap, Layers, Map items, etc.).
 */
export function PrintFlowAccordion({ id, title, isOpen, onToggle, children, dataTour }) {
  return (
    <div className={`print-flow-panel ${isOpen ? 'is-open' : ''}`} data-tour={dataTour}>
      <button type="button" className="print-flow-panel-header" onClick={() => onToggle(id)}>
        <span className="print-flow-panel-title">{title}</span>
        <span className="print-flow-chevron" aria-hidden>
          {isOpen ? '▾' : '▸'}
        </span>
      </button>
      {isOpen && <div className="print-flow-panel-body">{children}</div>}
    </div>
  );
}
