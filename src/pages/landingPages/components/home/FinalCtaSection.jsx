import React from 'react';
import { useNavigate } from 'react-router-dom';
import { finalCta } from '../../content/messaging';
import './HomeSections.css';

export default function FinalCtaSection({ onStartClick, setActiveTab }) {
  const navigate = useNavigate();

  const handleExplore = () => {
    onStartClick?.();
    setActiveTab?.('map');
    navigate('/map');
  };

  return (
    <section className="marketing-section final-cta-section">
      <h2 className="marketing-section-title">{finalCta.title}</h2>
      <p className="marketing-section-subtitle">{finalCta.subtitle}</p>
      <div className="final-cta-buttons">
        <button type="button" className="cta-button" onClick={() => navigate('/signup')}>
          Start free trial
          <span aria-hidden="true">→</span>
        </button>
        <button type="button" className="cta-button cta-button--secondary" onClick={handleExplore}>
          Explore the platform
          <span aria-hidden="true">→</span>
        </button>
        <button type="button" className="cta-button cta-button--secondary" onClick={() => navigate('/pricing')}>
          View pricing
        </button>
      </div>
    </section>
  );
}
