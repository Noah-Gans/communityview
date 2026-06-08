import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { db, auth } from '../../firebase/firebaseConfig';
import { useUser } from '../../contexts/UserContext';
import {
  stripePromise,
  stripeElementsAppearanceLight,
} from '../../config/stripe';

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const statusLabel = (status) => {
  const labels = {
    active: 'Active',
    trialing: 'Free trial',
    canceled: 'Canceled',
    past_due: 'Past due',
    unpaid: 'Unpaid',
    none: 'Not subscribed',
  };
  return labels[status] || status || '—';
};

const stripeReturnUrl = () =>
  `${window.location.origin}/map?accountSection=subscription`;

const PaymentMethodForm = ({ onSuccess, onError, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [ready, setReady] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) {
      onError('Payment form is still loading. Please wait.');
      return;
    }
    setProcessing(true);
    try {
      const { error } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: stripeReturnUrl() },
        redirect: 'if_required',
      });
      if (error) {
        onError(error.message);
      } else {
        onSuccess();
      }
    } catch (err) {
      onError(err.message || 'Could not update payment method.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form className="account-settings-payment-form" onSubmit={handleSubmit}>
      <PaymentElement onReady={() => setReady(true)} options={{ layout: 'tabs' }} />
      <div className="account-settings-actions-stack account-settings-actions-stack--compact">
        <button
          type="submit"
          className="account-settings-btn account-settings-btn--primary account-settings-btn--inline"
          disabled={!stripe || !ready || processing}
        >
          {processing ? 'Saving…' : 'Save payment method'}
        </button>
        <button
          type="button"
          className="account-settings-btn account-settings-btn--secondary account-settings-btn--inline"
          onClick={onCancel}
          disabled={processing}
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

const AccountSubscriptionSettings = ({
  details,
  detailsLoading,
  detailsError,
  onReload,
}) => {
  const navigate = useNavigate();
  const { user, subscriptionStatus } = useUser();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [setupClientSecret, setSetupClientSecret] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const hasActiveSubscription =
    subscriptionStatus === 'active' ||
    subscriptionStatus === 'plus' ||
    subscriptionStatus === 'regular';

  const stripeInfo = details?.stripe;
  const tier =
    stripeInfo?.tier ||
    details?.firestorePlan?.tier ||
    (subscriptionStatus === 'plus' || subscriptionStatus === 'active'
      ? 'Plus'
      : subscriptionStatus === 'regular'
        ? 'Regular'
        : null);
  const interval = stripeInfo?.interval || details?.firestorePlan?.interval || null;
  const amountDisplay =
    stripeInfo?.amountDisplay || details?.firestorePlan?.amountDisplay || null;
  const displayStatus = stripeInfo?.status || subscriptionStatus;
  const pm = stripeInfo?.paymentMethod;

  const billingSuffix =
    interval === 'Annual' && amountDisplay
      ? ' / year'
      : interval === 'Monthly' && amountDisplay
        ? ' / month'
        : '';

  const handleChangePlan = () => navigate('/signup');

  const handleCancelSubscription = async () => {
    setCancelLoading(true);
    setActionMessage('');
    try {
      const currentUser = user || auth.currentUser;
      if (!currentUser?.uid) {
        setActionMessage('User not found. Please try logging in again.');
        setShowCancelConfirm(false);
        return;
      }

      const functions = getFunctions();
      const cancelSubscription = httpsCallable(functions, 'cancelSubscription');
      await cancelSubscription({});

      await updateDoc(doc(db, 'users', currentUser.uid), {
        subscriptionStatus: 'canceled',
        updatedAt: new Date(),
      });

      setShowCancelConfirm(false);
      setActionMessage(
        "Subscription canceled. You'll keep access until the end of your billing period."
      );
      onReload();
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      setActionMessage(`Unable to cancel subscription: ${error.message}`);
      setShowCancelConfirm(false);
    } finally {
      setCancelLoading(false);
    }
  };

  const handleUpdatePaymentMethod = async () => {
    setPaymentError('');
    setPaymentSuccess('');
    setPaymentLoading(true);
    try {
      const functions = getFunctions();
      const createSetupIntent = httpsCallable(functions, 'createSetupIntent');
      const result = await createSetupIntent({});
      const { clientSecret } = result.data;
      if (!clientSecret) {
        throw new Error('Invalid payment session received.');
      }
      setSetupClientSecret(clientSecret);
      setShowPaymentForm(true);
    } catch (error) {
      console.error('Failed to start payment update:', error);
      const message =
        error.code === 'functions/failed-precondition'
          ? 'No billing profile found yet. Subscribe to a plan first, or contact support.'
          : error.message || 'Unable to update payment method. Please try again.';
      setPaymentError(message);
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePaymentSuccess = () => {
    setShowPaymentForm(false);
    setSetupClientSecret('');
    setPaymentSuccess('Payment method updated successfully.');
    onReload();
  };

  const renderDetailsGrid = () => {
    if (detailsLoading) {
      return <p className="account-settings-muted">Loading subscription details…</p>;
    }
    if (detailsError) {
      return (
        <p className="account-settings-feedback error">{detailsError}</p>
      );
    }

    return (
      <div className="account-settings-info-grid account-settings-info-grid--subscription">
        <div className="account-settings-info-row">
          <span>Plan</span>
          <span>{tier || '—'}</span>
        </div>
        <div className="account-settings-info-row">
          <span>Billing</span>
          <span>
            {interval ? `${interval} billing` : '—'}
            {amountDisplay ? ` · ${amountDisplay}${billingSuffix}` : ''}
          </span>
        </div>
        <div className="account-settings-info-row">
          <span>Status</span>
          <span
            className={`account-settings-status-pill account-settings-status-pill--${displayStatus}`}
          >
            {statusLabel(displayStatus)}
            {stripeInfo?.cancelAtPeriodEnd ? ' (ends at period end)' : ''}
          </span>
        </div>
        {stripeInfo?.trialEnd && (
          <div className="account-settings-info-row">
            <span>Trial ends</span>
            <span>{formatDate(stripeInfo.trialEnd)}</span>
          </div>
        )}
        {stripeInfo?.currentPeriodEnd && (
          <div className="account-settings-info-row">
            <span>Next billing</span>
            <span>{formatDate(stripeInfo.currentPeriodEnd)}</span>
          </div>
        )}
        <div className="account-settings-info-row">
          <span>Payment method</span>
          <span>
            {pm
              ? `${pm.brand?.toUpperCase() || 'Card'} •••• ${pm.last4} (exp ${pm.expMonth}/${pm.expYear})`
              : details?.hasStripeCustomer
                ? 'No card on file'
                : 'Added at checkout'}
          </span>
        </div>
        <div className="account-settings-info-row">
          <span>Account email</span>
          <span>{details?.email || user?.email || '—'}</span>
        </div>
      </div>
    );
  };

  const renderFeedback = () => (
    <>
      {paymentSuccess && (
        <p className="account-settings-feedback success">{paymentSuccess}</p>
      )}
      {actionMessage && (
        <p
          className={`account-settings-feedback ${
            actionMessage.includes('canceled') ? 'success' : 'error'
          }`}
        >
          {actionMessage}
        </p>
      )}
    </>
  );

  if (subscriptionStatus === 'none') {
    return (
      <div className="account-settings-subscription-panel">
        <span className="account-settings-badge inactive">Not subscribed</span>
        <p className="account-settings-lead account-settings-lead--tight">
          You don&apos;t have an active subscription. Choose a plan to get started.
        </p>
        {renderFeedback()}
        <button
          type="button"
          className="account-settings-btn account-settings-btn--primary account-settings-btn--inline"
          onClick={handleChangePlan}
        >
          Choose a plan
        </button>
      </div>
    );
  }

  if (subscriptionStatus === 'canceled') {
    return (
      <div className="account-settings-subscription-panel">
        <span className="account-settings-badge inactive">Canceled</span>
        <p className="account-settings-lead account-settings-lead--tight">
          Your subscription is canceled. Resubscribe to restore access.
        </p>
        {renderFeedback()}
        {renderDetailsGrid()}
        <button
          type="button"
          className="account-settings-btn account-settings-btn--primary account-settings-btn--inline"
          onClick={handleChangePlan}
        >
          Resubscribe
        </button>
      </div>
    );
  }

  if (!hasActiveSubscription) {
    return null;
  }

  return (
    <div className="account-settings-subscription-panel">
      <span className="account-settings-badge active">Active subscription</span>
      <p className="account-settings-lead account-settings-lead--tight">
        You&apos;re on the <strong>{tier}</strong> plan
        {interval ? ` (${interval.toLowerCase()})` : ''}.
      </p>

      {renderFeedback()}
      {renderDetailsGrid()}

      {paymentError && (
        <p className="account-settings-feedback error">{paymentError}</p>
      )}

      {showPaymentForm && setupClientSecret && (
        <div className="account-settings-payment-panel">
          <h3 className="account-settings-payment-title">Update payment method</h3>
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret: setupClientSecret,
              appearance: stripeElementsAppearanceLight,
              loader: 'auto',
            }}
          >
            <PaymentMethodForm
              onSuccess={handlePaymentSuccess}
              onError={setPaymentError}
              onCancel={() => {
                setShowPaymentForm(false);
                setSetupClientSecret('');
                setPaymentError('');
              }}
            />
          </Elements>
        </div>
      )}

      <div className="account-settings-actions-stack">
        <button
          type="button"
          className="account-settings-btn account-settings-btn--primary account-settings-btn--inline"
          onClick={handleChangePlan}
        >
          Change plan
        </button>
        {!showPaymentForm && (
          <button
            type="button"
            className="account-settings-btn account-settings-btn--secondary account-settings-btn--inline"
            onClick={handleUpdatePaymentMethod}
            disabled={paymentLoading}
          >
            {paymentLoading ? 'Loading…' : 'Update payment method'}
          </button>
        )}
        <button
          type="button"
          className="account-settings-btn account-settings-btn--danger account-settings-btn--inline"
          onClick={() => setShowCancelConfirm(true)}
          disabled={cancelLoading}
        >
          {cancelLoading ? 'Processing…' : 'Cancel subscription'}
        </button>
      </div>

      {showCancelConfirm && (
        <div
          className="account-settings-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-cancel-subscription-title"
        >
          <div className="account-settings-confirm-dialog">
            <h3 id="account-cancel-subscription-title">Cancel subscription</h3>
            <p>
              Are you sure you want to cancel? You&apos;ll lose access to premium
              features when your current period ends.
            </p>
            <div className="account-settings-confirm-actions">
              <button
                type="button"
                className="account-settings-btn account-settings-btn--danger account-settings-btn--inline"
                onClick={handleCancelSubscription}
                disabled={cancelLoading}
              >
                Yes, cancel
              </button>
              <button
                type="button"
                className="account-settings-btn account-settings-btn--primary account-settings-btn--inline"
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelLoading}
              >
                Keep subscription
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountSubscriptionSettings;
