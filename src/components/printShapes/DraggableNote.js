import React from 'react';
import { Rnd } from 'react-rnd';
import { useMapContext } from '../../pages/MapContext';

export default function DraggableNote({ note, onNoteChange, onDelete }) {
  const { selectedPrintElement, setSelectedPrintElement } = useMapContext();
  const isSelected = selectedPrintElement?.id === note.id;

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
// Ensure minimum border width for print visibility
  const borderWidth = Math.max(note.strokeWidth ?? 2, 2);
  return (
    <Rnd
  bounds="parent"
  position={{ x: note.x, y: note.y }}
  size={{ width: note.width, height: note.height }}
  onClick={(e) => {
    e.stopPropagation();
    console.log('[Note Clicked]', note); // ✅ Log the full note
    setSelectedPrintElement(note);       // ✅ Pass full object
  }}
  
  onDragStop={(e, d) => {
    onNoteChange({ ...note, x: d.x, y: d.y });
  }}
  onResizeStop={(e, dir, ref, delta, position) => {
    onNoteChange({
      ...note,
      x: position.x,
      y: position.y,
      width: parseFloat(ref.style.width),
      height: parseFloat(ref.style.height),
    });
  }}
  dragHandleClassName="drag-handle"
  style={{
    backgroundColor: 'transparent', // ✅ Rnd has no border
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    zIndex: 1000,
  }}
>
{isSelected && (
      <button
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
    style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      background: bgColor,
      boxSizing: 'border-box',
      overflow: 'hidden',
      border: `${borderWidth}px solid ${note.stroke || '#000'}`, // ✅ border lives here
      zIndex: 1,
    }}
  >
    

    <textarea
      value={note.text}
      onChange={e => onNoteChange({ ...note, text: e.target.value })}
      style={{
        width: '100%',
        height: '99.4%', // ✅ avoids white line at bottom
        background: 'transparent',
        resize: 'none',
        border: 'none',
        outline: 'none',
        backgroundClip: 'padding-box',
        padding: 0,
        color: note.fontColor || '#000',
        fontSize: `${note.fontSize || 14}px`,
        fontFamily: note.fontFamily || 'sans-serif',
        textAlign: note.textAlign || 'left',
        whiteSpace: 'pre-wrap',
        lineHeight: '1.4',
        boxSizing: 'border-box',
        caretColor: note.fontColor || '#000',
        pointerEvents: 'auto',
        zIndex: 10,
      }}
    />

    {/* drag handles */}
    <div className="drag-handle" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, cursor: 'move', zIndex: 5 }} />
    <div className="drag-handle" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 6, cursor: 'move', zIndex: 5 }} />
    <div className="drag-handle" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, cursor: 'move', zIndex: 5 }} />
    <div className="drag-handle" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 6, cursor: 'move', zIndex: 5 }} />
  </div>
</Rnd>

  );
}
