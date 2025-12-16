import React, { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";
import "./Login.css";
import { useNavigate } from "react-router-dom";

const ResetPassword = () => {
  const [resetEmail, setResetEmail] = useState("");
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleForgotPassword = async () => {
    setError("");
    setResetMessage("");
    setLoading(true);
    
    try {
      if (!resetEmail) {
        setError("Please enter your email address");
        return;
      }
      
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMessage(`Password reset email sent to ${resetEmail}. Please check your inbox.`);
    } catch (err) {
      console.error("Password reset error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    navigate(-1); // Go back
  };

  return (
    <div className="login-page">
      <div className="login-content">
        <div className="login-card">
          <div className="login-card-inner">
            {/* Close Button */}
            <button className="login-close-btn" onClick={handleClose}>×</button>

            {/* Header */}
            <div className="login-header">
              <h2 className="login-title">Reset Password</h2>
              <p style={{ color: 'rgba(255, 255, 255, 0.6)', marginTop: '8px' }}>
                Enter your email and we'll send you a password reset link
              </p>
            </div>

            {/* Error Message */}
            {error && <div className="login-error-message">{error}</div>}
            
            {/* Success Message */}
            {resetMessage && <div className="login-success-message">{resetMessage}</div>}

            {/* Form */}
            <div className="login-form">
              <div className="input-group">
                <input
                  type="email"
                  className="login-input"
                  placeholder="Enter your email address"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </div>

              <button 
                className="login-primary-btn" 
                onClick={handleForgotPassword}
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Reset Email"}
                {!loading && <span className="btn-arrow">→</span>}
              </button>
            </div>

            {/* Back to Login */}
            <button className="back-to-login-link" onClick={() => navigate('/login')}>
              ← Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
