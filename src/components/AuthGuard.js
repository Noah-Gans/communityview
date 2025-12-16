import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import './AuthGuard.css';

/**
 * AuthGuard component that:
 * 1. Shows a loading screen while checking auth state
 * 2. Redirects logged-in users to /map if they're on the root path
 * 3. Allows normal navigation once auth state is determined
 */
function AuthGuard({ children }) {
  const { user, subscriptionStatus, loading } = useUser();
  const location = useLocation();

  // Show loading screen while checking auth state
  if (loading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-content">
          <img 
            src="/logo_transparent_no_background.png" 
            alt="Community View Logo" 
            className="auth-loading-logo" 
          />
          <div className="auth-loading-spinner"></div>
          <p className="auth-loading-text">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is logged in with active subscription, redirect away from login/root pages
  const hasActiveSubscription = subscriptionStatus === 'active' || 
                                 subscriptionStatus === 'plus' || 
                                 subscriptionStatus === 'regular';
  
  if (user && hasActiveSubscription) {
    // Redirect to /map if on root or login page
    if (location.pathname === '/' || location.pathname === '/login') {
      return <Navigate to="/map" replace />;
    }
  }

  // Otherwise, render children normally
  return children;
}

export default AuthGuard;

