import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useMapContext } from '../../../pages/MapContext';
import { svgMap } from './svgMap';
import './printShapeChrome.css';

export default function ShapeElement({ shape, onChange, onDelete, featurePointerEvents = 'auto' }) {
  const { selectedPrintElement, setSelectedPrintElement, shareViewerReadOnly } = useMapContext();
  const [isSelected, setIsSelected] = useState(false);
  const [livePosition, setLivePosition] = useState({ x: shape.x, y: shape.y });
  const [liveSize, setLiveSize] = useState({ width: shape.width, height: shape.height });
  const [rotation, setRotation] = useState(shape.rotation || 0);

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
    const cx = left + width / 2;
    const cy = top + height / 2;
    const dx = eMove.pageX - cx;
    const dy = eMove.pageY - cy;
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const newRot = Math.round(angle);
    setRotation(newRot);
    onChange({ ...shape, rotation: newRot });
  };

  const renderSvg = svgMap[shape.svgKey];
  const scale = shape.printZoomScale ?? 1;

  const persistBox = (pos, size) => {
    onChange({
      ...shape,
      x: pos.x,
      y: pos.y,
      width: size.width / scale,
      height: size.height / scale,
      screenWidth: size.width,
      screenHeight: size.height,
      printZoomScale: scale,
      rotation,
    });
  };

  return (
    <Rnd
      bounds="parent"
      position={livePosition}
      size={liveSize}
      minWidth={28}
      minHeight={28}
      disableDragging={!!shareViewerReadOnly}
      enableResizing={
        shareViewerReadOnly || !isSelected
          ? false
          : {
              top: false,
              right: false,
              bottom: false,
              left: false,
              topRight: true,
              bottomRight: true,
              bottomLeft: true,
              topLeft: true,
            }
      }
      lockAspectRatio
      resizeHandleClasses={{
        topLeft: 'print-shape-resize-handle print-shape-resize-handle--tl',
        topRight: 'print-shape-resize-handle print-shape-resize-handle--tr',
        bottomLeft: 'print-shape-resize-handle print-shape-resize-handle--bl',
        bottomRight: 'print-shape-resize-handle print-shape-resize-handle--br',
      }}
      onDragStart={(e) => {
        if (shareViewerReadOnly) return;
        e.stopPropagation?.();
        if (!isSelected) setSelectedPrintElement(shape);
      }}
      onDrag={(e, d) => {
        if (shareViewerReadOnly) return;
        setLivePosition({ x: d.x, y: d.y });
      }}
      onDragStop={(e, d) => {
        if (shareViewerReadOnly) return;
        const next = { x: d.x, y: d.y };
        setLivePosition(next);
        persistBox(next, liveSize);
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
        const nextSize = { width: newW, height: newH };
        setLiveSize(nextSize);
        setLivePosition(pos);
        persistBox(pos, nextSize);
      }}
      style={{ pointerEvents: featurePointerEvents, zIndex: isSelected ? 1100 : 1000 }}
      className={isSelected && !shareViewerReadOnly ? 'print-shape-rnd is-selected' : 'print-shape-rnd'}
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
          cursor: shareViewerReadOnly ? 'default' : isSelected ? 'grab' : 'pointer',
        }}
      >
        {isSelected && !shareViewerReadOnly && <div className="print-shape-selection-ring" />}

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
            className="print-shape-rotate-knob"
            onMouseDown={(e) => {
              e.stopPropagation();
              window.addEventListener('mousemove', handleRotation);
              window.addEventListener(
                'mouseup',
                () => window.removeEventListener('mousemove', handleRotation),
                { once: true }
              );
            }}
          />
        )}

        {isSelected && !shareViewerReadOnly && (
          <button
            type="button"
            className="print-shape-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(shape.id);
            }}
            aria-label="Delete"
          >
            ×
          </button>
        )}
      </div>
    </Rnd>
  );
}
