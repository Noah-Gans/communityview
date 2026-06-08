import React from 'react';
import './spinner.css';  // You can style it in Spinner.css

const Spinner = () => {
  return (
    <div className="spinner">
      <div className="lds-dual-ring"></div>
    </div>
  );
};

export default Spinner;
