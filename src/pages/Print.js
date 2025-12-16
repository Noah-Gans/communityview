import React, { useEffect, useState } from 'react';
import { useMapContext } from './MapContext';
import './Print.css';
import { svgMap } from '../components/printShapes/svgMap'; // Adjust path as needed

export default function PrintOverlay({ onClose }) {
  const {
    setPaperSize,
    setIsPrinting,
    addNote,
    addArrowShape, // ✅ Add this
    clearPrintElements,
    addLegend,
    addCompass,
    addCircle,
    addPin,
    addRectangle,
    addDiamond,
    addTriangle,
    selectedPrintElement,
    updatePrintElement,
    setSelectedPrintElement,
    addShape
  } = useMapContext();
  const [isOpen, setIsOpen] = useState(true);
  const [orientation, setOrientation] = useState('portrait');
  const [toolType, setToolType] = useState('note');

  useEffect(() => {
    console.log('Entering print mode');
    setIsPrinting(true);
    setPaperSize('portrait');
    document.body.classList.add('print-portrait', 'print-preview-active');
    // Apply styles that normally get injected on print
    const isPortrait = true; // default entry mode
  
    const scrollWrapper = document.querySelector('.print-scroll-wrapper');
    const map = document.getElementById('map');
  
    if (scrollWrapper) {
      scrollWrapper.style.width = isPortrait ? '8.5in' : '11in';
      scrollWrapper.style.height = isPortrait ? '10in' : '8.5in';
      scrollWrapper.style.overflow = 'hidden';
    }
  
    if (map) {
      map.style.width = isPortrait ? 'calc(8.5in - 40px)' : '10in';
      map.style.height = isPortrait ? '10in' : '7.5in';
      map.style.transform = 'none';
    }
  
    // Center scroll manually
    setTimeout(() => {
      if (scrollWrapper) {
        scrollWrapper.scrollLeft = scrollWrapper.scrollWidth / 2 - scrollWrapper.clientWidth / 2;
      }
    }, 50);
  
    console.log('[PrintOverlay] selectedPrintElement:', selectedPrintElement);
    return () => {
      console.log('Exiting print mode');
      setIsPrinting(false);
      setPaperSize('full');
      document.body.classList.remove('print-landscape', 'print-portrait', 'print-preview-active');
  
      // Reset inline styles (cleanup)
      if (scrollWrapper) {
        scrollWrapper.style.width = '';
        scrollWrapper.style.height = '';
        scrollWrapper.style.overflow = '';
      }
      if (map) {
        map.style.width = '';
        map.style.height = '';
        map.style.transform = '';
      }
    };
  }, []);

  // Switch orientation & paperSize
  const handleChangeOrientation = (e) => {
    const newOrientation = e.target.value;
    setOrientation(newOrientation);
    setPaperSize(newOrientation); // 'portrait' or 'landscape'
     // Add class to <body> to control @page orientation
    if (newOrientation === 'landscape') {
      document.body.classList.add('print-landscape');
      document.body.classList.remove('print-portrait');
    } else {
      document.body.classList.add('print-portrait');
      document.body.classList.remove('print-landscape');
    }
    setTimeout(() => {
      const scrollWrapper = document.querySelector('.print-scroll-wrapper');
      if (scrollWrapper) scrollWrapper.scrollLeft = 0;
    }, 50);
  };

  const handlePrint = () => {
    setSelectedPrintElement(null);
    const old = document.getElementById('dynamic-print-style');
    if (old) old.remove();
  
    const style = document.createElement('style');
    style.id = 'dynamic-print-style';
    style.textContent = `
      @page {
        size: ${orientation === 'portrait'
          ? '8.5in 11in portrait'
          : '11in 8.5in landscape'};
        margin: 0;
      }
    `;
    document.head.appendChild(style);
    setTimeout(() => window.print(), 50);
  };
  
  console.log('[PrintOverlay] render called'); // always prints if component renders

  useEffect(() => {
    console.log('[PrintOverlay] mounted');
  }, []);


  // Add a new note
  const handleAddNote = () => {
    addNote(); // calls the context function that pushes a new note
  };
  useEffect(() => {
    console.log('[useEffect] selectedPrintElement changed:', selectedPrintElement);
  }, [selectedPrintElement]);
  return (
    <div className="print-overlay">
      <div className={`print-panel ${isOpen ? '' : 'closed'}`}>
        <button className="toggle-btn" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? '<' : '>'}
        </button>
        <div className="content">
          <div className="tab-buttons">
            <button className="active">Print Options</button>
          </div>
          <div className="tab-content modern-print-panel">
            <div className="top-actions">
              <button className="print-button" onClick={handlePrint}>🖨️ Print</button>
              <div className="orientation-toggle">
                <button
                  className={orientation === 'portrait' ? 'selected' : ''}
                  onClick={() => {
                    const newOrientation = 'portrait';
                    setOrientation(newOrientation);
                    setPaperSize(newOrientation);
                    document.body.classList.add('print-portrait');
                    document.body.classList.remove('print-landscape');
                  }}
                >
                  Portrait
                </button>
                <button
                  className={orientation === 'landscape' ? 'selected' : ''}
                  onClick={() => {
                    const newOrientation = 'landscape';
                    setOrientation(newOrientation);
                    setPaperSize(newOrientation);
                    document.body.classList.add('print-landscape');
                    document.body.classList.remove('print-portrait');
                  }}
                >
                  Landscape
                </button>
              </div>
            </div>

            <div className="scroll-section">
            <h4>Add Shape</h4>
            <div className="scroll-container">
              {/* Add arrow button separately */}
              <div className="tooltip-wrapper">
                <button onClick={addArrowShape}>
                  ➡️
                </button>
                <span className="tooltip-text">Arrow</span>
              </div>
              {[
                { key: 'triangle', label: 'Triangle' },
                { key: 'square', label: 'square' },
                { key: 'diamond', label: 'diamond' },
                { key: 'circle', label: 'circle' },
                { key: 'pin', label: 'Pin' },
                { key: 'home', label: 'home' },
                { key: 'airport', label: 'Airport' },
                { key: 'mountain', label: 'Mountain' },
                { key: 'mountains2', label: 'mountains2' },
                { key: 'trail', label: 'trail' },
                { key: 'park', label: 'park' },
                { key: 'hiker', label: 'hiker' },
                { key: 'school', label: 'school' },
                { key: 'bank', label: 'Bank' },
                { key: 'climb1', label: 'climb1' },
                { key: 'gym', label: 'Gym' },
                { key: 'climb2', label: 'climb2' },
                { key: 'iceCream', label: 'iceCream' },
                { key: 'lake', label: 'lake' },
                { key: 'shop', label: 'shop' },
                { key: 'groceryStore', label: 'groceryStore' },
                { key: 'trailSign', label: 'trailSign' },
                { key: 'forest', label: 'forest' },
                { key: 'forest2', label: 'forest2' },


              ].map(({ key, label }) => (
                <div key={key} className="tooltip-wrapper">
                  <button onClick={() => addShape(key)}>
                    {svgMap[key]({
                      fill: '#000',
                      stroke: '#000',
                      strokeWidth: 1,
                      fillOpacity: 1,
                      strokeOpacity: 1
                    })}
                  </button>
                  <span className="tooltip-text">{label}</span>
                </div>
              ))}

              
            </div>
          </div>

          <div className="scroll-section">
            <h4>Add Map Elements</h4>
            <div className="scroll-container">
              <div className="tooltip-wrapper">
                <button onClick={addNote}>📝</button>
                <span className="tooltip-text">Note</span>
              </div>
              <div className="tooltip-wrapper">
                <button onClick={addLegend}>📚</button>
                <span className="tooltip-text">Legend</span>
              </div>
              <div className="tooltip-wrapper">
                <button onClick={() => addShape('compass')}>
                  {svgMap['compass']({
                    fill: '#000',
                    stroke: '#000',
                    strokeWidth: 1,
                    fillOpacity: 1,
                    strokeOpacity: 1,
                  })}
                </button>
                <span className="tooltip-text">Compass</span>
              </div>
            </div>
          </div>

          {/* 🎨 Edit Panel */}
{/* 🎨 Edit Panel */}
{selectedPrintElement && ['shape','triangle', 'rectangle', 'diamond', 'note', 'arrow', 'pin'].includes(selectedPrintElement.type) && (
  <div className="scroll-section">
    <h4>Edit {selectedPrintElement.type === 'note' ? 'Note' : 'Shape'}</h4>
    <div className="edit-panel">

      {/* 🟥 Fill Color – only show if not arrow */}
      {selectedPrintElement.type !== 'arrow' && (
        <label>
          Fill Color:
          <input
            type="color"
            value={
              selectedPrintElement.fill ||
              (selectedPrintElement.type === 'note' ? '#ffffff' : '#000000')
            }
            onChange={(e) =>
              updatePrintElement({ ...selectedPrintElement, fill: e.target.value })
            }
          />
        </label>
      )}

      <label>
        Border Color:
        <input
          type="color"
          value={selectedPrintElement.stroke || '#000000'}
          onChange={(e) =>
            updatePrintElement({ ...selectedPrintElement, stroke: e.target.value })
          }
        />
      </label>

      <label>
        Border Width:
        <input
          type="text"
          inputMode="numeric"
          value={
            selectedPrintElement.strokeWidth === undefined
              ? ''
              : selectedPrintElement.strokeWidth
          }
          onChange={(e) => {
            const raw = e.target.value;
            const parsed = parseFloat(raw);
            updatePrintElement({
              ...selectedPrintElement,
              strokeWidth: raw === '' ? undefined : isNaN(parsed) ? 0 : parsed,
            });
          }}
          placeholder="Border width"
        />
      </label>

      {/* 🟧 Fill Opacity – only show if not arrow */}
      {selectedPrintElement.type !== 'arrow' && (
        <label>
          Fill Opacity:
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={selectedPrintElement.fillOpacity ?? 1}
            onChange={(e) =>
              updatePrintElement({
                ...selectedPrintElement,
                fillOpacity: parseFloat(e.target.value),
              })
            }
          />
        </label>
      )}

      <label>
        Border Opacity:
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={selectedPrintElement.strokeOpacity ?? 1}
          onChange={(e) =>
            updatePrintElement({
              ...selectedPrintElement,
              strokeOpacity: parseFloat(e.target.value),
            })
          }
        />
      </label>

      {/* ✍️ Font Options – Only for Note */}
      {selectedPrintElement.type === 'note' && (
        <>
          <label>
            Font Color:
            <input
              type="color"
              value={selectedPrintElement.fontColor || '#000000'}
              onChange={(e) =>
                updatePrintElement({ ...selectedPrintElement, fontColor: e.target.value })
              }
            />
          </label>

          <label>
            Font Size:
            <input
              type="number"
              min="8"
              max="72"
              value={selectedPrintElement.fontSize ?? 14}
              onChange={(e) =>
                updatePrintElement({ ...selectedPrintElement, fontSize: parseInt(e.target.value) })
              }
            />
          </label>

          <label>
            Font Family:
            <select
              value={selectedPrintElement.fontFamily || 'sans-serif'}
              onChange={(e) =>
                updatePrintElement({ ...selectedPrintElement, fontFamily: e.target.value })
              }
            >
              <option value="sans-serif">Sans-serif</option>
              <option value="serif">Serif</option>
              <option value="monospace">Monospace</option>
              <option value="cursive">Cursive</option>
            </select>
          </label>

          <label>
            Text Align:
            <select
              value={selectedPrintElement.textAlign || 'left'}
              onChange={(e) =>
                updatePrintElement({ ...selectedPrintElement, textAlign: e.target.value })
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
        </>
      )}

    </div>
  </div>
)}



            <div className="final-tools">
              <button onClick={clearPrintElements}>🧹 Clear All</button>
            </div>
          </div>


        </div>
      </div>
    </div>
  );
}
