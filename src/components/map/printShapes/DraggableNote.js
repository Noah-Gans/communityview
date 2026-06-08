import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useMapContext } from '../../../pages/MapContext';
export default function DraggableNote({ note, onNoteChange, onDelete, featurePointerEvents = 'auto' }) {
  const { selectedPrintElement, setSelectedPrintElement } = useMapContext();
  const isSelected = selectedPrintElement?.id === note.id;

  const [pos, setPos] = useState({ x: note.x, y: note.y });
  const [size, setSize] = useState({ width: note.width, height: note.height });

  useEffect(() => {
    const dw = note.screenWidth ?? note.width;
    const dh = note.screenHeight ?? note.height;
    setPos({ x: note.x, y: note.y });
    setSize({ width: dw, height: dh });
  }, [
    note.id,
    note.x,
    note.y,
    note.width,
    note.height,
    note.screenWidth,
    note.screenHeight,
    note.printZoomScale,
  ]);

  function hexToRgba(hex, alpha = 1) {
    const cleanHex = hex.replace(/^#/, '');
    const bigint = parseInt(cleanHex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const bgColor = hexToRgba(note.fill || '#ffffff', note.fillOpacity ?? 1);
  const strokeHex = note.stroke?.replace(/^#/, '') || '000000';
  const strokeAlpha = Math.round((note.strokeOpacity ?? 1) * 255)
    .toString(16)
    .padStart(2, '0');
  const borderColor = `#${strokeHex}${strokeAlpha}`;
  const borderWidth = Math.max(note.strokeWidth ?? 0, 0);

  const textAlign = note.textAlign || 'left';
  const textVerticalAlign = note.textVerticalAlign || 'top';
  const justifyContent =
    textVerticalAlign === 'center' ? 'center' : textVerticalAlign === 'bottom' ? 'flex-end' : 'flex-start';

  return (
    <>
      {isSelected && (
        <div
          style={{
            position: 'absolute',
            top: pos.y - 4,
            left: pos.x - 4,
            width: size.width + 8,
            height: size.height + 8,
            border: '3px dashed #22c55e',
            borderRadius: 6,
            pointerEvents: 'none',
            zIndex: 999,
            boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.25)',
          }}
        />
      )}

      <Rnd
        bounds="parent"
        position={pos}
        size={size}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedPrintElement(note);
        }}
        onDrag={(e, d) => setPos({ x: d.x, y: d.y })}
        onDragStop={(e, d) => {
          onNoteChange({ ...note, x: d.x, y: d.y });
        }}
        onResize={(e, dir, ref, delta, position) => {
          setSize({
            width: parseFloat(ref.style.width),
            height: parseFloat(ref.style.height),
          });
          setPos({ x: position.x, y: position.y });
        }}
        onResizeStop={(e, dir, ref, delta, position) => {
          const s = note.printZoomScale ?? 1;
          onNoteChange({
            ...note,
            x: position.x,
            y: position.y,
            width: parseFloat(ref.style.width) / s,
            height: parseFloat(ref.style.height) / s,
          });
        }}
        dragHandleClassName="drag-handle"
        style={{
          backgroundColor: 'transparent',
          boxSizing: 'border-box',
          pointerEvents: featurePointerEvents,
          zIndex: 1000,
        }}
      >
        {isSelected && (
          <button
            type="button"
            onClick={() => onDelete(note.id)}
            style={{
              position: 'absolute',
              top: -25,
              right: -25,
              background: 'red',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              zIndex: 20,
              width: '20px',
              height: '20px',
              fontSize: '12px',
              lineHeight: '16px',
              padding: 0,
            }}
          >
            X
          </button>
        )}
        <div
          className="print-note-wrapper"
          title={note.label || note.type || 'feature'}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            background: bgColor,
            boxSizing: 'border-box',
            overflow: 'hidden',
            border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : 'none',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent,
            minHeight: 0,
          }}
        >
          <textarea
            value={note.text}
            onChange={(e) => onNoteChange({ ...note, text: e.target.value })}
            style={{
              width: '100%',
              flex: textVerticalAlign === 'top' ? '1 1 auto' : '0 1 auto',
              maxHeight: '100%',
              minHeight: 0,
              background: 'transparent',
              resize: 'none',
              border: 'none',
              outline: 'none',
              backgroundClip: 'padding-box',
              padding: 4,
              color: note.fontColor || '#111827',
              fontSize: `${note.fontSize || 14}px`,
              fontFamily: note.fontFamily || 'Inter, system-ui, sans-serif',
              textAlign,
              whiteSpace: 'pre-wrap',
              lineHeight: '1.4',
              boxSizing: 'border-box',
              caretColor: note.fontColor || '#111827',
              pointerEvents: 'auto',
              zIndex: 10,
              alignSelf: 'stretch',
              overflow: 'auto',
            }}
          />

          <div
            className="drag-handle"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 6,
              cursor: 'move',
              zIndex: 5,
            }}
          />
          <div
            className="drag-handle"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: 6,
              cursor: 'move',
              zIndex: 5,
            }}
          />
          <div
            className="drag-handle"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 6,
              cursor: 'move',
              zIndex: 5,
            }}
          />
          <div
            className="drag-handle"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: 6,
              cursor: 'move',
              zIndex: 5,
            }}
          />
        </div>
      </Rnd>
    </>
  );
}
