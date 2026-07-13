import React, { useState, useEffect, useRef } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithCustomToken,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth, db } from "../../firebase/firebaseConfig";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import "./SignUp.css";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useUser } from "../../contexts/UserContext";
import { isNativeApp } from "../../utils/platformDetection";
import { hasActiveSubscription } from "../../utils/subscriptionAccess";
import { navigateToMarketingHome } from "../../utils/marketingNavigation";

// Initialize Stripe - Always use live keys
const STRIPE_PUBLISHABLE_KEY = "pk_live_51QjmlpLhg9Kp46ld9puEgtqaxreaPxS1RmLw5Y9XR2hdgrhorL19mJJl3oV6FNeu8Wn23O8SNS0H0FnoqAlg9l4D00RfBRkhf2"; // LIVE key

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

const TRIAL_DAYS = 14;

function readReactivationTokenFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token")?.trim() || "";
}

function formatAuthError(err) {
  switch (err?.code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Please sign in to continue.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/operation-not-allowed":
      return "Email sign-up is not enabled. Please contact support.";
    default:
      return err?.message || "Something went wrong. Please try again.";
  }
}

function formatTrialEndDate(isoDate) {
  if (!isoDate) return null;
  return new Date(isoDate).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getTrialChargeLabel(selectedPlan, billingCycle, getPricing) {
  const pricing = getPricing(selectedPlan);
  if (billingCycle === "annual") {
    return `${pricing.annualTotal} after your trial`;
  }
  return `${pricing.monthly}/month after your trial`;
}

function getPlanTrialDisplay(planType, billingCycle, getPricing) {
  const pricing = getPricing(planType);
  return {
    afterTrialLabel:
      billingCycle === "annual"
        ? `${pricing.annualTotal} billed annually`
        : `${pricing.monthly}/month`,
    equivalentNote:
      billingCycle === "annual" ? `(${pricing.annual}/mo equivalent)` : null,
  };
}

const PlanTrialPrice = ({ planType, billingCycle, getPricing }) => {
  const { afterTrialLabel, equivalentNote } = getPlanTrialDisplay(
    planType,
    billingCycle,
    getPricing
  );
  return (
    <div className="plan-trial-price">
      <div className="plan-trial-price__today">
        <span className="plan-trial-price__amount">$0</span>
        <span className="plan-trial-price__period">today</span>
      </div>
      <p className="plan-trial-price__duration">{TRIAL_DAYS} days free, full access</p>
      <p className="plan-trial-price__then">
        Then {afterTrialLabel}
        {equivalentNote && <span className="plan-trial-price__equiv"> {equivalentNote}</span>}
      </p>
    </div>
  );
};

// Payment Form Component
const PaymentForm = ({
  intentType,
  trialEnd,
  selectedPlan,
  billingCycle,
  getPricing,
  onSuccess,
  onError,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isElementReady, setIsElementReady] = useState(false);
  const [loadingError, setLoadingError] = useState(null);

  // Set ready when PaymentElement calls onReady
  const handleElementReady = () => {
    console.log("PaymentElement is ready");
    setIsElementReady(true);
    setLoadingError(null);
  };

  // Handle loading errors
  const handleElementError = (error) => {
    console.error("PaymentElement error:", error);
    console.error("PaymentElement error details:", JSON.stringify(error, null, 2));
    
    let errorMessage = error.message || "Failed to load payment form";
    
    // Provide more helpful error messages based on error type
    if (error.type === 'api_error') {
      errorMessage = "Stripe API error. The payment session may have expired. Please go back and select your plan again.";
    } else if (error.type === 'card_error') {
      errorMessage = "Card error: " + (error.message || "Please check your card details.");
    } else if (error.message && (error.message.includes('client_secret') || error.message.includes('Invalid'))) {
      errorMessage = "Invalid payment session. Please go back and select your plan again.";
    } else if (error.message && error.message.includes('400')) {
      errorMessage = "Payment session error. Please go back and select your plan again to create a new payment session.";
    }
    
    setLoadingError(errorMessage);
    onError(errorMessage);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      onError("Stripe is not loaded. Please refresh the page.");
      return;
    }

    if (!isElementReady) {
      onError("Payment form is still loading. Please wait a moment.");
      return;
    }

    setIsProcessing(true);

    try {
      const confirmOptions = {
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/signup-success`,
        },
        redirect: "if_required",
      };

      const { error } =
        intentType === "setup"
          ? await stripe.confirmSetup(confirmOptions)
          : await stripe.confirmPayment(confirmOptions);

      if (error) {
        console.error("Payment failed:", error);
        onError(error.message);
        setIsProcessing(false);
      } else {
        onSuccess();
      }
    } catch (err) {
      console.error("Payment error:", err);
      if (err.message && err.message.includes('mounted Payment Element')) {
        onError("Payment form is still loading. Please wait a moment and try again.");
      } else {
        onError(err.message || "An error occurred during payment. Please try again.");
      }
      setIsProcessing(false);
    }
  };

  // Show loading state if Stripe or Elements aren't ready
  if (!stripe || !elements) {
    return (
      <div className="payment-form-loading">
        <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', textAlign: 'center', marginBottom: '12px' }}>
          Loading payment form...
        </p>
        <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.85rem', textAlign: 'center', maxWidth: '400px', margin: '0 auto' }}>
          If this takes too long, please disable ad blockers or privacy extensions that might be blocking Stripe.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      {loadingError && (
        <div className="signup-error-message" style={{ marginBottom: '16px' }}>
          {loadingError}
        </div>
      )}
      <PaymentElement 
        onReady={handleElementReady}
        onError={handleElementError}
        options={{
          layout: 'tabs'
        }}
      />
      <p className="form-hint" style={{ marginTop: "12px", textAlign: "center" }}>
        {formatTrialEndDate(trialEnd)
          ? `You won't be charged until ${formatTrialEndDate(trialEnd)}. Then ${getTrialChargeLabel(selectedPlan, billingCycle, getPricing)}.`
          : `${TRIAL_DAYS}-day free trial — card required. Cancel anytime before you're charged.`}
      </p>
      <button 
        type="submit" 
        disabled={!stripe || !isElementReady || isProcessing}
        className="signup-primary-btn"
      >
        {isProcessing ? "Processing..." : `Start ${TRIAL_DAYS}-day free trial`}
        <span className="btn-arrow">→</span>
      </button>
      {!isElementReady && !loadingError && (
        <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', marginTop: '12px', textAlign: 'center' }}>
          Loading payment form...
        </p>
      )}
    </form>
  );
};

const Signup = () => {
  const location = useLocation();
  const [step, setStep] = useState(1);            
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [billingCycle, setBillingCycle] = useState("annual"); // 'monthly' or 'annual'
  const [error, setError] = useState("");
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const [intentType, setIntentType] = useState("setup");
  const [trialEnd, setTrialEnd] = useState("");
  const [setupIntentId, setSetupIntentId] = useState("");
  const [loading, setLoading] = useState(false);
  const initialReactivationTokenRef = useRef(readReactivationTokenFromUrl());
  const [reactivationToken, setReactivationToken] = useState(
    () => initialReactivationTokenRef.current
  );
  const [reactivationMode, setReactivationMode] = useState(false);
  const [reactivationValidating, setReactivationValidating] = useState(
    () => !!initialReactivationTokenRef.current
  );
  const reactivationValidatedRef = useRef(false);
  const [currentPlanIndex, setCurrentPlanIndex] = useState(1); // Start on Plus (index 1)
  const plansContainerRef = useRef(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const checkoutLoadKeyRef = useRef("");
  const navigate = useNavigate();
  const functions = getFunctions();
  const createTrialSetup = httpsCallable(functions, "createTrialSetup");
  const startTrialSubscription = httpsCallable(functions, "startTrialSubscription");
  const validateReactivationToken = httpsCallable(functions, "validateReactivationToken");
  const reactivateAccount = httpsCallable(functions, "reactivateAccount");
  const { user, subscriptionStatus } = useUser();

  // Win-back link: /signup?token=... (validate once; keep token in URL until success)
  useEffect(() => {
    const token = initialReactivationTokenRef.current;
    if (!token || reactivationValidatedRef.current) return;

    let cancelled = false;
    setReactivationToken(token);
    setReactivationValidating(true);
    setError("");

    const validateToken = async () => {
      try {
        const result = await validateReactivationToken({ token });
        if (cancelled) return;

        const { email: tokenEmail, firstName: savedFirst, lastName: savedLast } =
          result.data || {};

        reactivationValidatedRef.current = true;
        setReactivationMode(true);
        setEmail(tokenEmail || "");
        if (savedFirst) setFirstName(savedFirst);
        if (savedLast) setLastName(savedLast);
        setStep(1);

        if (typeof window !== "undefined" && window.history.replaceState) {
          window.history.replaceState({}, "", "/signup");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Reactivation token validation failed:", err);
          setError(
            err.message ||
              "This reactivation link is invalid, expired, or already used. Generate a new link and try again."
          );
          setReactivationMode(false);
        }
      } finally {
        if (!cancelled) setReactivationValidating(false);
      }
    };

    validateToken();
    return () => {
      cancelled = true;
    };
  }, []);

  // Logged-in users: subscribed → map; otherwise → plan (never skip win-back step 1)
  useEffect(() => {
    if (!user) return;
    if (reactivationToken || reactivationValidating || reactivationMode) return;

    if (hasActiveSubscription(subscriptionStatus)) {
      navigate("/map", { replace: true });
      return;
    }

    setEmail(user.email || "");
    setStep(2);
  }, [
    user,
    subscriptionStatus,
    navigate,
    reactivationToken,
    reactivationValidating,
    reactivationMode,
  ]);

  // Check if a plan was pre-selected from the Pricing page
  useEffect(() => {
    if (location.state?.selectedPlan) {
      setSelectedPlan(location.state.selectedPlan);
      setBillingCycle(location.state.billingCycle || 'annual');
      // Optionally skip directly to step 2 if coming from pricing
      // setStep(2);
    }
  }, [location.state]);

  // Step 1: Create account (or reactivate via marketing link)
  const handleReactivateAccount = async () => {
    setError("");

    if (!reactivationToken) {
      setError("Missing reactivation link. Please use the link from your email.");
      return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      const result = await reactivateAccount({
        token: reactivationToken,
        password,
        firstName,
        lastName,
      });

      const { customToken } = result.data || {};
      if (!customToken) {
        throw new Error("Could not restore your account. Please try again.");
      }

      await signInWithCustomToken(auth, customToken);
      setReactivationToken("");
      setReactivationMode(false);
      setStep(2);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not reactivate your account. Please try again.");
    }
  };

  const handleCreateAccount = async () => {
    setError("");
    setShowSignInPrompt(false);

    if (reactivationToken && !reactivationMode) {
      if (reactivationValidating) {
        setError("Still verifying your reactivation link. Please wait a moment.");
        return;
      }
      setError(
        "This reactivation link could not be verified. Open the full link from your email (it should include ?token=...) or generate a new one."
      );
      return;
    }

    if (reactivationMode) {
      await handleReactivateAccount();
      return;
    }

    // Validate required fields
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (email.trim() === '') {
      setError("Please enter a valid email address");
      return;
    }

    const normalizedEmail = email.trim();

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );
      const newUser = userCredential.user;
      console.log("Account created:", newUser.email);

      await setDoc(doc(db, "users", newUser.uid), {
        email: normalizedEmail,
        firstName: firstName || "",
        lastName: lastName || "",
        subscriptionStatus: "none",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log("Firestore user document created");
      setStep(2);
    } catch (err) {
      if (err?.code === "auth/email-already-in-use") {
        try {
          const userCredential = await signInWithEmailAndPassword(
            auth,
            normalizedEmail,
            password
          );
          const existingUser = userCredential.user;
          const userDoc = await getDoc(doc(db, "users", existingUser.uid));
          const status = userDoc.exists() ? userDoc.data()?.subscriptionStatus : null;

          if (hasActiveSubscription(status)) {
            navigate("/map", { replace: true });
            return;
          }

          await setDoc(
            doc(db, "users", existingUser.uid),
            {
              email: normalizedEmail,
              firstName: firstName || "",
              lastName: lastName || "",
              updatedAt: new Date(),
            },
            { merge: true }
          );

          setStep(2);
          return;
        } catch (signInErr) {
          console.error(signInErr);
          setError(
            "An account with this email already exists. Use the link in our email to set a new password, or sign in if you remember it."
          );
          setShowSignInPrompt(true);
          return;
        }
      }

      console.error(err);
      setError(formatAuthError(err));
    }
  };

  // Step 2: Select plan (Stripe setup loads on step 3)
  const handleSelectPlan = (planType) => {
    setError("");

    if (!auth.currentUser) {
      setError("Please create your account first");
      setStep(1);
      return;
    }

    setSelectedPlan(planType);
    setClientSecret("");
    setSetupIntentId("");
    setTrialEnd("");
    checkoutLoadKeyRef.current = "";
    setStep(3);
  };

  // Step 3: SetupIntent only — subscription is created after card submit
  useEffect(() => {
    if (step !== 3 || !selectedPlan || !auth.currentUser) return;

    const fullPlanName = `${selectedPlan}-${billingCycle}`;
    const loadKey = `${fullPlanName}`;

    if (checkoutLoadKeyRef.current === loadKey) return;

    let cancelled = false;

    const loadCheckout = async () => {
      setLoading(true);
      setError("");
      setClientSecret("");
      setSetupIntentId("");

      try {
        const result = await createTrialSetup({
          email: email || auth.currentUser.email || "",
          plan: fullPlanName,
          firstName,
          lastName,
        });

        if (cancelled) return;

        const {
          clientSecret: secret,
          setupIntentId: intentId,
          trialEnd: trialEndIso,
        } = result.data;

        if (!secret || typeof secret !== "string" || !secret.includes("_secret_")) {
          setError("Invalid payment session received. Please try again.");
          return;
        }

        checkoutLoadKeyRef.current = loadKey;
        setClientSecret(secret);
        setSetupIntentId(intentId || "");
        setIntentType("setup");
        setTrialEnd(trialEndIso || "");
      } catch (err) {
        if (!cancelled) {
          console.error("Trial setup error:", err);
          const message =
            err?.message ||
            err?.details ||
            (err?.code === "functions/not-found"
              ? "Checkout service is not available. Please try again later."
              : "Failed to prepare checkout");
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadCheckout();
    return () => {
      cancelled = true;
    };
  }, [step, selectedPlan, billingCycle, email, firstName, lastName]);

  // Get pricing based on billing cycle
  const getPricing = (planType) => {
    const prices = {
      regular: {
        monthly: '$18',
        annual: '$15',
        annualTotal: '$180/year'
      },
      plus: {
        monthly: '$24',
        annual: '$20',
        annualTotal: '$240/year'
      }
    };
    return prices[planType];
  };

  const isNative = isNativeApp();

  // Handle swipe gestures for plan selection
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    
    const distance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0) {
        // Swipe left - go to next plan (Plus)
        setCurrentPlanIndex(1);
      } else {
        // Swipe right - go to previous plan (Regular)
        setCurrentPlanIndex(0);
      }
    }
    
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  // Scroll to current plan when index changes
  useEffect(() => {
    if (plansContainerRef.current && step === 2) {
      const cardWidth = plansContainerRef.current.offsetWidth / 2; // Two cards
      const scrollPosition = currentPlanIndex * (cardWidth + 20); // 20px is gap
      plansContainerRef.current.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
      });
    }
  }, [currentPlanIndex, step]);

  return (
    <div className={`signup-page ${step === 1 || (step === 2 && isNative) ? 'no-scroll' : ''}`}>
      {/* Close Button - Hidden on native apps for step 1 and 2 (moved inside card) */}
      {!(isNative && (step === 1 || step === 2)) && (
        <button className={`signup-close-btn ${isNative ? 'native-app' : ''}`} onClick={() => navigateToMarketingHome(navigate)}>
          ✕
        </button>
      )}

      <div className="signup-content">
        {/* Step 1: Create Account */}
        {step === 1 && (
          <div className="signup-card">
            {/* Close Button - Inside card for native apps */}
            {isNative && (
              <button className="signup-close-btn-in-card" onClick={() => navigateToMarketingHome(navigate)}>
                ✕
              </button>
            )}
            
            {/* Progress Indicator - Inside card and moved down */}
            <div className={`progress-indicator ${isNative ? 'native-app' : ''}`}>
              <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>
                <div className="step-number">1</div>
                <span>Account</span>
              </div>
              <div className="progress-line"></div>
              <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>
                <div className="step-number">2</div>
                <span>Plan</span>
              </div>
              <div className="progress-line"></div>
              <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>
                <div className="step-number">3</div>
                <span>Card</span>
              </div>
            </div>
            <h2 className="card-title">
              {reactivationMode ? "Welcome back" : "Get Started"}
            </h2>
            <p className="card-subtitle">
              {reactivationValidating
                ? "Verifying your link…"
                : reactivationMode
                  ? "Set a new password, then pick a plan and restart your free trial"
                  : "Create your account, then pick a plan and start your free trial"}
            </p>

            {reactivationMode && !reactivationValidating && (
              <p className="signup-reactivation-notice">
                You&apos;re reactivating <strong>{email}</strong>. Your saved maps and settings
                will stay on this account.
              </p>
            )}

            {error && (
              <div className="signup-error-message">
                {error}
                {showSignInPrompt && (
                  <p className="signup-error-action">
                    <Link to="/login" state={{ email: email.trim() }}>
                      Sign in with this email
                    </Link>
                  </p>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input
                type="email"
                className="form-input"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => {
                  if (reactivationMode) return;
                  setEmail(e.target.value);
                  setError("");
                  setShowSignInPrompt(false);
                }}
                readOnly={reactivationMode}
                required
              />
              <p className="form-hint">
                {reactivationMode
                  ? "This email is verified from your reactivation link"
                  : "Required for payment and subscription management"}
              </p>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">First Name (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Last Name (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password *</label>
              <input
                type="password"
                className="form-input"
                placeholder={
                  reactivationMode
                    ? "Choose a new password (min. 6 characters)"
                    : "Create a password (min. 6 characters)"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={reactivationValidating}
              />
              <p className="form-hint">
                {reactivationMode
                  ? "This replaces your previous password on your existing account"
                  : "Required for account creation"}
              </p>
            </div>

            <button
              className="signup-primary-btn"
              onClick={handleCreateAccount}
              disabled={reactivationValidating}
            >
              {reactivationMode ? "Continue — choose your plan" : "Create Account & Choose Plan"}
              <span className="btn-arrow">→</span>
            </button>

            {!reactivationMode && (
              <div className="signup-footer-text">
                Already have an account? <a href="/login">Sign In</a>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Plan Selection */}
        {step === 2 && (
          <div className="signup-card plan-selection">
            {/* Close Button - Inside card for native apps */}
            {isNative && (
              <button className="signup-close-btn-in-card" onClick={() => navigateToMarketingHome(navigate)}>
                ✕
              </button>
            )}
            
            {/* Progress Indicator - Inside card like step 1 */}
            <div className={`progress-indicator ${isNative ? 'native-app' : ''}`}>
              <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>
                <div className="step-number">1</div>
                <span>Account</span>
              </div>
              <div className="progress-line"></div>
              <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>
                <div className="step-number">2</div>
                <span>Plan</span>
              </div>
              <div className="progress-line"></div>
              <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>
                <div className="step-number">3</div>
                <span>Card</span>
              </div>
            </div>
            <h2 className="card-title">Start Your {TRIAL_DAYS}-Day Free Trial</h2>
            <p className="card-subtitle">
              Pick a plan below. Try it free — you won't be charged today.
            </p>

            {error && <div className="signup-error-message">{error}</div>}

            {/* Billing Cycle Toggle */}
            <div className="billing-toggle-signup">
              <button 
                className={`toggle-option ${billingCycle === 'monthly' ? 'active' : ''}`}
                onClick={() => setBillingCycle('monthly')}
              >
                Monthly
              </button>
              <button 
                className={`toggle-option ${billingCycle === 'annual' ? 'active' : ''}`}
                onClick={() => setBillingCycle('annual')}
              >
                Annual
                <span className="savings-badge-small">Save 17%</span>
              </button>
            </div>

            <div 
              className={`plans-container ${isNative ? 'swipeable' : ''}`}
              ref={plansContainerRef}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Regular Plan */}
              <div className="plan-card">
                <div className="plan-header">
                  <h3 className="plan-name">Regular</h3>
                  <PlanTrialPrice
                    planType="regular"
                    billingCycle={billingCycle}
                    getPricing={getPricing}
                  />
                </div>
                <ul className="plan-features">
                  <li>✓ Complete ownership data</li>
                  <li>✓ All map layers & data</li>
                  <li>✓ Basic parcel search</li>
                  <li>✓ Limited reports</li>
                  <li>✓ Limited print maps</li>
                  <li>✓ Daily data updates</li>
                  <li>✗ Search by mailing address</li>
                  <li>✗ Unlimited reports</li>
                </ul>
                <button 
                  className="plan-select-btn"
                  onClick={() => handleSelectPlan('regular')}
                  disabled={loading && step === 2}
                >
                  {loading && selectedPlan === 'regular' ? 'Loading...' : `Start ${TRIAL_DAYS}-day trial`}
                </button>
              </div>

              {/* Plus Plan */}
              <div className="plan-card featured">
                <div className="featured-badge">MOST POPULAR</div>
                <div className="plan-header">
                  <h3 className="plan-name">Plus</h3>
                  <PlanTrialPrice
                    planType="plus"
                    billingCycle={billingCycle}
                    getPricing={getPricing}
                  />
                </div>
                <ul className="plan-features">
                  <li>✓ All Regular features</li>
                  <li>✓ Search by mailing address</li>
                  <li>✓ Unlimited reports & export</li>
                  <li>✓ Unlimited map making</li>
                  <li>✓ Advanced search filters</li>
                  <li>✓ Professional print builder</li>
                  <li>✓ Priority support</li>
                  <li>✓ Export in multiple formats</li>
                </ul>
                <button 
                  className="plan-select-btn featured"
                  onClick={() => handleSelectPlan('plus')}
                  disabled={loading && step === 2}
                >
                  {loading && selectedPlan === 'plus' ? 'Loading...' : `Start ${TRIAL_DAYS}-day trial`}
                </button>
              </div>
            </div>

            {!user && (
              <button className="back-btn" onClick={() => setStep(1)}>
                ← Back to Account Info
              </button>
            )}

            <p className="signup-trial-footnote">
              Card required to start your trial. Cancel anytime before day {TRIAL_DAYS + 1} — no charge.
            </p>
          </div>
        )}

        {/* Step 3: Embedded Stripe Checkout */}
        {step === 3 && (
          <div className="signup-card payment-step">
            <h2 className="card-title">Almost There — $0 Today</h2>
            <p className="card-subtitle">
              Add a card to start your {TRIAL_DAYS}-day free trial. You won't be charged now.
            </p>

            <div className="trial-summary-card">
              <div className="trial-summary-card__row">
                <span>Plan</span>
                <strong>{selectedPlan === "regular" ? "Regular" : "Plus"}</strong>
              </div>
              <div className="trial-summary-card__row">
                <span>Due today</span>
                <strong className="trial-summary-card__free">$0.00</strong>
              </div>
              <div className="trial-summary-card__row">
                <span>After {TRIAL_DAYS}-day trial</span>
                <strong>{getTrialChargeLabel(selectedPlan, billingCycle, getPricing)}</strong>
              </div>
              {trialEnd && (
                <div className="trial-summary-card__row trial-summary-card__row--muted">
                  <span>First charge date</span>
                  <strong>{formatTrialEndDate(trialEnd)}</strong>
                </div>
              )}
            </div>

            {error && <div className="signup-error-message">{error}</div>}

            {typeof window !== "undefined" && !window.isSecureContext && (
              <div className="checkout-insecure-notice">
                Card autofill needs a secure connection (HTTPS). Locally, run with{" "}
                <code>HTTPS=true</code> and open <code>https://localhost:3000</code>, or test on{" "}
                <code>communityview.ai</code>. You can still type your card manually.
              </div>
            )}

            <div className="checkout-container">
              {loading ? (
                <div className="checkout-preparing">
                  <div className="checkout-preparing__spinner" aria-hidden="true" />
                  <p className="checkout-preparing__title">Setting up secure checkout…</p>
                  <p className="checkout-preparing__hint">This usually takes a few seconds.</p>
                </div>
              ) : clientSecret ? (
                <Elements 
                  stripe={stripePromise} 
                  options={{ 
                    clientSecret,
                    appearance: {
                      theme: 'night',
                      variables: {
                        colorPrimary: '#006b45',
                        colorBackground: '#191919',
                        colorText: '#ffffff',
                        colorDanger: '#ff6b6b',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "SF Pro Display", sans-serif',
                        spacingUnit: '4px',
                        borderRadius: '12px',
                      }
                    },
                    loader: 'auto'
                  }}
                >
                  <PaymentForm 
                    intentType={intentType}
                    trialEnd={trialEnd}
                    selectedPlan={selectedPlan}
                    billingCycle={billingCycle}
                    getPricing={getPricing}
                    onSuccess={async () => {
                      const fullPlanName = `${selectedPlan}-${billingCycle}`;
                      try {
                        await startTrialSubscription({
                          email,
                          plan: fullPlanName,
                          firstName,
                          lastName,
                          setupIntentId,
                        });
                        navigate("/signup-success");
                      } catch (err) {
                        console.error("Start trial error:", err);
                        setError(err.message || "Failed to start your trial. Please try again.");
                      }
                    }}
                    onError={setError}
                  />
                </Elements>
              ) : (
                <div className="checkout-preparing">
                  <p className="checkout-preparing__hint">Unable to load checkout. Go back and try again.</p>
                </div>
              )}
            </div>

            <button
              className="back-btn"
              disabled={loading}
              onClick={() => {
                checkoutLoadKeyRef.current = "";
                setClientSecret("");
                setSetupIntentId("");
                setTrialEnd("");
                setLoading(false);
                setStep(2);
              }}
            >
              ← Change Plan
            </button>
          </div>
        )}
      </div>

    </div>
  );
};

export default Signup;
