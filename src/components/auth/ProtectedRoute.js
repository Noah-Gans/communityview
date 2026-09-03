import React from 'react';
import { useUser } from '../../contexts/UserContext';
import { Navigate, useLocation } from 'react-router-dom';
import MapLoadingOverlay from '../loading/MapLoadingOverlay';
import { hasActiveSubscription } from '../../utils/subscriptionAccess';

function ProtectedRoute({ children }) {
  const { user, subscriptionStatus, loading, sessionTrusted } = useUser();
  const location = useLocation();

  if (loading) {
    return <MapLoadingOverlay phraseSet="site" className="map-loading-overlay--app-boot" />;
  }

  // Paid session already proven in this tab — don't bounce to /login when
  // opening amenity/tour tabs briefly drops Auth or the profile snapshot.
  if (sessionTrusted) {
    return children;
  }

  // User is signed in but the profile snapshot has not arrived yet — don't
  // bounce to /login (opening an amenity/tour tab can also clear this briefly).
  if (user && subscriptionStatus == null) {
    return <MapLoadingOverlay phraseSet="site" className="map-loading-overlay--app-boot" />;
  }

  const subscriptionOk = hasActiveSubscription(subscriptionStatus);

  if (!user || !subscriptionOk) {
    const returnTo = `${location.pathname}${location.search}`;
    const loginPath =
      returnTo && returnTo !== '/'
        ? `/login?returnTo=${encodeURIComponent(returnTo)}`
        : '/login';
    console.log('🔒 Redirecting to', loginPath);
    return <Navigate to={loginPath} replace />;
  }

  console.log('🔒 Access granted!');
  return children;
}

export default ProtectedRoute;
