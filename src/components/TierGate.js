import React from 'react';
import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import './FeatureGate.css';

/**
 * TierGate - Blocks access to Plus-only features for Regular users
 * Use this to completely restrict routes or features to Plus users only
 */
const TierGate = ({ children, requiredTier = 'plus' }) => {
  const { subscriptionStatus, loading } = useUser();
  const navigate = useNavigate();

  if (loading) {
    return <div>Loading...</div>;
  }

  // Check if user has required tier
  const hasAccess = 
    subscriptionStatus === 'active' || // Legacy users have all access
    subscriptionStatus === 'plus' || 
    (requiredTier === 'regular' && subscriptionStatus === 'regular');

  if (!hasAccess) {
    return (
      <div className="feature-gate-overlay">
        <div className="feature-gate-content">
          <div className="feature-gate-icon">🔒</div>
          <h3>Plus Feature Required</h3>
          <p>Upgrade to Plus to access this feature.</p>
          <div className="feature-gate-buttons">
            <button 
              className="feature-gate-upgrade"
              onClick={() => navigate('/pricing')}
            >
              Upgrade to Plus
            </button>
            <button 
              className="feature-gate-cancel"
              onClick={() => navigate('/map')}
            >
              Back to Map
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default TierGate;
