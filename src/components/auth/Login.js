import React, { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../firebase/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import "./Login.css";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { isNativeApp } from "../../utils/platformDetection";
import { hasActiveSubscription } from "../../utils/subscriptionAccess";
import { navigateToMarketingHome } from "../../utils/marketingNavigation";

async function getPostLoginPath(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  const status = userDoc.exists() ? userDoc.data()?.subscriptionStatus : null;
  return hasActiveSubscription(status) ? "/map" : "/signup";
}

/** Only allow same-origin relative paths (open-redirect safe). */
function safeReturnToPath(raw) {
  const value = String(raw || "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return null;
  }
  return value;
}

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  const finishLogin = async (firebaseUser) => {
    const params = new URLSearchParams(location.search);
    const returnTo = safeReturnToPath(params.get("returnTo"));
    const postLoginPath = await getPostLoginPath(firebaseUser.uid);
    // Unpaid users must reach /signup — do not honor returnTo to protected routes
    // (ProtectedRoute would bounce them back to login in a loop).
    const destination =
      postLoginPath === "/signup" ? postLoginPath : returnTo || postLoginPath;
    setIsLoading(false);
    navigate(destination, { replace: true });
  };

  const handleLogin = async () => {
    setError("");
    setIsLoading(true);
    
    if (!email || !password) {
      setError("Please enter both email and password");
      setIsLoading(false);
      return;
    }
    
    try {
      const isNative = isNativeApp();
      
      if (isNative) {
        const signInPromise = signInWithEmailAndPassword(auth, email, password);
        
        let authStateResolve;
        let authStateReject;
        const authStatePromise = new Promise((resolve, reject) => {
          authStateResolve = resolve;
          authStateReject = reject;
        });
        
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          if (user && user.email === email) {
            unsubscribe();
            authStateResolve({ user });
          }
        });
        
        const authStateTimeout = setTimeout(() => {
          unsubscribe();
          authStateReject(new Error("Sign in timed out - auth state did not change"));
        }, 10000);
        
        try {
          const result = await Promise.race([
            signInPromise.then((credential) => {
              clearTimeout(authStateTimeout);
              unsubscribe();
              return credential;
            }).catch((err) => {
              if (
                err.code === "auth/invalid-credential" ||
                err.code === "auth/wrong-password" ||
                err.code === "auth/user-not-found"
              ) {
                clearTimeout(authStateTimeout);
                unsubscribe();
                throw err;
              }
              return authStatePromise;
            }),
            authStatePromise.then((result) => {
              clearTimeout(authStateTimeout);
              return result;
            }),
            new Promise((_, reject) => 
              setTimeout(() => {
                clearTimeout(authStateTimeout);
                unsubscribe();
                reject(new Error("Sign in request timed out. Please try again."));
              }, 10000)
            ),
          ]);
          
          await finishLogin(result.user);
        } catch (err) {
          clearTimeout(authStateTimeout);
          unsubscribe();
          throw err;
        }
      } else {
        const signInPromise = signInWithEmailAndPassword(auth, email, password);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => {
            reject(new Error("Sign in request timed out. Please try again."));
          }, 30000)
        );
        
        const userCredential = await Promise.race([signInPromise, timeoutPromise]);
        await finishLogin(userCredential.user);
      }
    } catch (err) {
      let errorMessage = err.message;
      if (err.code === "auth/invalid-email") {
        errorMessage = "Invalid email address";
      } else if (err.code === "auth/user-disabled") {
        errorMessage = "This account has been disabled";
      } else if (err.code === "auth/user-not-found") {
        errorMessage = "No account found with this email";
      } else if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        errorMessage = "Incorrect email or password";
      } else if (err.code === "auth/network-request-failed") {
        errorMessage = "Network error. Please check your connection and try again";
      } else if (err.code === "auth/too-many-requests") {
        errorMessage = "Too many failed attempts. Please try again later";
      }
      
      setError(errorMessage);
      setIsLoading(false);
    }
  };

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

  const handleClose = () => {
    navigateToMarketingHome(navigate);
  };

  const isNative = isNativeApp();

  return (
    <div className="login-page">
      {!isNative && (
        <button className="login-close-btn" onClick={handleClose}>
          ✕
        </button>
      )}

      <div className="login-content">
        {!showReset ? (
          <div className="login-card">
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
                  onKeyPress={(e) => e.key === "Enter" && handleLogin()}
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
                  onKeyPress={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>

              <button 
                className="login-primary-btn" 
                onClick={handleLogin}
                disabled={isLoading}
              >
                {isLoading ? "Signing In..." : "Sign In"}
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
          <div className="login-card">
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
                  onKeyPress={(e) => e.key === "Enter" && handleForgotPassword()}
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
