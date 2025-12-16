import React from 'react';
import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import './FeatureGate.css';

const FeatureGate = ({ featureName, children, showUpgradePrompt = true }) => {
  const { hasAccessToFeature, subscriptionStatus } = useUser();
  const navigate = useNavigate();
  const hasAccess = hasAccessToFeature(featureName);

  if (hasAccess) {
    return <>{children}</>;
  }

  if (!showUpgradePrompt) {
    return null;
  }

  const featureDescriptions = {
    'reports': 'Reports & Export',
    'print_maps': 'Map Printing',
    'advanced_search': 'Advanced Search',
    'unlimited_reports': 'Unlimited Reports & Export',
    'unlimited_print': 'Unlimited Map Printing',
    'export_formats': 'Export in Multiple Formats',
    'mailing_address_search': 'Search by Mailing Address',
    'priority_support': 'Priority Support'
  };

  const displayName = featureDescriptions[featureName] || featureName;

  return (
    <div className="feature-gate-overlay">
      <div className="feature-gate-content">
        <div className="feature-gate-icon">🔒</div>
        <h3>{displayName} is a Plus Feature</h3>
        <p>Upgrade to Plus to unlock unlimited reports, advanced search, and more.</p>
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
};

export default FeatureGate;
