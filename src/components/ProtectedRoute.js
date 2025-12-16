import React from 'react';
import { useUser } from '../contexts/UserContext';
import { Navigate } from 'react-router-dom';

function ProtectedRoute({ children }) {
  const { user, subscriptionStatus, loading } = useUser();

  // Debug logging
  console.log('🔒 ProtectedRoute check:', { user: !!user, subscriptionStatus, loading });

  // If still checking Auth or Firestore, show a spinner or blank
  if (loading) {
    return <div>Loading...</div>;
  }

  // If no user or not active subscription, redirect
  const hasActiveSubscription = subscriptionStatus === 'active' || subscriptionStatus === 'plus' || subscriptionStatus === 'regular';
  console.log('🔒 hasActiveSubscription:', hasActiveSubscription);
  
  if (!user || !hasActiveSubscription) {
    console.log('🔒 Redirecting to /login');
    return <Navigate to="/login" replace />;
    // or /login, or a "subscribe" route—your choice
  }

  // Otherwise, render the protected page
  console.log('🔒 Access granted!');
  return children;
}

export default ProtectedRoute;
