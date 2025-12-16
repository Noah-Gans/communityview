import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import './SignupSuccess.css';

const SignupSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, subscriptionStatus } = useUser();
  const [countdown, setCountdown] = useState(5);
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    // Start countdown
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/map');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="signup-success-page">
      <div className="success-content">
        <div className="success-icon">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="38" stroke="#10b981" strokeWidth="4"/>
            <path d="M25 40L35 50L55 30" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        
        <h1 className="success-title">Payment Successful!</h1>
        <p className="success-subtitle">
          Welcome to Community View! Your subscription is now active.
        </p>

        {user && (
          <div className="user-info">
            <p>Logged in as: <strong>{user.email}</strong></p>
            <p>Subscription Status: <strong className="status-active">{subscriptionStatus || 'Active'}</strong></p>
          </div>
        )}

        <div className="success-details">
          <div className="detail-item">
            <span className="detail-icon">✓</span>
            <span>14-day free trial started</span>
          </div>
          <div className="detail-item">
            <span className="detail-icon">✓</span>
            <span>Full access to all features</span>
          </div>
          <div className="detail-item">
            <span className="detail-icon">✓</span>
            <span>Daily data updates</span>
          </div>
        </div>

        <div className="redirect-info">
          <p>Redirecting to map in <strong>{countdown}</strong> seconds...</p>
        </div>

        <button 
          className="go-to-map-btn"
          onClick={() => navigate('/map')}
        >
          Go to Map Now
          <span className="btn-arrow">→</span>
        </button>

        {!user && (
          <div className="create-account-prompt">
            <p>💡 Want to save your settings and manage your subscription?</p>
            <button 
              className="create-account-link-btn"
              onClick={() => navigate('/create-account')}
            >
              Create Your Account
            </button>
          </div>
        )}

        <a href="/" className="back-to-home">
          Back to Home
        </a>

        {sessionId && (
          <p className="session-info">Session ID: {sessionId}</p>
        )}
      </div>
    </div>
  );
};

export default SignupSuccess;

