import React from 'react';
import { useUser } from '../../contexts/UserContext';
import { Navigate, useLocation } from 'react-router-dom';
import MapLoadingOverlay from '../loading/MapLoadingOverlay';

function ProtectedRoute({ children }) {
  const { user, subscriptionStatus, loading } = useUser();
  const location = useLocation();

  console.log('🔒 ProtectedRoute check:', { user: !!user, subscriptionStatus, loading });

  if (loading) {
    return <MapLoadingOverlay phraseSet="site" className="map-loading-overlay--app-boot" />;
  }

  // If no user or not active subscription, redirect
  const hasActiveSubscription = subscriptionStatus === 'active' || subscriptionStatus === 'plus' || subscriptionStatus === 'regular';
  console.log('🔒 hasActiveSubscription:', hasActiveSubscription);
  
  if (!user || !hasActiveSubscription) {
    const returnTo = `${location.pathname}${location.search}`;
    const loginPath =
      returnTo && returnTo !== '/'
        ? `/login?returnTo=${encodeURIComponent(returnTo)}`
        : '/login';
    console.log('🔒 Redirecting to', loginPath);
    return <Navigate to={loginPath} replace />;
  }

  // Otherwise, render the protected page
  console.log('🔒 Access granted!');
  return children;
}

export default ProtectedRoute;
