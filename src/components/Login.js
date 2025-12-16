import React, { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged } from "firebase/auth";
import { auth, authPersistenceReady } from "../firebase/firebaseConfig";
import "./Login.css";
import { Link, useNavigate } from "react-router-dom";
import { isNativeApp } from "../utils/platformDetection";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // For forgot password flow
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  const navigate = useNavigate();

  // 1) Normal login
  const handleLogin = async () => {
    console.log('🔑 handleLogin called!');
    setError("");
    setIsLoading(true);
    
    if (!email || !password) {
      setError("Please enter both email and password");
      setIsLoading(false);
      return;
    }
    
    try {
      console.log('🔑 Attempting to sign in with email:', email);
      console.log('🔑 Auth app name:', auth?.app?.name);
      console.log('🔑 Auth object:', auth);
      
      // Skip waiting for persistence - Firebase auth will work without it
      // This prevents hanging in production builds where persistence setup may be slow
      console.log('🔑 Skipping persistence wait - proceeding directly to sign-in');
      
      console.log('🔑 Calling signInWithEmailAndPassword...');
      console.log('🔑 Auth config:', {
        apiKey: auth?.app?.options?.apiKey?.substring(0, 10) + '...',
        authDomain: auth?.app?.options?.authDomain,
        projectId: auth?.app?.options?.projectId
      });
      
      // Test network connectivity first
      try {
        console.log('🔑 Testing network connectivity to Firebase...');
        const testUrl = `https://${auth?.app?.options?.authDomain}/.well-known/openid-configuration`;
        const testResponse = await fetch(testUrl, { 
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-cache'
        });
        console.log('🔑 Network test completed');
      } catch (networkError) {
        console.warn('🔑 Network test warning (may be CORS, continuing anyway):', networkError);
      }
      
      // For native apps, use a workaround: the promise may hang but auth state may still update
      // Start the sign-in and check auth state directly if promise doesn't resolve quickly
      const isNative = isNativeApp();
      
      if (isNative) {
        console.log('🔑 Native app detected - using auth state polling workaround');
        
        // Start sign-in but don't wait for promise
        const signInPromise = signInWithEmailAndPassword(auth, email, password);
        
        // Set up a listener to detect when auth state changes (sign-in succeeds)
        let authStateResolve;
        let authStateReject;
        const authStatePromise = new Promise((resolve, reject) => {
          authStateResolve = resolve;
          authStateReject = reject;
        });
        
        // Listen for auth state changes
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          if (user && user.email === email) {
            console.log('🔑 Auth state changed - user signed in:', user.email);
            unsubscribe();
            authStateResolve({ user });
          }
        });
        
        // Also set up timeout for auth state check
        const authStateTimeout = setTimeout(() => {
          unsubscribe();
          authStateReject(new Error('Sign in timed out - auth state did not change'));
        }, 10000); // 10 second timeout for auth state change
        
        // Race between the sign-in promise, auth state change, and timeout
        try {
          const result = await Promise.race([
            signInPromise.then((credential) => {
              clearTimeout(authStateTimeout);
              unsubscribe();
              console.log('🔑 Sign-in promise resolved normally');
              return credential;
            }).catch((err) => {
              // If promise rejects with invalid credential, that's a real error
              if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
                clearTimeout(authStateTimeout);
                unsubscribe();
                throw err;
              }
              // Otherwise, ignore the error and wait for auth state change
              console.log('🔑 Sign-in promise rejected but waiting for auth state change:', err.code);
              return authStatePromise;
            }),
            authStatePromise.then((result) => {
              clearTimeout(authStateTimeout);
              console.log('🔑 Auth state changed - sign-in succeeded via state check');
              return result;
            }),
            new Promise((_, reject) => 
              setTimeout(() => {
                clearTimeout(authStateTimeout);
                unsubscribe();
                reject(new Error('Sign in request timed out. Please try again.'));
              }, 10000)
            )
          ]);
          
          console.log('🔑 Sign in successful! User:', result.user?.email);
          console.log('🔑 User UID:', result.user?.uid);
          
          // Clear loading state immediately
          setIsLoading(false);
          
          // Navigate immediately - don't wait for Firestore listener in UserContext
          console.log('🔑 Navigating to /map immediately (Firestore will load in background)');
          navigate("/map", { replace: true });
        } catch (err) {
          clearTimeout(authStateTimeout);
          unsubscribe();
          throw err;
        }
      } else {
        // For web/browser, use standard approach with timeout
        console.log('🔑 Web browser detected - using standard sign-in with timeout');
        const signInPromise = signInWithEmailAndPassword(auth, email, password);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => {
            console.error('🔑 Sign in timeout - request took longer than 30 seconds');
            reject(new Error('Sign in request timed out. This may be a network or Firebase configuration issue. Please try again.'));
          }, 30000)
        );
        
        console.log('🔑 Starting sign-in with timeout protection (30s timeout)...');
        const userCredential = await Promise.race([signInPromise, timeoutPromise]);
        console.log('🔑 Sign in successful! User:', userCredential.user?.email);
        console.log('🔑 User UID:', userCredential.user?.uid);
        
        // Clear loading state immediately
        setIsLoading(false);
        
        // Navigate immediately - don't wait for Firestore listener in UserContext
        console.log('🔑 Navigating to /map immediately (Firestore will load in background)');
        navigate("/map", { replace: true });
      }
    } catch (err) {
      console.error('🔑 Sign in error:', err);
      console.error('🔑 Error code:', err.code);
      console.error('🔑 Error message:', err.message);
      
      // Provide user-friendly error messages
      let errorMessage = err.message;
      if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (err.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled';
      } else if (err.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password';
      } else if (err.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your connection and try again';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later';
      }
      
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  // 2) Forgot Password
  const handleForgotPassword = async () => {
    setError("");
    setResetMessage("");
    try {
      if (!resetEmail) {
        setError("Please enter your email to reset password");
        return;
      }
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMessage(`Password reset email sent to ${resetEmail}. Please check your inbox.`);
    } catch (err) {
      setError(err.message);
    }
  };

  // 3) Close/Exit button - send user back to intro
  const handleClose = () => {
    navigate("/");
  };

  const isNative = isNativeApp();

  return (
    <div className="login-page">
      {/* Close Button - Top Right (only for non-native) */}
      {!isNative && (
        <button className="login-close-btn" onClick={handleClose}>
          ✕
        </button>
      )}

      <div className="login-content">
        {!showReset ? (
          // Login Form
          <div className="login-card">
            {/* Close Button - Inside card for native apps */}
            {isNative && (
              <button className="login-close-btn-in-card" onClick={handleClose}>
                ✕
              </button>
            )}
            <div className="login-card-inner">
              <div className="login-header">
                <img src="/logo_transparent_no_background.png" alt="Community View Logo" className="login-logo" />
                <h1 className="login-title">Sign In</h1>
              </div>

              {error && <div className="login-error-message">{error}</div>}

              <div className="login-form">
              <div className="input-group">
                <label className="input-label">Email Address</label>
                <input
                  type="email"
                  className="login-input"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Password</label>
                <input
                  type="password"
                  className="login-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>

              <button 
                className="login-primary-btn" 
                onClick={handleLogin}
                disabled={isLoading}
              >
                {isLoading ? 'Signing In...' : 'Sign In'}
                <span className="btn-arrow">→</span>
              </button>

              <button 
                className="forgot-password-link" 
                onClick={() => setShowReset(true)}
              >
                Forgot password?
              </button>

              <div className="login-divider">
                <span>or</span>
              </div>

              <div className="signup-section">
                <p className="signup-text">Don't have an account?</p>
                <Link to="/signup" className="signup-link-btn">
                  Create Account
                </Link>
              </div>
            </div>
            </div>
          </div>
        ) : (
          // Reset Password Form
          <div className="login-card">
            {/* Close Button - Inside card for native apps */}
            {isNative && (
              <button className="login-close-btn-in-card" onClick={handleClose}>
                ✕
              </button>
            )}
            <div className="login-card-inner">
              <div className="login-header">
                <img src="/logo_transparent_no_background.png" alt="Community View Logo" className="login-logo" />
                <h1 className="login-title">Reset Password</h1>
              </div>

            {error && <div className="login-error-message">{error}</div>}
            {resetMessage && <div className="login-success-message">{resetMessage}</div>}

            <div className="login-form">
              <div className="input-group">
                <label className="input-label">Email Address</label>
                <input
                  type="email"
                  className="login-input"
                  placeholder="Enter your email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleForgotPassword()}
                />
              </div>

              <button className="login-primary-btn" onClick={handleForgotPassword}>
                Send Reset Email
                <span className="btn-arrow">→</span>
              </button>

              <button 
                className="back-to-login-link" 
                onClick={() => setShowReset(false)}
              >
                ← Back to Sign In
              </button>
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
