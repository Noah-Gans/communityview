import React, { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import { useUser } from "../contexts/UserContext";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/firebaseConfig"; // import your Firestore instance
import { getFunctions, httpsCallable } from "firebase/functions";
import "./LoginoldDropdown.css";
import HighlightSettingsPopup from "../components/HighlightSettingsPopup";

const LoginDropdown = () => {
  const { user, logout } = useUser(); // Access user and logout function
  const [isOpen, setIsOpen] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [role, setRole] = useState(null);
  const navigate = useNavigate(); // Define navigate here
  const [showHighlightPopup, setShowHighlightPopup] = useState(false);
  const toggleDropdown = () => {
    setIsOpen((prev) => !prev); // Toggle dropdown
  };
  const [showPortalRedirectPopup, setShowPortalRedirectPopup] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Listen for screen resize to update mobile state
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      setIsOpen(false);
    } catch (error) {
      console.error("Error during logout:", error.message);
    }
  };

  // 1) On mount or when `user` changes, fetch Firestore doc to see if they're active, etc.
  useEffect(() => {
    const fetchSubscriptionInfo = async () => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          console.log("📄 Fetched Firestore data:", data);
          console.log("🔍 subscriptionStatus:", data.subscriptionStatus);

          setSubscriptionStatus(data.subscriptionStatus || "none");
          setRole(data.role || "none");
          const rawStatus = data.subscriptionStatus;
          const normalizedStatus = rawStatus?.toString().trim().toLowerCase();
          const isActive = (normalizedStatus === "active" || normalizedStatus === "plus" || normalizedStatus === "regular");
          console.log("🔍 subscriptionStatus:", rawStatus);
          console.log("🧼 Normalized:", normalizedStatus);
          console.log("✅ isActive:", isActive);
        } else {
          setSubscriptionStatus("none");
        }
      } else {
        setSubscriptionStatus(null);
      }
    };

    fetchSubscriptionInfo();
  }, [user]);

  // 2) Create a function to call your createPortalSession
  const handleManageSubscription = async () => {
    try {
      setShowPortalRedirectPopup(true); // 🔒 Show popup
      const functions = getFunctions();
      const createPortalSession = httpsCallable(functions, "createPortalSession");
      const result = await createPortalSession({});
      const { url } = result.data;
      window.location.href = url; // redirect to Stripe Billing Portal
    } catch (error) {
      console.error("Failed to create portal session:", error);
      alert("Unable to open portal. Please try again later.");
    }
  };

  return (
    <div className="login-dropdown">
      <div
        className="login-dropdown"
        onMouseEnter={() => {
          if (!isMobile) setIsOpen(true);
        }}
        onMouseLeave={() => {
          if (!isMobile) setIsOpen(false);
        }}
      >
        <button
          className="login-button"
          onClick={() => {
            if (!user) {
              // ✅ If not logged in, go directly to login page
              navigate("/login");
            } else if (isMobile) {
              // If logged in on mobile, toggle dropdown
              setIsOpen(prev => !prev);
            }
          }}
        >
          {user ? "Account" : "Sign In"}
        </button>
  
        {/* 🔻 Only render bridge when dropdown is open on desktop */}
        {!isMobile && isOpen && <div className="hover-bridge" />}
  
        {/* 🔻 MOBILE DROPDOWN */}
        {isMobile && (
          <div className={`dropdown-overlay ${isOpen ? "active" : ""}`}>
            <button className="close-dropdown" onClick={() => setIsOpen(false)}>✖</button>
            {user ? (
              <>
                <div className="dropdown-item">{user.email}</div>
                <div
                  className={`subscription-status ${(subscriptionStatus === 'active' || subscriptionStatus === 'plus' || subscriptionStatus === 'regular') ? 'active' : 'inactive'}`}
                >
                  {(subscriptionStatus === 'active' || subscriptionStatus === 'plus' || subscriptionStatus === 'regular') ? '✅ Subscribed' : '❌ Not Subscribed'}
                </div>

                {(subscriptionStatus === "active" || subscriptionStatus === "plus" || subscriptionStatus === "regular") && (
                  <button className="dropdown-button" onClick={handleManageSubscription}>
                    Manage Subscription
                  </button>
                )}
                {(subscriptionStatus === "none" || subscriptionStatus === "canceled") && (
                  <button className="dropdown-button resubscribe-button" onClick={async () => {
                    try {
                      const functions = getFunctions();
                      const createCheckoutSession = httpsCallable(functions, "createCheckoutSession");
                      const result = await createCheckoutSession({
                        email: user.email,
                        userId: user.uid,
                      });
                      window.location.href = result.data.url;
                    } catch (err) {
                      console.error("Error re-subscribing:", err);
                      alert("Unable to start subscription. Please try again later.");
                    }
                  }}>
                    Subscribe
                  </button>
                )}
                <button
                  className="dropdown-button"
                  onClick={() => {
                    setIsOpen(false);
                    navigate("/reset-password");
                  }}
                >
                  Change Password
                </button>
                <button
                  className="dropdown-button"
                  onClick={() => setShowHighlightPopup(true)}
                >
                  Highlight Settings
                </button>
                <button className="dropdown-button logout-button" onClick={handleLogout}>
                  Sign Out
                </button>

              </>
            ) : (
              <button className="dropdown-item" onClick={() => navigate("/login")}>
                Sign In / Sign Up
              </button>
            )}
          </div>
        )}
  
        {/* 🔻 DESKTOP DROPDOWN */}
        {!isMobile && isOpen && (
          <div className="dropdown-menu">
            {user ? (
              <>
                <div className="dropdown-item">{user.email}</div>
                <div
                  className={`subscription-status ${(subscriptionStatus === 'active' || subscriptionStatus === 'plus' || subscriptionStatus === 'regular') ? 'active' : 'inactive'}`}
                >
                  {(subscriptionStatus === 'active' || subscriptionStatus === 'plus' || subscriptionStatus === 'regular') ? '✅ Subscribed' : '❌ Not Subscribed'}
                </div>
                {(subscriptionStatus === "active" || subscriptionStatus === "plus" || subscriptionStatus === "regular") && (
                  <button className="dropdown-button" onClick={handleManageSubscription}>
                    Manage Subscription
                  </button>
                )}
                {(subscriptionStatus === "none" || subscriptionStatus === "canceled") && (
                  <button className="dropdown-button resubscribe-button" onClick={async () => {
                    try {
                      const functions = getFunctions();
                      const createCheckoutSession = httpsCallable(functions, "createCheckoutSession");
                      const result = await createCheckoutSession({
                        email: user.email,
                        userId: user.uid,
                      });
                      window.location.href = result.data.url;
                    } catch (err) {
                      console.error("Error re-subscribing:", err);
                      alert("Unable to start subscription. Please try again later.");
                    }
                  }}>
                    Subscribe
                  </button>
                )}
                <button
                  className="dropdown-button"
                  onClick={() => navigate("/reset-password")}
                >
                  Change Password
                </button>
                <button
                  className="dropdown-button"
                  onClick={() => setShowHighlightPopup(true)}
                >
                  Highlight Settings
                </button>
                <button className="dropdown-button logout-button" onClick={handleLogout}>
                  Sign Out
                </button>
              </>
            ) : (
              <button className="dropdown-item" onClick={() => navigate("/login")}>
                Sign In / Sign Up
              </button>
            )}
          </div>
        )}
      </div>
  
      {showPortalRedirectPopup && (
        <div className="popup-overlay">
          <div className="popup">
            <p>🔒 Taking you to your secure billing portal... Please wait.</p>
          </div>
        </div>
      )}
      {showHighlightPopup && (
      <HighlightSettingsPopup onClose={() => setShowHighlightPopup(false)} />
      )}
    </div>
  );
  
};

export default LoginDropdown;
