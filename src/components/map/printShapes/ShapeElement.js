import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useMapContext } from '../../../pages/MapContext';
import { svgMap } from './svgMap';

export default function ShapeElement({ shape, onChange, onDelete, featurePointerEvents = 'auto' }) {
  const { selectedPrintElement, setSelectedPrintElement, shareViewerReadOnly } = useMapContext();
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

  useEffect(() => {
    const dw = shape.screenWidth ?? shape.width;
    const dh = shape.screenHeight ?? shape.height;
    setLivePosition({ x: shape.x, y: shape.y });
    setLiveSize({ width: dw, height: dh });
    setRotation(shape.rotation || 0);
  }, [
    shape.id,
    shape.x,
    shape.y,
    shape.width,
    shape.height,
    shape.screenWidth,
    shape.screenHeight,
    shape.rotation,
  ]);

  const handleRotation = (eMove) => {
    const el = document.getElementById(`shape-${shape.id}`);
    if (!el) return;
    const { left, top, width, height } = el.getBoundingClientRect();
    const cx = left + width / 2,
      cy = top + height / 2;
    const dx = eMove.pageX - cx,
      dy = eMove.pageY - cy;
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const newRot = Math.round(angle);
    setRotation(newRot);
    onChange({ ...shape, rotation: newRot });
  };

  const renderSvg = svgMap[shape.svgKey];

  return (
    <Rnd
      bounds="parent"
      position={livePosition}
      size={liveSize}
      disableDragging={!!shareViewerReadOnly}
      disableResizing={!!shareViewerReadOnly}
      lockAspectRatio={['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].includes(resizeDirection)}
      onResizeStart={(e, dir) => {
        if (shareViewerReadOnly) return;
        setResizeDirection(dir);
      }}
      onDrag={(e, d) => {
        if (shareViewerReadOnly) return;
        setLivePosition({ x: d.x, y: d.y });
      }}
      onDragStop={(e, d) => {
        if (shareViewerReadOnly) return;
        setLivePosition({ x: d.x, y: d.y });
        onChange({ ...shape, x: d.x, y: d.y });
      }}
      onResize={(e, dir, ref, delta, pos) => {
        if (shareViewerReadOnly) return;
        const newW = parseFloat(ref.style.width);
        const newH = parseFloat(ref.style.height);
        setLiveSize({ width: newW, height: newH });
        setLivePosition(pos);
      }}
      onResizeStop={(e, dir, ref, delta, pos) => {
        if (shareViewerReadOnly) return;
        const newW = parseFloat(ref.style.width);
        const newH = parseFloat(ref.style.height);
        setLiveSize({ width: newW, height: newH });
        setLivePosition(pos);
        setResizeDirection(null);
        const s = shape.printZoomScale ?? 1;
        onChange({ ...shape, x: pos.x, y: pos.y, width: newW / s, height: newH / s, rotation });
      }}
      style={{ pointerEvents: featurePointerEvents, zIndex: 1000 }}
    >
      <div
        id={`shape-${shape.id}`}
        title={shape.label || shape.type || 'feature'}
        onClick={(e) => {
          e.stopPropagation();
          if (!shareViewerReadOnly) setSelectedPrintElement(shape);
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
        {isSelected && !shareViewerReadOnly && (
          <div
            style={{
              position: 'absolute',
              top: -4,
              left: -4,
              width: 'calc(100% + 8px)',
              height: 'calc(100% + 8px)',
              border: '3px dashed #22c55a',
              borderRadius: '4px',
              pointerEvents: 'none',
              zIndex: 998,
              boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.25)',
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
            iconOpacity: shape.iconOpacity,
            iconScale: shape.iconScale,
            logoColor: shape.logoColor,
          })}

        {isSelected && !shareViewerReadOnly && (
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              window.addEventListener('mousemove', handleRotation);
              window.addEventListener(
                'mouseup',
                () => window.removeEventListener('mousemove', handleRotation),
                { once: true }
              );
            }}
            style={{
              position: 'absolute',
              top: -30,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 24,
              height: 24,
              backgroundColor: '#16a34a',
              borderRadius: '50%',
              border: '3px solid white',
              cursor: 'grab',
              zIndex: 2000,
              boxShadow: '0 0 0 2px rgba(0,0,0,0.2)',
            }}
          />
        )}

        {isSelected && !shareViewerReadOnly && (
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
