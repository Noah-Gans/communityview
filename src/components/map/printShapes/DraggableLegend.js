// DraggableLegend.js — geo-anchored like other print overlays; syncs when map pans/zooms.
import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useMapContext } from '../../../pages/MapContext';

export default function DraggableLegend({
  element,
  children,
  onPositionChange,
  onDelete,
  featurePointerEvents = 'auto',
}) {
  const { selectedPrintElement, setSelectedPrintElement } = useMapContext();
  const id = element?.id;
  const isSelected = selectedPrintElement?.id === id && selectedPrintElement?.type === 'legend';

  const [pos, setPos] = useState({ x: element?.x ?? 20, y: element?.y ?? 20 });
  const [size, setSize] = useState({
    width: element?.screenWidth ?? element?.width ?? 250,
    height: element?.screenHeight ?? element?.height ?? 150,
  });

  useEffect(() => {
    if (!element) return;
    const dw = element.screenWidth ?? element.width ?? 250;
    const dh = element.screenHeight ?? element.height ?? 150;
    setPos({ x: element.x ?? 20, y: element.y ?? 20 });
    setSize({ width: dw, height: dh });
  }, [
    element?.id,
    element?.x,
    element?.y,
    element?.width,
    element?.height,
    element?.screenWidth,
    element?.screenHeight,
  ]);

  return (
    <Rnd
      bounds="parent"
      position={pos}
      size={size}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedPrintElement(element);
      }}
      onDrag={(e, data) => setPos({ x: data.x, y: data.y })}
      onDragStop={(e, data) => {
        const next = { x: data.x, y: data.y };
        setPos(next);
        onPositionChange?.({ ...element, x: next.x, y: next.y });
      }}
      onResize={(e, dir, ref, delta, position) => {
        setSize({
          width: parseFloat(ref.style.width),
          height: parseFloat(ref.style.height),
        });
        setPos({ x: position.x, y: position.y });
      }}
      onResizeStop={(e, dir, ref, delta, position) => {
        const newW = parseFloat(ref.style.width);
        const newH = parseFloat(ref.style.height);
        setSize({ width: newW, height: newH });
        setPos({ x: position.x, y: position.y });
        const s = element.printZoomScale ?? 1;
        onPositionChange?.({
          ...element,
          x: position.x,
          y: position.y,
          width: newW / s,
          height: newH / s,
        });
      }}
      style={{
        background: 'rgba(255,255,255,0.9)',
        border: '1px solid #ccc',
        boxSizing: 'border-box',
        pointerEvents: featurePointerEvents,
        position: 'relative',
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      {isSelected && onDelete && (
        <button
          type="button"
          onClick={() => onDelete(id)}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            background: 'red',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            zIndex: 20,
            width: 20,
            height: 20,
            fontSize: 12,
            lineHeight: '16px',
            padding: 0,
          }}
        >
          X
        </button>
      )}

      <div
        style={{
          width: '100%',
          height: '100%',
          overflow: 'auto',
          padding: '8px',
          boxSizing: 'border-box',
          color: 'black',
        }}
      >
        {children}
      </div>
    </Rnd>
  );
}
