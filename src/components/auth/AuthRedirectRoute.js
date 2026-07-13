import React from 'react';
import { useUser } from '../../contexts/UserContext';
import { Navigate } from 'react-router-dom';
import MapLoadingOverlay from '../loading/MapLoadingOverlay';

/**
 * Component that redirects authenticated users to /map
 * and shows the Intro page for unauthenticated users
 */
function AuthRedirectRoute({ children }) {
  const { user, loading } = useUser();

  if (loading) {
    return <MapLoadingOverlay phraseSet="site" className="map-loading-overlay--app-boot" />;
  }

  // If user is logged in, redirect to map
  if (user) {
    return <Navigate to="/map" replace />;
  }

  // Otherwise, show the Intro page
  return children;
}

export default AuthRedirectRoute;

