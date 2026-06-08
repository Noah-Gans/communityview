import React, { useState } from 'react';
import PrintEditorContent from './PrintEditorContent';

export default function PrintEditorPanel({
  currentMapId,
  selectedPrintElement,
  updatePrintElement,
  clearPrintElements,
  onBack,
  onSaveClick,
  activePrintTool,
  setActivePrintTool,
  addPrintElementFromTool,
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="print-overlay">
      <div className={`print-panel ${isOpen ? '' : 'closed'}`}>
        <button className="toggle-btn" onClick={() => setIsOpen((prev) => !prev)}>
          {isOpen ? '<' : '>'}
        </button>
        <div className="content">
          <div className="tab-buttons">
            <button className="active">Geo Map Builder</button>
          </div>

          <div className="tab-content modern-print-panel">
            <PrintEditorContent
              currentMapId={currentMapId}
              selectedPrintElement={selectedPrintElement}
              updatePrintElement={updatePrintElement}
              clearPrintElements={clearPrintElements}
              onBack={onBack}
              onSaveClick={onSaveClick}
              activePrintTool={activePrintTool}
              setActivePrintTool={setActivePrintTool}
              addPrintElementFromTool={addPrintElementFromTool}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

