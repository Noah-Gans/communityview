import React, { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseConfig';
import './ManageSubscription.css';

const ManageSubscription = () => {
  const { user: userFromContext, subscriptionStatus } = useUser();
  const navigate = useNavigate();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Use user from context
  const user = userFromContext;

  const handleChangePlan = () => {
    navigate('/signup');
  };

  const handleCancelSubscription = async () => {
    setLoading(true);
    try {
      // Get user from context or auth
      const currentUser = user || auth.currentUser;
      
      if (!currentUser || !currentUser.uid) {
        alert("User not found. Please try logging in again.");
        setShowCancelConfirm(false);
        return;
      }

      const functions = getFunctions();
      const cancelSubscription = httpsCallable(functions, "cancelSubscription");
      await cancelSubscription({});
      
      // Update local subscription status in Firestore
      await updateDoc(doc(db, 'users', currentUser.uid), {
        subscriptionStatus: 'canceled',
        updatedAt: new Date()
      });
      
      setShowCancelConfirm(false);
      // Show success message
      alert('Subscription canceled successfully. You\'ll keep access until the end of your billing period.');
    } catch (error) {
      console.error("Failed to cancel subscription:", error);
      alert(`Unable to cancel subscription: ${error.message}`);
      setShowCancelConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePaymentMethod = async () => {
    try {
      const functions = getFunctions();
      const createPortalSession = httpsCallable(functions, "createPortalSession");
      const result = await createPortalSession({});
      const { url } = result.data;
      window.location.href = url;
    } catch (error) {
      console.error("Failed to create portal session:", error);
      alert("Unable to open portal. Please try again later.");
    }
  };

  return (
    <div className="manage-subscription-overlay">
      <div className="subscription-card">
        <h2 className="card-title">Manage Subscription</h2>
        
        {subscriptionStatus === 'none' && (
          <div className="subscription-status-section">
            <div className="status-badge inactive">❌ Not Subscribed</div>
            <p className="status-description">
              You don't have an active subscription. Choose a plan to get started!
            </p>
            <button className="primary-button" onClick={handleChangePlan}>
              Choose Plan
            </button>
          </div>
        )}

        {(subscriptionStatus === 'plus' || subscriptionStatus === 'regular' || subscriptionStatus === 'active') && (
          <div className="subscription-status-section">
            <div className="status-badge active">✅ Active Subscription</div>
            <p className="status-description">
              Current Plan: <strong>{subscriptionStatus === 'plus' ? 'Plus' : subscriptionStatus === 'regular' ? 'Regular' : 'Active'}</strong>
            </p>
            
            <div className="action-buttons">
              <button className="primary-button" onClick={handleChangePlan}>
                Change Plan
              </button>
              <button className="secondary-button" onClick={handleUpdatePaymentMethod}>
                Update Payment Method
              </button>
              <button 
                className="cancel-button" 
                onClick={() => setShowCancelConfirm(true)}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Cancel Subscription'}
              </button>
            </div>
          </div>
        )}

        <button className="back-button" onClick={() => navigate('/map')}>
          ← Back to Map
        </button>

        {showCancelConfirm && (
          <div className="confirm-overlay">
            <div className="confirm-dialog">
              <h3>Cancel Subscription</h3>
              <p>Are you sure you want to cancel your subscription? You'll lose access to premium features.</p>
              <div className="confirm-buttons">
                <button className="confirm-cancel" onClick={handleCancelSubscription}>
                  Yes, Cancel
                </button>
                <button className="confirm-keep" onClick={() => setShowCancelConfirm(false)}>
                  Keep Subscription
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageSubscription;
