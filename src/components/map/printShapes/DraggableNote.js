import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useMapContext } from '../../../pages/MapContext';
import './printShapeChrome.css';

export default function DraggableNote({ note, onNoteChange, onDelete, featurePointerEvents = 'auto' }) {
  const { selectedPrintElement, setSelectedPrintElement, shareViewerReadOnly } = useMapContext();
  const isSelected = selectedPrintElement?.id === note.id;

  const [pos, setPos] = useState({ x: note.x, y: note.y });
  const [size, setSize] = useState({ width: note.width, height: note.height });
  const [isEditing, setIsEditing] = useState(false);

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
  const fillVertically = textVerticalAlign === 'top';

  const scale = note.printZoomScale ?? 1;

  const persistBox = (nextPos, nextSize) => {
    onNoteChange({
      ...note,
      x: nextPos.x,
      y: nextPos.y,
      width: nextSize.width / scale,
      height: nextSize.height / scale,
      screenWidth: nextSize.width,
      screenHeight: nextSize.height,
      printZoomScale: scale,
    });
  };

  return (
    <Rnd
      bounds="parent"
      position={pos}
      size={size}
      minWidth={80}
      minHeight={48}
      disableDragging={!!shareViewerReadOnly || isEditing}
      enableResizing={
        shareViewerReadOnly || !isSelected
          ? false
          : {
              top: true,
              right: true,
              bottom: true,
              left: true,
              topRight: true,
              bottomRight: true,
              bottomLeft: true,
              topLeft: true,
            }
      }
      resizeHandleClasses={{
        topLeft: 'print-shape-resize-handle print-shape-resize-handle--tl',
        topRight: 'print-shape-resize-handle print-shape-resize-handle--tr',
        bottomLeft: 'print-shape-resize-handle print-shape-resize-handle--bl',
        bottomRight: 'print-shape-resize-handle print-shape-resize-handle--br',
        top: 'print-shape-resize-edge print-shape-resize-edge--t',
        right: 'print-shape-resize-edge print-shape-resize-edge--r',
        bottom: 'print-shape-resize-edge print-shape-resize-edge--b',
        left: 'print-shape-resize-edge print-shape-resize-edge--l',
      }}
      dragHandleClassName={isSelected ? 'print-note-move-bar' : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (!shareViewerReadOnly) setSelectedPrintElement(note);
      }}
      onDragStart={(e) => {
        if (shareViewerReadOnly) return;
        e.stopPropagation?.();
        if (!isSelected) setSelectedPrintElement(note);
      }}
      onDrag={(e, d) => setPos({ x: d.x, y: d.y })}
      onDragStop={(e, d) => {
        const next = { x: d.x, y: d.y };
        setPos(next);
        persistBox(next, size);
      }}
      onResize={(e, dir, ref, delta, position) => {
        setSize({
          width: parseFloat(ref.style.width),
          height: parseFloat(ref.style.height),
        });
        setPos({ x: position.x, y: position.y });
      }}
      onResizeStop={(e, dir, ref, delta, position) => {
        const nextSize = {
          width: parseFloat(ref.style.width),
          height: parseFloat(ref.style.height),
        };
        setSize(nextSize);
        setPos({ x: position.x, y: position.y });
        persistBox({ x: position.x, y: position.y }, nextSize);
      }}
      style={{
        backgroundColor: 'transparent',
        boxSizing: 'border-box',
        pointerEvents: featurePointerEvents,
        zIndex: isSelected ? 1100 : 1000,
      }}
      className={isSelected && !shareViewerReadOnly ? 'print-shape-rnd is-selected' : 'print-shape-rnd'}
    >
      {isSelected && !shareViewerReadOnly && <div className="print-shape-selection-ring" />}

      {isSelected && !shareViewerReadOnly && (
        <button
          type="button"
          className="print-shape-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(note.id);
          }}
          aria-label="Delete"
        >
          ×
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
          borderRadius: 6,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent,
          alignItems: 'stretch',
          minHeight: 0,
          padding: 8,
          paddingTop: isSelected && fillVertically ? 26 : 8,
          cursor: shareViewerReadOnly ? 'default' : isSelected ? 'default' : 'pointer',
        }}
      >
        {isSelected && !shareViewerReadOnly && (
          <div className="print-note-move-bar" aria-hidden>
            <span className="print-note-move-dot" />
            <span className="print-note-move-dot" />
            <span className="print-note-move-dot" />
          </div>
        )}

        <textarea
          value={note.text}
          readOnly={shareViewerReadOnly || !isSelected}
          onChange={(e) => onNoteChange({ ...note, text: e.target.value })}
          onFocus={() => {
            if (!shareViewerReadOnly) {
              setSelectedPrintElement(note);
              setIsEditing(true);
            }
          }}
          onBlur={() => setIsEditing(false)}
          style={{
            width: '100%',
            flex: fillVertically ? '1 1 auto' : '0 0 auto',
            height: fillVertically ? '100%' : 'auto',
            maxHeight: '100%',
            minHeight: 0,
            background: 'transparent',
            resize: 'none',
            border: 'none',
            outline: 'none',
            backgroundClip: 'padding-box',
            padding: 0,
            color: note.fontColor || '#111827',
            fontSize: `${note.fontSize || 14}px`,
            fontFamily: note.fontFamily || 'Inter, system-ui, sans-serif',
            textAlign,
            whiteSpace: 'pre-wrap',
            lineHeight: '1.4',
            boxSizing: 'border-box',
            caretColor: note.fontColor || '#111827',
            pointerEvents: shareViewerReadOnly || !isSelected ? 'none' : 'auto',
            zIndex: 10,
            alignSelf: 'stretch',
            overflow: 'auto',
            fieldSizing: fillVertically ? 'fixed' : 'content',
          }}
        />
      </div>
    </Rnd>
  );
}
