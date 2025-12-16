import { Rnd } from 'react-rnd';
import React, { useState } from 'react';
import { useMapContext } from '../../pages/MapContext';

export default function ArrowShape({ shape, onChange, onDelete, isPrinting }) {
  const { selectedPrintElement, setSelectedPrintElement } = useMapContext();
  const { id, tail = { x: 100, y: 100 }, head = { x: 200, y: 150 } } = shape;

  const isSelected = selectedPrintElement?.id === id;

  const stroke = shape.stroke || '#000000';
  const strokeWidth = shape.strokeWidth ?? 4;
  const strokeOpacity = shape.strokeOpacity ?? 1;

  const handleClick = (e) => {
    e.stopPropagation();
    setSelectedPrintElement(shape);
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
              border: '2px dashed #1d784f',
              borderRadius: '4px',
              zIndex: 5,
              pointerEvents: 'none',
            }}
          />

          {/* Tail Handle */}
          <Rnd
            size={{ width: 16, height: 16 }}
            position={{ x: tail.x - 8, y: tail.y - 8 }}
            bounds="parent"
            enableResizing={false}
            onDrag={(e, d) => {
              onChange({
                ...shape,
                tail: { x: d.x + 8, y: d.y + 8 },
              });
            }}
            style={{
              backgroundColor: '#1d784f',
              borderRadius: '50%',
              border: '2px solid white',
              cursor: 'grab',
              zIndex: 10,
              pointerEvents: 'auto',
            }}
          />

          {/* Head Handle */}
          <Rnd
            size={{ width: 16, height: 16 }}
            position={{ x: head.x, y: head.y }}
            bounds="parent"
            enableResizing={false}
            onDrag={(e, d) => {
              onChange({
                ...shape,
                head: { x: d.x, y: d.y },
              });
            }}
            style={{
              backgroundColor: '#1d784f',
              borderRadius: '50%',
              border: '2px solid white',
              cursor: 'grab',
              zIndex: 10,
              pointerEvents: 'auto',
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
