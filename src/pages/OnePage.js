import React from 'react';
import './OnePage.css';

const OnePage = () => {
  // Files in public folder are served from root
  const contourLinesPath = '/contour-lines.svg';

  const topoFilterStyle = {
    backgroundImage: `url(${contourLinesPath})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    filter: 'brightness(0) saturate(100%) invert(48%) sepia(79%) saturate(200%) hue-rotate(86deg) brightness(118%) contrast(80%)',
    opacity: 0.6,
    maskImage: 'linear-gradient(to bottom, transparent 0%, black 50%, black 85%, transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 50%, black 85%, transparent 100%)',
  };

  return (
    <div className="onepage-container">
      <div className="onepage-document">
        <div className="onepage-topo-overlay" style={topoFilterStyle}></div>
      </div>
    </div>
  );
};

export default OnePage;

