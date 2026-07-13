import React from 'react';
import '../styles/marketing-layout.css';

export default function MarketingLayout({ children, className = '' }) {
  return (
    <div className={`marketing-page ${className}`.trim()}>
      {children}
    </div>
  );
}
