import React, { useState } from 'react';
import { Rnd } from 'react-rnd';
import { useMapContext } from '../../pages/MapContext';

export default function TriangleElement({ shape, onChange, onDelete }) {
  const { selectedPrintElement, setSelectedPrintElement } = useMapContext();
  const isSelected = selectedPrintElement?.id === shape.id;

  const [livePosition, setLivePosition] = useState({ x: shape.x, y: shape.y });
  const [liveSize, setLiveSize] = useState({ width: shape.width, height: shape.height });
  const [rotation, setRotation] = useState(shape.rotation || 0);

  // Correct rotation handler using bounding rect
  const handleMouseMove = (eMove) => {
    const shapeElement = document.getElementById(`triangle-${shape.id}`);
    if (!shapeElement) return;

    const rect = shapeElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = eMove.pageX - centerX;
    const dy = eMove.pageY - centerY;

    const angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    const updatedRotation = Math.round(angle);

    setRotation(updatedRotation);
    onChange({ ...shape, rotation: updatedRotation });
  };

  return (
    <>
      {/* Green bounding box */}
      {isSelected && (
        <div
          style={{
            position: 'absolute',
            top: livePosition.y - 1,
            left: livePosition.x - 1,
            width: liveSize.width + 2,
            height: liveSize.height + 2,
            border: '2px dashed #1d784f',
            borderRadius: '4px',
            zIndex: 999,
            pointerEvents: 'none',
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
          }}
        />
      )}

      <Rnd
        bounds="parent"
        size={liveSize}
        position={livePosition}
        onClick={() => setSelectedPrintElement(shape)}
        onDrag={(e, d) => setLivePosition({ x: d.x, y: d.y })}
        onDragStop={(e, d) => {
          const updated = { ...shape, x: d.x, y: d.y };
          setLivePosition({ x: d.x, y: d.y });
          onChange(updated);
        }}
        onResize={(e, dir, ref, delta, pos) => {
          setLivePosition({ x: pos.x, y: pos.y });
          setLiveSize({
            width: parseFloat(ref.style.width),
            height: parseFloat(ref.style.height),
          });
        }}
        onResizeStop={(e, dir, ref, delta, pos) => {
          const width = parseFloat(ref.style.width);
          const height = parseFloat(ref.style.height);
          const updated = {
            ...shape,
            x: pos.x,
            y: pos.y,
            width,
            height,
            rotation,
          };
          setLiveSize({ width, height });
          setLivePosition({ x: pos.x, y: pos.y });
          onChange(updated);
        }}
        style={{
          pointerEvents: 'auto',
          zIndex: 1000,
        }}
      >
        <div
          id={`triangle-${shape.id}`}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
          }}
        >
          {/* Rotation Handle inside the rotated element */}
          {isSelected && (
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                window.addEventListener('mousemove', handleMouseMove);
                window.addEventListener(
                  'mouseup',
                  () => {
                    window.removeEventListener('mousemove', handleMouseMove);
                  },
                  { once: true }
                );
              }}
              style={{
                position: 'absolute',
                left: '50%',
                top: 10,
                transform: `translate(-50%, -40px) rotate(${-rotation}deg)`,
                width: 20,
                height: 20,
                backgroundColor: '#1d784f',
                borderRadius: '50%',
                border: '2px solid white',
                cursor: 'grab',
                zIndex: 1001,
                pointerEvents: 'auto',
              }}
            />
          )}

            <svg width="100%" height="100%" viewBox="-5 -5 110 110" preserveAspectRatio="none">

            <polygon
                points="50,0 100,100 0,100"
                fill={shape.fill || 'black'}
                stroke={shape.stroke || 'black'}
                strokeWidth={shape.strokeWidth || 2}
                fillOpacity={shape.fillOpacity ?? 1}
                strokeOpacity={shape.strokeOpacity ?? 1}
            />

          </svg>

          {isSelected && (
            <button
              onClick={() => onDelete(shape.id)}
              style={{
                position: 'absolute',
                top: -20,
                right: -20,
                background: 'red',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                width: '20px',
                height: '20px',
                fontSize: '12px',
                lineHeight: '16px',
                padding: 0,
                zIndex: 10,
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
