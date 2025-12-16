import React from 'react';

export default function CompassElement({ element, onDelete }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: element.y,
        left: element.x,
        zIndex: 1000,
        pointerEvents: 'auto',
        width: 60,
        height: 60,
        background: 'white',
        border: '1px solid black',
        borderRadius: '50%',
        textAlign: 'center',
        fontWeight: 'bold',
        fontSize: '14px',
        lineHeight: '60px',
      }}
    >
      N
      <button
        onClick={() => onDelete(element.id)}
        style={{
          position: 'absolute',
          top: -10,
          right: -10,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'red',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '12px',
        }}
      >
        X
      </button>
    </div>
  );
}
