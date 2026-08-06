import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import MapLoadingOverlay from '../loading/MapLoadingOverlay';
import { useUser } from '../../contexts/UserContext';
import { hasActiveSubscription } from '../../utils/subscriptionAccess';

/**
 * AuthGuard:
 * - Logged-in users opening / → /map immediately (no landing flash)
 * - Logged-in users with stayOnHome state → can view marketing home
 * - Subscribed users on /login → returnTo (or /map)
 */
function AuthGuard({ children }) {
  const { user, subscriptionStatus, loading } = useUser();
  const location = useLocation();

  if (loading) {
    return <MapLoadingOverlay phraseSet="site" className="map-loading-overlay--app-boot" />;
  }

  const stayOnHome = location.state?.stayOnHome === true;

  if (user) {
    if (hasActiveSubscription(subscriptionStatus) && location.pathname === '/login') {
      const params = new URLSearchParams(location.search);
      const raw = String(params.get('returnTo') || '').trim();
      const returnTo =
        raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('://') ? raw : null;
      return <Navigate to={returnTo || '/map'} replace />;
    }

    if (location.pathname === '/' && !stayOnHome) {
      return <Navigate to="/map" replace />;
    }
  }

  return children;
}

export default AuthGuard;
