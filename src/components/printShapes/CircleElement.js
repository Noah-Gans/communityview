import React, { useState } from 'react';
import { Rnd } from 'react-rnd';
import { useMapContext } from '../../pages/MapContext';

export default function CircleElement({ element, onChange, onDelete }) {
  const { selectedPrintElement, setSelectedPrintElement } = useMapContext();
  const isSelected = selectedPrintElement?.id === element.id;

  const [livePosition, setLivePosition] = useState({ x: element.x, y: element.y });
  const [liveSize, setLiveSize] = useState({
    width: element.width || 40,
    height: element.height || 40,
  });
  const [rotation, setRotation] = useState(element.rotation || 0);

  const fill = element.fill || '#000000';
  const stroke = element.stroke || '#000000';
  const strokeWidth = element.strokeWidth ?? 2;
  const fillOpacity = element.fillOpacity ?? 1;
  const strokeOpacity = element.strokeOpacity ?? 1;

  const handleRotation = (eMove) => {
    const shapeElement = document.getElementById(`pin-${element.id}`);
    if (!shapeElement) return;

    const rect = shapeElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = eMove.pageX - centerX;
    const dy = eMove.pageY - centerY;
    const angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    const newRot = Math.round(angle);

    setRotation(newRot);
    onChange({ ...element, rotation: newRot });
  };

  return (
    <>
      {/* ✅ Green bounding box (square) */}
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
            zIndex: 998,
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
        onClick={() => setSelectedPrintElement(element)}
        onDrag={(e, d) => setLivePosition({ x: d.x, y: d.y })}
        onResize={(e, dir, ref, delta, pos) => {
          const width = parseFloat(ref.style.width);
          const height = parseFloat(ref.style.height);
          setLiveSize({ width, height });
          setLivePosition({ x: pos.x, y: pos.y });
        }}
        onResizeStop={(e, dir, ref, delta, pos) => {
          const width = parseFloat(ref.style.width);
          const height = parseFloat(ref.style.height);
          const updated = {
            ...element,
            x: pos.x,
            y: pos.y,
            width,
            height,
            rotation,
          };
          onChange(updated);
        }}
        style={{ pointerEvents: 'auto', zIndex: 1000 }}
      >
        <div
          id={`pin-${element.id}`}
          style={{
            width: '100%',
            height: '100%',
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            position: 'relative',
          }}
        >
          {/* ✅ Rotation Handle (inside rotated frame) */}
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

          {/* ✅ Circle shape with dynamic styles */}
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              backgroundColor: fill,
              opacity: fillOpacity,
              border: `${strokeWidth}px solid ${stroke}`,
              borderColor: stroke,
              borderOpacity: strokeOpacity,
              position: 'relative',
            }}
          >
            {isSelected && (
            <button
              onClick={() => onDelete(element.id)}
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
        </div>
      </Rnd>
    </>
  );
}
