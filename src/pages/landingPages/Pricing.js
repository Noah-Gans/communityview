import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Pricing.css';
import './styles/marketing-layout.css';
import { useUser } from '../../contexts/UserContext';
import { hasActiveSubscription } from '../../utils/subscriptionAccess';
import { isNativeApp } from '../../utils/platformDetection';
import { useIsMobile } from './hooks/useMarketing';
import MarketingLayout from './components/MarketingLayout';
import MarketingFooter from './components/MarketingFooter';
import { pricingPlans, pricingHero } from './content/pricingPlans';

const Pricing = () => {
  const navigate = useNavigate();
  const { user, subscriptionStatus } = useUser();
  const [isAnnual, setIsAnnual] = useState(true);
  const [currentCardIndex, setCurrentCardIndex] = useState(1);
  const cardsContainerRef = useRef(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const isNative = isNativeApp();
  const isMobile = useIsMobile();

  const handleSubscribe = (plan) => {
    if (plan.contact) {
      window.location.href = 'mailto:noahgans@communityview.ai?subject=Enterprise Inquiry';
      return;
    }
    if (!user) {
      navigate('/signup', {
        state: { selectedPlan: plan.id, billingCycle: isAnnual ? 'annual' : 'monthly' },
      });
      return;
    }
    if (hasActiveSubscription(subscriptionStatus)) {
      navigate('/map');
      return;
    }
    navigate('/signup', {
      state: { selectedPlan: plan.id, billingCycle: isAnnual ? 'annual' : 'monthly' },
    });
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (Math.abs(distance) > 50) {
      setCurrentCardIndex((prev) =>
        distance > 0 ? Math.min(prev + 1, pricingPlans.length - 1) : Math.max(prev - 1, 0)
      );
    }
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  useEffect(() => {
    if (!cardsContainerRef.current) return;
    const card = cardsContainerRef.current.children[currentCardIndex];
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [currentCardIndex]);

  const swipeable = isNative || isMobile;

  return (
    <MarketingLayout className="pricing-page">
      <div className="pricing-hero">
        <div className="pricing-badge">
          <span>{pricingHero.badge}</span>
        </div>
        <h1 className="pricing-main-title">{pricingHero.title}</h1>
        <p className="pricing-subtitle">{pricingHero.subtitle}</p>
        <div className="billing-toggle">
          <button
            type="button"
            className={`toggle-option ${!isAnnual ? 'active' : ''}`}
            onClick={() => setIsAnnual(false)}
          >
            Monthly
          </button>
          <button
            type="button"
            className={`toggle-option ${isAnnual ? 'active' : ''}`}
            onClick={() => setIsAnnual(true)}
          >
            Annual
            <span className="savings-badge">Save 17%</span>
          </button>
        </div>
      </div>

      <div
        className={`pricing-cards-container${swipeable ? ' swipeable' : ''}`}
        ref={cardsContainerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {pricingPlans.map((plan) => (
          <div
            key={plan.id}
            className={`pricing-card ${plan.id}-plan${plan.featured ? ' featured' : ''}`}
          >
            <div className="plan-header">
              <h3 className="plan-name">{plan.name}</h3>
              <div className="plan-price">
                {plan.customPrice ? (
                  <span className="price-amount">Custom</span>
                ) : (
                  <>
                    <span className="price-amount">
                      ${isAnnual ? plan.annualMonthlyPrice : plan.monthlyPrice}
                    </span>
                    <span className="price-period">/month</span>
                  </>
                )}
              </div>
              {!plan.customPrice && isAnnual && (
                <p className="billing-note">Billed annually at ${plan.annualTotal}/year</p>
              )}
              <p className="plan-description">{plan.description}</p>
              {plan.trial && <p className="trial-notice">🎉 {plan.trial}</p>}
            </div>

            <button
              type="button"
              className={`plan-button ${plan.ctaVariant}`}
              onClick={() => handleSubscribe(plan)}
            >
              {plan.contact ? 'Contact Us' : user ? 'Go to Map' : 'Sign Up to Subscribe'}
            </button>

            <div className="plan-features">
              {plan.features.map((feature) => (
                <div
                  key={feature.text}
                  className={`feature-item${feature.included ? '' : ' disabled'}`}
                >
                  <span className={feature.included ? 'check-icon' : 'x-icon'}>
                    {feature.included ? '✓' : '✕'}
                  </span>
                  <span>{feature.text}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="pricing-cta">
        <h2 className="cta-title">Ready to get started?</h2>
        <p className="cta-description">
          Join agents who use Community View for maps and property tours
        </p>
        <button
          type="button"
          className="cta-button"
          onClick={() => {
            if (user && hasActiveSubscription(subscriptionStatus)) {
              navigate('/map');
            } else {
              navigate('/signup');
            }
          }}
        >
          {user ? 'Go to Map' : 'Sign Up Now'}
          <span className="button-arrow">→</span>
        </button>
      </div>

      <MarketingFooter />
    </MarketingLayout>
  );
};

export default Pricing;
