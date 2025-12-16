import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useMapContext } from '../../pages/MapContext';

export default function DiamondElement({ shape, onChange, onDelete }) {
  const { selectedPrintElement, setSelectedPrintElement } = useMapContext();
  const [isSelected, setIsSelected] = useState(false);
  const [livePosition, setLivePosition] = useState({ x: shape.x, y: shape.y });
  const [liveSize, setLiveSize] = useState({ width: shape.width, height: shape.height });
  const [rotation, setRotation] = useState(shape.rotation || 0);

  const fill = shape.fill || '#000000';
  const stroke = shape.stroke || '#000000';
  const strokeWidth = shape.strokeWidth ?? 2;
  const fillOpacity = shape.fillOpacity ?? 1;
  const strokeOpacity = shape.strokeOpacity ?? 1;


  useEffect(() => {
    console.log("came here")
    setIsSelected(selectedPrintElement?.id === shape.id);
  }, [selectedPrintElement, shape.id]);

  const handleRotation = (eMove) => {
    const shapeElement = document.getElementById(`diamond-${shape.id}`);
    if (!shapeElement) return;

    const rect = shapeElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = eMove.pageX - centerX;
    const dy = eMove.pageY - centerY;
    const angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    const newRot = Math.round(angle);

    setRotation(newRot);
    onChange({ ...shape, rotation: newRot });
  };

  return (
    <>
      {/* Green dashed edit box */}
      {isSelected && (
        <div
          style={{
            position: 'absolute',
            top: livePosition.y - 2,
            left: livePosition.x - 2,
            width: liveSize.width + 10,
            height: liveSize.height + 4,
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
        onClick={(e) => {
          e.stopPropagation(); // Prevents deselection
          setSelectedPrintElement(shape);
        }}
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
          id={`diamond-${shape.id}`}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
          }}
        >
          {/* ✅ Rotation anchor inside rotated context */}
          {isSelected && (
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                window.addEventListener('mousemove', handleRotation);
                window.addEventListener(
                  'mouseup',
                  () => {
                    window.removeEventListener('mousemove', handleRotation);
                  },
                  { once: true }
                );
              }}
              style={{
                position: 'absolute',
                top: -30,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 20,
                height: 20,
                backgroundColor: '#1d784f',
                borderRadius: '50%',
                border: '2px solid white',
                cursor: 'grab',
                zIndex: 2000,
                pointerEvents: 'auto',
              }}
            />
          )}

          <svg width="100%" height="100%" viewBox="-5 -5 110 110" preserveAspectRatio="none">
            <polygon
              points="50,0 100,50 50,100 0,50"
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
            />
          </svg>

          {isSelected && (
            <button
              onClick={() => onDelete(shape.id)}
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
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
                zIndex: 3,
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
