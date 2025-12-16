import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useMapContext } from '../../pages/MapContext';
import { svgMap } from './svgMap'; // 👈 a centralized SVG file you'll create

export default function ShapeElement({ shape, onChange, onDelete }) {
  const { selectedPrintElement, setSelectedPrintElement } = useMapContext();
  const [isSelected, setIsSelected] = useState(false);
  const [livePosition, setLivePosition] = useState({ x: shape.x, y: shape.y });
  const [liveSize, setLiveSize] = useState({ width: shape.width, height: shape.height });
  const [rotation, setRotation] = useState(shape.rotation || 0);
  const [resizeDirection, setResizeDirection] = useState(null);

  const fill = shape.fill || '#000000';
  const stroke = shape.stroke || '#000000';
  const strokeWidth = shape.strokeWidth ?? 1;
  const fillOpacity = shape.fillOpacity ?? 0;
  const strokeOpacity = shape.strokeOpacity ?? 1;

  useEffect(() => {
    setIsSelected(selectedPrintElement?.id === shape.id);
  }, [selectedPrintElement, shape.id]);

  const handleRotation = (eMove) => {
    const el = document.getElementById(`shape-${shape.id}`);
    if (!el) return;
    const { left, top, width, height } = el.getBoundingClientRect();
    const cx = left + width / 2, cy = top + height / 2;
    const dx = eMove.pageX - cx, dy = eMove.pageY - cy;
    const angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    const newRot = Math.round(angle);
    setRotation(newRot);
    onChange({ ...shape, rotation: newRot });
  };

  const renderSvg = svgMap[shape.svgKey]; // 👈 look up the SVG renderer

  return (
    <Rnd
    bounds="parent"
    position={livePosition}
    size={liveSize}
    lockAspectRatio={(() => {
        const shouldLock = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].includes(resizeDirection);
        console.log('🔒 Aspect Ratio Locked:', shouldLock);
        return shouldLock;
      })()}
    onResizeStart={(e, dir) => {
        console.log("resize dir:", dir);
        setResizeDirection(dir);
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
        setResizeDirection(null); // reset after resize ends
        onChange({ ...shape, x: pos.x, y: pos.y, width: newW, height: newH, rotation });
    }}
    style={{ pointerEvents: 'auto', zIndex: 1000 }}
    >

        <div
        id={`shape-${shape.id}`}
        onClick={(e) => {
            e.stopPropagation();
            setSelectedPrintElement(shape);
        }}
        style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            cursor: 'pointer',
        }}
        >
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

        {renderSvg &&
          renderSvg({
            fill,
            stroke,
            strokeWidth,
            fillOpacity,
            strokeOpacity,
          })}

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
            }}
          />
        )}

        {isSelected && (
          <button
            onClick={() => onDelete(shape.id)}
            style={{
              position: 'absolute',
              top: -28,
              right: -28,
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
              zIndex: 3000,
            }}
          >
            X
          </button>
        )}
      </div>
    </Rnd>
  );
}
