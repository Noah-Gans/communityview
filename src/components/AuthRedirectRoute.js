import React from 'react';
import { useUser } from '../contexts/UserContext';
import { Navigate } from 'react-router-dom';

/**
 * Component that redirects authenticated users to /map
 * and shows the Intro page for unauthenticated users
 */
function AuthRedirectRoute({ children }) {
  const { user, loading } = useUser();

  // Show loading state while checking auth
  if (loading) {
    return <div>Loading...</div>;
  }

  // If user is logged in, redirect to map
  if (user) {
    return <Navigate to="/map" replace />;
  }

  // Otherwise, show the Intro page
  return children;
}

export default AuthRedirectRoute;

