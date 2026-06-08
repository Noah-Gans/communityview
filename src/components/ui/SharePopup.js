import React from 'react';
import './SharePopup.css'; // Import a separate CSS file for styling

const SharePopup = ({ onClose }) => {
  
  // Function to copy the URL to the clipboard
  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url)
      .then(() => alert('Link copied to clipboard!'))
      .catch(err => console.error('Failed to copy: ', err));
  };

  // Function to trigger native sharing
  const handleShareClick = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Teton County GIS',
        text: 'Check out this amazing spatial data platform: Teton County GIS!',
        url: window.location.href,
      })
        .then(() => console.log('Share successful!'))
        .catch((error) => console.log('Sharing failed:', error));
    } else {
      alert('Your browser does not support sharing. Please use the "Copy Link" feature.');
    }
  };

  return (
    <div className="share-popup-overlay">
      <div className="share-popup-container">
        <button className="close-button" onClick={onClose}>
          X
        </button>
        <h2>Share This Page</h2>
        <div className="share-options">
          <button className="share-option-button" onClick={handleCopyLink}>
            Copy Link
          </button>
          <button className="share-option-button" onClick={handleShareClick}>
            Share via App
          </button>
        </div>
      </div>
    </div>
  );
};

export default SharePopup;
