// RectangleElement.js
import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useMapContext } from '../../pages/MapContext';

export default function RectangleElement({ shape, onChange, onDelete }) {
  const { selectedPrintElement, setSelectedPrintElement } = useMapContext();
  const [isSelected, setIsSelected]       = useState(false);
  const [livePosition, setLivePosition]   = useState({ x: shape.x, y: shape.y });
  const [liveSize, setLiveSize]           = useState({ width: shape.width, height: shape.height });
  const [rotation, setRotation]           = useState(shape.rotation || 0);
  const isPrintMode = typeof window !== 'undefined' && window.matchMedia?.('print').matches;

  const fill = shape.fill || '#000000';
  const stroke = shape.stroke || '#000000';
  const strokeWidth = shape.strokeWidth ?? 2;
  const fillOpacity = shape.fillOpacity ?? 1;
  const strokeOpacity = shape.strokeOpacity ?? 1;

  // Keep track of selection
  useEffect(() => {
    setIsSelected(selectedPrintElement?.id === shape.id);
  }, [selectedPrintElement, shape.id]);

  // Rotation logic
  const handleRotation = (eMove) => {
    const el = document.getElementById(`rect-${shape.id}`);
    if (!el) return;
    const { left, top, width, height } = el.getBoundingClientRect();
    const cx = left + width/2, cy = top + height/2;
    const dx = eMove.pageX - cx, dy = eMove.pageY - cy;
    const angle = Math.atan2(dx, -dy) * (180/Math.PI);
    const newRot = Math.round(angle);
    setRotation(newRot);
    onChange({ ...shape, rotation: newRot });
  };

 

  return (
    <>
      {/* dashed edit‐box */}
      {isSelected && (
        <div
          style={{
            position:        'absolute',
            top:             livePosition.y - 4,
            left:            livePosition.x - 4,
            width:           liveSize.width + 8,
            height:          liveSize.height + 8,
            border:          '2px dashed #1d784f',
            borderRadius:    '4px',
            pointerEvents:   'none',
            zIndex:          999,
            transform:       `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
          }}
        />
      )}

      <Rnd
        bounds="parent"
        position={livePosition}
        size={liveSize}
        onClick={e => {
          e.stopPropagation();
          setSelectedPrintElement({ id: shape.id, type: 'rectangle' });
        }}
        onDragStop={(e, d) => {
          setLivePosition({ x: d.x, y: d.y });
          onChange({ ...shape, x: d.x, y: d.y });
        }}
        onResizeStop={(e, dir, ref, delta, pos) => {
          const newW = parseFloat(ref.style.width);
          const newH = parseFloat(ref.style.height);
          setLiveSize({ width: newW, height: newH });
          setLivePosition(pos);
          onChange({
            ...shape,
            x: pos.x,
            y: pos.y,
            width: newW,
            height: newH,
            rotation
          });
        }}
        style={{ pointerEvents: 'auto', zIndex: 1000 }}
      >
        <div
          id={`rect-${shape.id}`}
          style={{
            width:           '100%',
            height:          '100%',
            position:        'relative',
            transform:       `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
          }}
        >
          {/* rotation handle */}
          {isSelected && (
            <div
              onMouseDown={e => {
                e.stopPropagation();
                window.addEventListener('mousemove', handleRotation);
                window.addEventListener('mouseup', () => {
                  window.removeEventListener('mousemove', handleRotation);
                }, { once: true });
              }}
              style={{
                position:       'absolute',
                top:            -30,
                left:           '50%',
                transform:      'translateX(-50%)',
                width:          20,
                height:         20,
                backgroundColor:'#1d784f',
                borderRadius:   '50%',
                border:         '2px solid white',
                cursor:         'grab',
                zIndex:         2000,
                pointerEvents:  'auto',
              }}
            />
          )}

          {/* SVG rectangle */}
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${liveSize.width} ${liveSize.height}`}
            preserveAspectRatio="none"
            style={{ display: 'block' }}
          >
            <rect
              x={0}
              y={0}
              width={liveSize.width}
              height={liveSize.height}
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
            />
          </svg>

          {/* delete “X” */}
          {isSelected && (
            <button
              onClick={() => onDelete(shape.id)}
              style={{
                position:    'absolute',
                top:         4,
                right:       4,
                background:  'red',
                color:       'white',
                border:      'none',
                borderRadius:'3px',
                cursor:      'pointer',
                width:       20,
                height:      20,
                fontSize:    12,
                lineHeight:  '16px',
                padding:     0,
                zIndex:      3,
              }}
            >
              X
            </button>
          )}
        </div>
      </Rnd>
    </>
  );
}
