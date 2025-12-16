import React, { useState, useEffect, useRef } from "react";
import {
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth, db } from "../firebase/firebaseConfig";
import { doc, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import "./SignUp.css";
import { useNavigate, useLocation } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useUser } from "../contexts/UserContext";
import { isNativeApp } from "../utils/platformDetection";

// Initialize Stripe - Always use live keys
const STRIPE_PUBLISHABLE_KEY = "pk_live_51QjmlpLhg9Kp46ld9puEgtqaxreaPxS1RmLw5Y9XR2hdgrhorL19mJJl3oV6FNeu8Wn23O8SNS0H0FnoqAlg9l4D00RfBRkhf2"; // LIVE key

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// Payment Form Component
const PaymentForm = ({ clientSecret, selectedPlan, billingCycle, getPricing, onSuccess, onError }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isElementReady, setIsElementReady] = useState(false);
  const [loadingError, setLoadingError] = useState(null);

  // Debug: Log stripe and elements state
  useEffect(() => {
    console.log("PaymentForm - Stripe:", stripe ? "loaded" : "not loaded");
    console.log("PaymentForm - Elements:", elements ? "loaded" : "not loaded");
    console.log("PaymentForm - ClientSecret:", clientSecret ? `present (${clientSecret.substring(0, 20)}...)` : "missing");
    
    // Check if Stripe loaded successfully
    if (!stripe) {
      console.warn("⚠️ Stripe is not loaded. This might be due to:");
      console.warn("  1. Ad blocker blocking Stripe domains");
      console.warn("  2. Network connectivity issues");
      console.warn("  3. Invalid Stripe publishable key");
    }
  }, [stripe, elements, clientSecret]);

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
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/signup-success`,
        },
        redirect: 'if_required',
      });

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
      <button 
        type="submit" 
        disabled={!stripe || !isElementReady || isProcessing}
        className="signup-primary-btn"
      >
        {isProcessing ? "Processing..." : `Pay ${getPricing(selectedPlan)[billingCycle]}/month`}
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
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPlanIndex, setCurrentPlanIndex] = useState(1); // Start on Plus (index 1)
  const plansContainerRef = useRef(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const navigate = useNavigate();
  const functions = getFunctions();
  const createCheckoutSession = httpsCallable(functions, "createCheckoutSession");
  const { user } = useUser(); // Check if user is already logged in

  // Check if user is already logged in
  useEffect(() => {
    if (user) {
      // User is logged in, skip to step 2 and set their email
      setEmail(user.email || "");
      setStep(2);
    }
  }, [user]);

  // Check if a plan was pre-selected from the Pricing page
  useEffect(() => {
    if (location.state?.selectedPlan) {
      setSelectedPlan(location.state.selectedPlan);
      setBillingCycle(location.state.billingCycle || 'annual');
      // Optionally skip directly to step 2 if coming from pricing
      // setStep(2);
    }
  }, [location.state]);

  // Step 1: Create account with user info
  const handleCreateAccount = async () => {
    setError("");

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

    try {
      // Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log("Account created:", user.email);
      
      // Create initial Firestore user document
      await setDoc(doc(db, "users", user.uid), {
        email: email,
        firstName: firstName || "",
        lastName: lastName || "",
        subscriptionStatus: "none",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      console.log("Firestore user document created");
      
      // Move to Step 2 (plan selection)
      setStep(2);
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  // Step 2: Select plan and go to step 3 (payment)
  const handleSelectPlan = async (planType) => {
    setError("");
    
    // Ensure user is authenticated before proceeding
    if (!auth.currentUser) {
      setError("Please create your account first");
      setStep(1);
      setLoading(false);
      return;
    }

    setSelectedPlan(planType);
    setLoading(true);
    
    // Construct the full plan name with billing cycle
    const fullPlanName = `${planType}-${billingCycle}`;
    
            try {
              const result = await createCheckoutSession({
                email: email,
                userId: auth.currentUser.uid, // Always send the actual Firebase User ID
                plan: fullPlanName,
                firstName: firstName,
                lastName: lastName,
              });
              
              const { clientSecret } = result.data;
              console.log("Client secret from Firebase:", clientSecret);
              console.log("Client secret type:", typeof clientSecret);
              
              // Validate clientSecret format
              if (!clientSecret || typeof clientSecret !== 'string') {
                console.error("Invalid clientSecret format:", clientSecret);
                setError("Invalid payment session received. Please try selecting your plan again.");
                setLoading(false);
                return;
              }
              
              // Check if it's a valid PaymentIntent client secret
              if (!clientSecret.startsWith('pi_') && !clientSecret.includes('_secret_')) {
                console.error("Invalid clientSecret format - should start with 'pi_' and contain '_secret_':", clientSecret);
                setError("Invalid payment session format. Please try selecting your plan again.");
                setLoading(false);
                return;
              }
              
              // Extract PaymentIntent ID to verify it matches the publishable key
              const paymentIntentId = clientSecret.split('_secret_')[0];
              console.log("PaymentIntent ID:", paymentIntentId);
              console.log("Using publishable key:", STRIPE_PUBLISHABLE_KEY.substring(0, 20) + "...");
              
              setClientSecret(clientSecret);
              setStep(3); // Move to payment step
              setLoading(false);
            } catch (err) {
              console.error("Checkout session error:", err);
              setError(err.message || "Failed to create checkout session");
              setLoading(false);
            }
  };

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
        <button className={`signup-close-btn ${isNative ? 'native-app' : ''}`} onClick={() => navigate('/')}>
          ✕
        </button>
      )}

      <div className="signup-content">
        {/* Step 1: Create Account */}
        {step === 1 && (
          <div className="signup-card">
            {/* Close Button - Inside card for native apps */}
            {isNative && (
              <button className="signup-close-btn-in-card" onClick={() => navigate('/')}>
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
                <span>Payment</span>
              </div>
            </div>
            <h2 className="card-title">Get Started</h2>
            <p className="card-subtitle">Create your account to get started</p>

            {error && <div className="signup-error-message">{error}</div>}

            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input
                type="email"
                className="form-input"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <p className="form-hint">Required for payment and subscription management</p>
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
                placeholder="Create a password (min. 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="form-hint">Required for account creation</p>
            </div>

            <button className="signup-primary-btn" onClick={handleCreateAccount}>
              Create Account & Continue
              <span className="btn-arrow">→</span>
            </button>

            <div className="signup-footer-text">
              Already have an account? <a href="/login">Sign In</a>
            </div>
          </div>
        )}

        {/* Step 2: Plan Selection */}
        {step === 2 && (
          <div className="signup-card plan-selection">
            {/* Close Button - Inside card for native apps */}
            {isNative && (
              <button className="signup-close-btn-in-card" onClick={() => navigate('/')}>
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
                <span>Payment</span>
              </div>
            </div>
            <h2 className="card-title">Choose Your Plan</h2>
            <p className="card-subtitle">Select the plan that works best for you</p>

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
                  <div className="plan-price">
                    <span className="price-amount">{getPricing('regular')[billingCycle]}</span>
                    <span className="price-period">/month</span>
                  </div>
                  {billingCycle === 'annual' && (
                    <p className="billing-note-small">Billed annually at {getPricing('regular').annualTotal}</p>
                  )}
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
                  disabled={loading}
                >
                  {loading && selectedPlan === 'regular' ? 'Loading...' : 'Select Regular'}
                </button>
              </div>

              {/* Plus Plan */}
              <div className="plan-card featured">
                <div className="featured-badge">MOST POPULAR</div>
                <div className="plan-header">
                  <h3 className="plan-name">Plus</h3>
                  <div className="plan-price">
                    <span className="price-amount">{getPricing('plus')[billingCycle]}</span>
                    <span className="price-period">/month</span>
                  </div>
                  {billingCycle === 'annual' && (
                    <p className="billing-note-small">Billed annually at {getPricing('plus').annualTotal}</p>
                  )}
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
                  disabled={loading}
                >
                  {loading && selectedPlan === 'plus' ? 'Loading...' : 'Select Plus'}
                </button>
              </div>
            </div>

            <button className="back-btn" onClick={() => setStep(1)}>
              ← Back to Account Info
            </button>
          </div>
        )}

        {/* Step 3: Embedded Stripe Checkout */}
        {step === 3 && clientSecret && (
          <div className="signup-card payment-step">
            <h2 className="card-title">Complete Your Payment</h2>
            <p className="card-subtitle">
              {selectedPlan === 'regular' ? 'Regular' : 'Plus'} Plan - {getPricing(selectedPlan)[billingCycle]}/month
              {billingCycle === 'annual' && ` (${getPricing(selectedPlan).annualTotal})`}
            </p>

            {error && <div className="signup-error-message">{error}</div>}

            <div className="checkout-container">
              {clientSecret ? (
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
                    clientSecret={clientSecret}
                    selectedPlan={selectedPlan}
                    billingCycle={billingCycle}
                    getPricing={getPricing}
                    onSuccess={() => navigate('/signup-success')}
                    onError={setError}
                  />
                </Elements>
              ) : (
                <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>
                  Loading payment form...
                </div>
              )}
            </div>

            <button className="back-btn" onClick={() => setStep(2)}>
              ← Change Plan
            </button>
          </div>
        )}
      </div>

    </div>
  );
};

export default Signup;
