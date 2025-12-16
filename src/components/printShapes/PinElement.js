import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useMapContext } from '../../pages/MapContext';

export default function PinElement({ shape, onChange, onDelete }) {
  const { selectedPrintElement, setSelectedPrintElement } = useMapContext();
  const [isSelected, setIsSelected] = useState(false);
  const [livePosition, setLivePosition] = useState({ x: shape.x, y: shape.y });
  const [liveSize, setLiveSize] = useState({ width: shape.width, height: shape.height });
  const [rotation, setRotation] = useState(shape.rotation || 0);
  console.log("PIN SHAPE")
  console.log(shape.fill)

  const fill = shape.fill || '#ffffff';
  const stroke = shape.stroke || '#000000';
  const strokeWidth = shape.strokeWidth ?? 2;
  const fillOpacity = shape.fillOpacity ?? 0;
  const strokeOpacity = shape.strokeOpacity ?? 1;

  useEffect(() => {
    setIsSelected(selectedPrintElement?.id === shape.id);
  }, [selectedPrintElement, shape.id]);

  const handleRotation = (eMove) => {
    const el = document.getElementById(`pin-${shape.id}`);
    if (!el) return;
    const { left, top, width, height } = el.getBoundingClientRect();
    const cx = left + width / 2, cy = top + height / 2;
    const dx = eMove.pageX - cx, dy = eMove.pageY - cy;
    const angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    const newRot = Math.round(angle);
    setRotation(newRot);
    onChange({ ...shape, rotation: newRot });
  };

  return (
    <>
      

      <Rnd
        bounds="parent"
        position={livePosition}
        size={liveSize}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedPrintElement({ ...shape, type: 'pin' });
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
          onChange({ ...shape, x: pos.x, y: pos.y, width: newW, height: newH, rotation });
        }}
        style={{ pointerEvents: 'auto', zIndex: 1000 }}
      >
        <div
          id={`pin-${shape.id}`}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
          }}
        >
          {/* ✅ LIVE edit border inside the container */}
          {isSelected && (
            <div
              style={{
                position: 'absolute',
                top: -4,
                left: -4,
                width: 'calc(100% + 8px)',
                height: 'calc(100% + 8px)',
                border: '2px dashed #1d784f',
                borderRadius: '4px',
                pointerEvents: 'none',
                zIndex: 998,
              }}
            />
          )}

          {/* ✅ Stylable SVG pin */}
          <svg
            viewBox="0 0 24 24"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
            style={{ display: 'block' }}
          >
            <path
              d="M18 9C18 13.7462 14.2456 18.4924 12.6765 20.2688C12.3109 20.6827 11.6891 20.6827 11.3235 20.2688C9.75444 18.4924 6 13.7462 6 9C6 7 7.5 3 12 3C16.5 3 18 7 18 9Z"
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
            <circle
              cx="12"
              cy="9"
              r="2"
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
          </svg>

          {/* ✅ Rotation handle */}
          {isSelected && (
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                window.addEventListener('mousemove', handleRotation);
                window.addEventListener('mouseup', () =>
                  window.removeEventListener('mousemove', handleRotation), { once: true });
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
        

          {/* ✅ X delete button OUTSIDE top-right corner */}
          {isSelected && (
            <button
              onClick={() => onDelete(shape.id)}
              style={{
                position: 'absolute',
                top: -24,
                right: -24,
                background: 'red',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                width: 20,
                height: 20,
                fontSize: 12,
                lineHeight: '16px',
                padding: 0,
                zIndex: 2000,
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
