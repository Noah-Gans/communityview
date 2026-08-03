import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Features.css';
import './styles/marketing-layout.css';
import MarketingLayout from './components/MarketingLayout';
import MarketingFooter from './components/MarketingFooter';
import { marketingFeatures, featuresPageHero } from './content/features';
import { finalCta } from './content/messaging';

const Features = () => {
  const navigate = useNavigate();
  const [activeFeature, setActiveFeature] = useState(null);

  useEffect(() => {
    marketingFeatures.forEach((feature) => {
      const img = new Image();
      img.src = feature.img;
    });
  }, []);

  useEffect(() => {
    document.body.style.overflow = activeFeature ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeFeature]);

  const handleFeatureClick = (featureId) => {
    setActiveFeature(activeFeature === featureId ? null : featureId);
  };

  const closeModal = () => setActiveFeature(null);

  const active = marketingFeatures.find((f) => f.id === activeFeature);

  return (
    <MarketingLayout className="features-page">
      <div className="features-hero">
        <div className="features-badge">
          <span>{featuresPageHero.badge}</span>
        </div>
        <h1 className="features-main-title">
          {featuresPageHero.title}{' '}
          <span className="features-highlight-text">{featuresPageHero.highlight}</span>
        </h1>
        <p className="features-subtitle">{featuresPageHero.subtitle}</p>
        <p className="features-seo-links">
          <Link to="/use-cases/find-property-owner">Find a property owner</Link>
          {' · '}
          <Link to="/use-cases/ownership-details">Ownership details</Link>
          {' · '}
          <Link to="/use-cases/parcel-maps">Parcel maps</Link>
          {' · '}
          <Link to="/use-cases">All use cases</Link>
        </p>
      </div>

      <div className="features-content">
        <div className="features-list">
          {marketingFeatures.map((feature, index) => (
            <div
              key={feature.id}
              className="feature-card"
              onClick={() => handleFeatureClick(feature.id)}
              onKeyDown={(e) => e.key === 'Enter' && handleFeatureClick(feature.id)}
              role="button"
              tabIndex={0}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="feature-image-container">
                <img src={feature.img} alt={feature.title} className="feature-image" />
                <div className="feature-overlay">
                  <span className="feature-icon">{feature.icon}</span>
                </div>
              </div>
              <div className="feature-content">
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-short-desc">{feature.shortDesc}</p>
                <div className="expand-indicator">
                  <span>Learn More</span>
                  <span className="arrow">→</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {activeFeature && active && (
        <div className="feature-modal-overlay" onClick={closeModal}>
          <div className="feature-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={closeModal}>
              ×
            </button>
            <div className="modal-content">
              <div className="modal-image-container">
                <img src={active.img} alt={active.title} className="modal-image" />
              </div>
              <div className="modal-text-content">
                <h2 className="modal-title">{active.title}</h2>
                <p className="modal-full-desc">{active.fullDesc}</p>
                <div className="how-it-helps-section">
                  <h4>How it helps you:</h4>
                  <p>{active.howItHelps}</p>
                </div>
                <div className="modal-highlights">
                  <h4>Key Features:</h4>
                  <ul className="modal-highlights-list">
                    {active.highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  className="modal-try-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/signup');
                  }}
                >
                  Get started →
                </button>
                {active.learnMoreTo && (
                  <Link
                    className="modal-learn-more"
                    to={active.learnMoreTo}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {active.learnMoreLabel || 'Learn more'} →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="features-cta">
        <h2 className="cta-title">{finalCta.title}</h2>
        <p className="cta-description">{finalCta.subtitle}</p>
        <button type="button" className="cta-button" onClick={() => navigate('/signup')}>
          Start free trial
          <span className="button-arrow">→</span>
        </button>
      </div>

      <MarketingFooter />
    </MarketingLayout>
  );
};

export default Features;
