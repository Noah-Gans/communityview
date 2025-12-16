import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Pricing.css';
import { useUser } from '../contexts/UserContext';
import { isNativeApp } from '../utils/platformDetection';

const Pricing = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const [isAnnual, setIsAnnual] = useState(true);
  const [currentCardIndex, setCurrentCardIndex] = useState(1); // Start on Plus (middle card)
  const cardsContainerRef = useRef(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const isNative = isNativeApp();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSubscribe = (planType) => {
    if (!user) {
      // Pass the selected plan to signup page via state
      navigate('/signup', { state: { selectedPlan: planType, billingCycle: isAnnual ? 'annual' : 'monthly' } });
      return;
    }

    // If user is signed in, take them to the map
    navigate('/map');
  };

  // Handle swipe gestures
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    
    const distance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0) {
        // Swipe left - go to next card
        setCurrentCardIndex((prev) => Math.min(prev + 1, 2));
      } else {
        // Swipe right - go to previous card
        setCurrentCardIndex((prev) => Math.max(prev - 1, 0));
      }
    }
    
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  // Scroll to current card when index changes
  useEffect(() => {
    if (cardsContainerRef.current) {
      const cardWidth = cardsContainerRef.current.offsetWidth;
      const scrollPosition = currentCardIndex * (cardWidth + 32); // 32px is gap
      cardsContainerRef.current.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
      });
    }
  }, [currentCardIndex]);

  return (
    <div className="pricing-page">
      {/* Hero Section */}
      <div className="pricing-hero">
        <div className="pricing-badge">
          <span>Simple, Transparent Pricing</span>
        </div>
        <h1 className="pricing-main-title">
          Choose Your Plan
        </h1>
        <p className="pricing-subtitle">
          Access professional-grade GIS tools with unparalleled data accuracy
        </p>
        
        {/* Billing Toggle */}
        <div className="billing-toggle">
          <button 
            className={`toggle-option ${!isAnnual ? 'active' : ''}`}
            onClick={() => setIsAnnual(false)}
          >
            Monthly
          </button>
          <button 
            className={`toggle-option ${isAnnual ? 'active' : ''}`}
            onClick={() => setIsAnnual(true)}
          >
            Annual
            <span className="savings-badge">Save 17%</span>
          </button>
        </div>
      </div>

      {/* Pricing Cards - Swipeable Container */}
      <div 
        className={`pricing-cards-container ${isNative || window.innerWidth <= 768 ? 'swipeable' : ''}`}
        ref={cardsContainerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Regular Plan */}
        <div className="pricing-card regular-plan">
          <div className="plan-header">
            <h3 className="plan-name">Regular</h3>
            <div className="plan-price">
              <span className="price-amount">
                ${isAnnual ? '15' : '18'}
              </span>
              <span className="price-period">/month</span>
            </div>
            {isAnnual && (
              <p className="billing-note">Billed annually at $180/year</p>
            )}
            <p className="plan-description">
              Essential GIS tools for everyday use
            </p>
            <p className="trial-notice">
              🎉 Start with a 14-day free trial
            </p>
          </div>
          
          <button 
            className="plan-button secondary"
            onClick={() => handleSubscribe('regular')}
          >
            {user ? 'Go to Map' : 'Sign Up to Subscribe'}
          </button>

          <div className="plan-features">
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Complete ownership data</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>All map layers & data</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Basic parcel search</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Limited report generation</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Limited print maps</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Daily data updates</span>
            </div>
            <div className="feature-item disabled">
              <span className="x-icon">✕</span>
              <span>Search by mailing address</span>
            </div>
            <div className="feature-item disabled">
              <span className="x-icon">✕</span>
              <span>Unlimited reports</span>
            </div>
            <div className="feature-item disabled">
              <span className="x-icon">✕</span>
              <span>Unlimited map making</span>
            </div>
          </div>
        </div>

        {/* Plus Plan */}
        <div className="pricing-card plus-plan featured">
          <div className="plan-header">
            <h3 className="plan-name">Plus</h3>
            <div className="plan-price">
              <span className="price-amount">
                ${isAnnual ? '20' : '24'}
              </span>
              <span className="price-period">/month</span>
            </div>
            {isAnnual && (
              <p className="billing-note">Billed annually at $240/year</p>
            )}
            <p className="plan-description">
              Unlimited access to all professional features
            </p>
            <p className="trial-notice">
              🎉 Start with a 14-day free trial
            </p>
          </div>
          
          <button 
            className="plan-button primary"
            onClick={() => handleSubscribe('plus')}
          >
            {user ? 'Go to Map' : 'Sign Up to Subscribe'}
          </button>

          <div className="plan-features">
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>All Regular features</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Search by mailing address</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Unlimited reports & export</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Unlimited map making</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Advanced search filters</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Professional print builder</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Priority support</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Export in multiple formats</span>
            </div>
          </div>
        </div>

        {/* Enterprise Plan */}
        <div className="pricing-card enterprise-plan">
          <div className="plan-header">
            <h3 className="plan-name">Enterprise</h3>
            <div className="plan-price">
              <span className="price-amount">Custom</span>
            </div>
            <p className="plan-description">
              Tailored solutions for organizations
            </p>
          </div>
          
          <button 
            className="plan-button secondary"
            onClick={() => window.location.href = 'mailto:noahgans@tetoncountygis.com?subject=Enterprise Inquiry'}
          >
            Contact Us
          </button>

          <div className="plan-features">
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>All Plus features</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Custom layer hosting</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Multiple user accounts</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>API access</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Custom analysis services</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Dedicated support</span>
            </div>
            <div className="feature-item">
              <span className="check-icon">✓</span>
              <span>Training & onboarding</span>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="pricing-cta">
        <h2 className="cta-title">Ready to get started?</h2>
        <p className="cta-description">
          Join professionals who trust Community View for accurate, up-to-date GIS data
        </p>
        <button 
          className="cta-button"
          onClick={() => user ? navigate('/map') : navigate('/signup')}
        >
          {user ? 'Go to Map' : 'Sign Up Now'}
          <span className="button-arrow">→</span>
        </button>
      </div>

      {/* Footer */}
      <footer className="intro-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="footer-logo-container">
              <img src="/logo.png" alt="Community View Logo" className="footer-logo-image" />
            </div>
            <p>Spatial GIS Solutions</p>
          </div>
          <div className="footer-links">
            <button className="footer-button" onClick={() => navigate('/pricing')}>Pricing</button>
            <button className="footer-button" onClick={() => navigate('/faq')}>FAQ</button>
            {!isMobile && (
              <button className="footer-button" onClick={() => navigate('/updates')}>Updates</button>
            )}
            <button className="footer-button" onClick={() => navigate('/features')}>Features</button>
            <a className="footer-button" href="mailto:noahgans@tetoncountygis.com" target="_blank" rel="noopener noreferrer">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Pricing;

