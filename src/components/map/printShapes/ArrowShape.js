import React, { useRef } from 'react';
import { useMapContext } from '../../../pages/MapContext';

export default function ArrowShape({ shape, onChange, onDelete, isPrinting }) {
  const { selectedPrintElement, setSelectedPrintElement } = useMapContext();
  const { id, tail = { x: 100, y: 100 }, head = { x: 200, y: 150 } } = shape;
  const dragHandleRef = useRef(null);

  const isSelected = selectedPrintElement?.id === id;

  const stroke = shape.stroke || '#000000';
  const strokeWidth = shape.strokeWidth ?? 4;
  const strokeOpacity = shape.strokeOpacity ?? 1;

  const handleClick = (e) => {
    e.stopPropagation();
    setSelectedPrintElement(shape);
  };

  const startHandleDrag = (which, event) => {
    event.stopPropagation();
    event.preventDefault();
    dragHandleRef.current = which;
    const move = (moveEvent) => {
      const nextPoint = { x: moveEvent.clientX, y: moveEvent.clientY };
      if (dragHandleRef.current === 'tail') {
        onChange({ ...shape, tail: nextPoint });
      } else if (dragHandleRef.current === 'head') {
        onChange({ ...shape, head: nextPoint });
      }
    };
    const up = () => {
      dragHandleRef.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // Compute bounding box
  const minX = Math.min(tail.x, head.x) - 10;
  const minY = Math.min(tail.y, head.y) - 10;
  const width = Math.abs(head.x - tail.x) + 20;
  const height = Math.abs(head.y - tail.y) + 20;

  // Dynamic arrowhead
  const rawHeadLength = strokeWidth * 7;
  const arrowHeadLength = Math.min(rawHeadLength, 100);
  const angle = Math.atan2(head.y - tail.y, head.x - tail.x);
  const angleOffset = Math.PI / 6;

  const arrowX = head.x;
  const arrowY = head.y;

  const leftX = arrowX - arrowHeadLength * Math.cos(angle - angleOffset);
  const leftY = arrowY - arrowHeadLength * Math.sin(angle - angleOffset);
  const rightX = arrowX - arrowHeadLength * Math.cos(angle + angleOffset);
  const rightY = arrowY - arrowHeadLength * Math.sin(angle + angleOffset);

  return (
    <>
      {/* Arrow SVG */}
      <svg
        onClick={handleClick}
        title={shape.label || shape.type || "feature"}
        style={{
          position: 'absolute',
          top: minY,
          left: minX,
          width,
          height,
          zIndex: 0,
          pointerEvents: 'auto',
        }}
      >
        <line
          x1={tail.x - minX}
          y1={tail.y - minY}
          x2={head.x - minX }
          y2={head.y - minY }
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeOpacity={strokeOpacity}
        />
        <line
          x1={head.x - minX}
          y1={head.y - minY - 0}
          x2={leftX - minX}
          y2={leftY - minY}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeOpacity={strokeOpacity}
        />
        <line
          x1={head.x - minX}
          y1={head.y - minY - 0}
          x2={rightX - minX}
          y2={rightY - minY}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeOpacity={strokeOpacity}
        />
      </svg>

      {/* Edit Graphics */}
      {isSelected && (
        <>
          {/* Green bounding box */}
          <div
            style={{
              position: 'absolute',
              top: minY,
              left: minX,
              width,
              height,
              border: '3px dashed #22c55e',
              borderRadius: '4px',
              zIndex: 5,
              pointerEvents: 'none',
              boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.25)',
            }}
          />

          {/* Tail Handle */}
          <div
            onMouseDown={(e) => startHandleDrag('tail', e)}
            style={{
              position: 'absolute',
              top: tail.y - 10,
              left: tail.x - 10,
              width: 20,
              height: 20,
              backgroundColor: '#1d784f',
              borderRadius: '50%',
              border: '3px solid #ffffff',
              cursor: 'grab',
              zIndex: 10,
              pointerEvents: 'auto',
              boxShadow: '0 0 0 2px rgba(0,0,0,0.2)',
            }}
          />

          {/* Head Handle */}
          <div
            onMouseDown={(e) => startHandleDrag('head', e)}
            style={{
              position: 'absolute',
              top: head.y - 10,
              left: head.x - 10,
              width: 20,
              height: 20,
              backgroundColor: '#1d784f',
              borderRadius: '50%',
              border: '3px solid #ffffff',
              cursor: 'grab',
              zIndex: 10,
              pointerEvents: 'auto',
              boxShadow: '0 0 0 2px rgba(0,0,0,0.2)',
            }}
          />

          {/* Delete Button */}
          {isPrinting && (
            <div
              style={{
                position: 'absolute',
                top: Math.max(Math.min(tail.y, head.y) - 25, 0),
                left: (tail.x + head.x) / 2 - 10,
                zIndex: 20,
                pointerEvents: 'auto',
              }}
            >
              <button
                onClick={() => onDelete(id)}
                style={{
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
                }}
              >
                X
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
