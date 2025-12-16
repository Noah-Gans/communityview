// DraggableLegend.js
import React, { useState } from 'react';
import { Rnd } from 'react-rnd';
import { useMapContext } from '../../pages/MapContext';

export default function DraggableLegend({ id, children, onDelete }) {
  const { selectedPrintElement, setSelectedPrintElement } = useMapContext();
  const isSelected =
    selectedPrintElement?.id === id && selectedPrintElement?.type === 'legend';

  const [pos, setPos]   = useState({ x: 20, y: 20 });
  const [size, setSize] = useState({ width: 250, height: 150 });

  return (
    <Rnd
      bounds="parent"
      position={pos}
      size={size}
      onClick={e => {
        e.stopPropagation();                  // don’t let the overlay clear immediately
        setSelectedPrintElement({ id, type: 'legend' });
      }}
      onDragStop={(e, data) => setPos({ x: data.x, y: data.y })}
      onResizeStop={(e, dir, ref, delta, position) => {
        setSize({
          width:  parseFloat(ref.style.width),
          height: parseFloat(ref.style.height),
        });
        setPos(position);
      }}
      style={{
        background:      'rgba(255,255,255,0.9)',
        border:          '1px solid #ccc',
        boxSizing:       'border-box',
        pointerEvents:   'auto',
        position:        'relative',
        zIndex:          1000,
        overflow:        'hidden',
      }}
    >
      {/* only show the X when this legend is selected */}
      {isSelected && onDelete && (
        <button
          onClick={() => onDelete(id)}
          style={{
            position:     'absolute',
            top:          4,
            right:        4,
            background:   'red',
            color:        'white',
            border:       'none',
            borderRadius: '3px',
            cursor:       'pointer',
            zIndex:       20,
            width:        20,
            height:       20,
            fontSize:     12,
            lineHeight:   '16px',
            padding:      0,
          }}
        >
          X
        </button>
      )}

      {/* your legend items (labels + swatches) */}
      <div
        style={{
          width:       '100%',
          height:      '100%',
          overflow:    'auto',
          padding:     '8px',
          boxSizing:   'border-box',
          color:       'black',
        }}
      >
        {children}
      </div>
    </Rnd>
  );
}
