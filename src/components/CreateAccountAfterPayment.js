import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase/firebaseConfig";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import "./CreateAccountAfterPayment.css";

/**
 * Component for users who paid without creating an account
 * Allows them to create an account and link to their existing subscription
 */
const CreateAccountAfterPayment = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validation
    if (!email || !password || !confirmPassword) {
      setError("Please fill out all fields");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      // Look for a temporary user with this email
      const tempUserId = `temp_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      // Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;

      // Look for existing subscription data with temporary ID
      const tempUserRef = doc(db, "users", tempUserId);
      const tempUserSnap = await getDoc(tempUserRef);

      if (tempUserSnap.exists()) {
        const tempData = tempUserSnap.data();
        
        // Copy the subscription data to the new user's document
        const newUserRef = doc(db, "users", newUser.uid);
        await updateDoc(newUserRef, {
          ...tempData,
          needsAccountCreation: false,
          accountCreatedAt: new Date(),
          linkedFromTemporary: tempUserId,
        });

        // Delete the temporary user document
        await deleteDoc(tempUserRef);

        console.log("Account created and linked to subscription:", newUser.uid);
      } else {
        console.log("No temporary subscription found - account created normally");
      }

      setSuccess(true);
      setTimeout(() => {
        navigate("/map");
      }, 2000);

    } catch (err) {
      console.error("Account creation error:", err);
      
      if (err.code === "auth/email-already-in-use") {
        setError("An account with this email already exists. Please sign in instead.");
      } else if (err.code === "auth/invalid-email") {
        setError("Invalid email address");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="create-account-page">
        <div className="create-account-card">
          <div className="success-icon">✓</div>
          <h2>Account Created!</h2>
          <p>Your account has been linked to your subscription.</p>
          <p>Redirecting to map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="create-account-page">
      <button className="close-btn" onClick={() => navigate("/")}>
        ✕
      </button>

      <div className="create-account-card">
        <h2>Create Your Account</h2>
        <p className="subtitle">
          Complete your signup by creating an account to access your subscription
        </p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleCreateAccount}>
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <p className="hint">Use the same email you used for payment</p>
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            className="create-btn"
            disabled={loading}
          >
            {loading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <p className="footer-text">
          Already have an account? <a href="/login">Sign In</a>
        </p>
      </div>
    </div>
  );
};

export default CreateAccountAfterPayment;



