import React from 'react';
import { useNavigate } from 'react-router-dom';
import { logEvent } from 'firebase/analytics';
import { analytics } from '../../firebase/firebaseConfig';
import { useUser } from '../../contexts/UserContext';
import { heroPeek } from '../../pages/landingPages/content/messaging';
import { researchPropertyDetails, homeResearchStack } from '../../pages/landingPages/content/features';
import { pricingPlans } from '../../pages/landingPages/content/pricingPlans';
import './FreeTierPaywallModal.css';

const REASON_COPY = {
  search: 'Search is a paid feature',
  maps: 'Saving and printing maps is a paid feature',
  'property-details': 'Full property details are a paid feature',
  default: 'This is a paid feature',
};

export default function FreeTierPaywallModal() {
  const { paywallReason, closePaywall } = useUser();
  const navigate = useNavigate();

  if (!paywallReason) return null;

  const regularPlan = pricingPlans[0];
  const showcase = homeResearchStack[0];
  const reasonLabel = REASON_COPY[paywallReason] || REASON_COPY.default;

  const handleUpgrade = () => {
    if (analytics) {
      logEvent(analytics, 'paywall_upgrade_click', {
        reason: paywallReason,
        path: window.location.pathname,
      });
    }
    closePaywall();
    navigate('/signup');
  };

  return (
    <div className="paywall-overlay" onClick={closePaywall}>
      <div className="paywall-content" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="paywall-close"
          aria-label="Close"
          onClick={closePaywall}
        >
          ×
        </button>

        <div className="paywall-body">
          <div className="paywall-text">
            <span className="paywall-reason-tag">{reasonLabel}</span>
            <h2>{heroPeek.title}</h2>
            <p className="paywall-subtitle">{heroPeek.subtitle}</p>

            <ul className="paywall-feature-list">
              {researchPropertyDetails.slice(0, 8).map((item) => (
                <li key={item}>
                  <span aria-hidden="true">✓</span> {item}
                </li>
              ))}
            </ul>

            <div className="paywall-price-row">
              <div>
                <span className="paywall-price">${regularPlan.monthlyPrice}</span>
                <span className="paywall-price-period">/month</span>
              </div>
              <span className="paywall-trial">{regularPlan.trial}</span>
            </div>

            <button type="button" className="paywall-cta" onClick={handleUpgrade}>
              Unlock full access
            </button>
          </div>

          {showcase?.img && (
            <div className="paywall-image-wrap">
              <img src={showcase.img} alt={showcase.title} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
