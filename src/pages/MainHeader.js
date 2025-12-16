import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./MainHeader.css";
import ContactForm from "../components/ContactForm";
import { useMapContext } from "./MapContext";
import { useUser } from "../contexts/UserContext";
import { getFunctions, httpsCallable } from "firebase/functions";
import HighlightSettingsPopup from "../components/HighlightSettingsPopup";
import { isNativeApp } from "../utils/platformDetection";

const MainHeader = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isContactFormOpen, setIsContactFormOpen] = useState(false);
  const { activeTab, setActiveTab } = useMapContext();
  const { user, logout, deleteAccount, subscriptionStatus, role } = useUser();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showHighlightPopup, setShowHighlightPopup] = useState(false);
  const [showPortalRedirectPopup, setShowPortalRedirectPopup] = useState(false);
  const [showDeleteConfirmPopup, setShowDeleteConfirmPopup] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const isMapPage = location.pathname.startsWith('/map');
  // Check if we're on a product page (map, search, report, print)
  const isProductPage = ['/map', '/search', '/report', '/print'].includes(location.pathname);
  
  // Check if we're on the intro/landing page
  const isIntroPage = location.pathname === '/' || location.pathname === '/updates' || location.pathname === '/pricing' || location.pathname === '/features' || location.pathname === '/faq';
  
  // Hide header on sales one-pager
  const isOnePage = location.pathname === '/onepage';
  
  // Determine active tab based on current route
  const getActiveTabFromPath = () => {
    const path = location.pathname;
    if (path.includes('/search')) return 'search';
    if (path.includes('/report')) return 'report';
    if (path.includes('/print')) return 'print';
    if (path.includes('/map')) return 'map';
    return activeTab; // Fallback to context if no match
  };
  
  const currentActiveTab = isProductPage ? getActiveTabFromPath() : activeTab;
  // Listen for screen resize to update mobile state
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  const handleContactClick = () => {
    setIsContactFormOpen(true);
  };

  const handleCloseContactForm = () => {
    setIsContactFormOpen(false);
  };

  const toggleDropdown = () => {
    setIsDropdownOpen((prev) => !prev);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setIsDropdownOpen(false);
    } catch (error) {
      console.error("Error during logout:", error.message);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      console.log("🗑️ Delete account button clicked");
      await deleteAccount();
      console.log("✅ Delete account succeeded, closing popup and navigating...");
      setIsDropdownOpen(false);
      setShowDeleteConfirmPopup(false);
      // User will be logged out and redirected automatically after account deletion
      navigate('/');
    } catch (error) {
      console.error("❌ Error in handleDeleteAccount:", error);
      console.error("❌ Error code:", error.code);
      console.error("❌ Error message:", error.message);
      console.error("❌ Full error:", JSON.stringify(error, null, 2));
      
      // Show user-friendly error message
      const errorMessage = error.message || error.code || 'Unknown error occurred';
      alert(`Failed to delete account: ${errorMessage}\n\nPlease check the browser console for more details.`);
      
      // Don't close the popup on error so user can try again
      // setShowDeleteConfirmPopup(false);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Note: subscriptionStatus and role are now provided by UserContext via useUser() hook

  const handleManageSubscription = async () => {
    try {
      setShowPortalRedirectPopup(true);
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

  const closeDropdown = () => setIsDropdownOpen(false);
  const hasActiveSubscription = subscriptionStatus === 'active' || subscriptionStatus === 'plus' || subscriptionStatus === 'regular';

  const handleDesktopMouseLeave = () => {
    setTimeout(() => {
      if (!document.querySelector('.dropdown-menu:hover')) {
        setIsDropdownOpen(false);
      }
    }, 100);
  };

  const renderDropdownMenu = (isMobileView = false) => (
    <div
      className="dropdown-menu"
      onMouseEnter={isMobileView ? undefined : () => setIsDropdownOpen(true)}
      onMouseLeave={isMobileView ? undefined : () => setIsDropdownOpen(false)}
    >
      <div className="dropdown-item">{user?.email}</div>
      <div className={`subscription-status ${hasActiveSubscription ? 'active' : 'inactive'}`}>
        {hasActiveSubscription ? '✅ Subscribed' : '❌ Not Subscribed'}
      </div>
      {hasActiveSubscription ? (
        <button
          className="dropdown-button"
          onClick={() => {
            navigate('/manage-subscription');
            closeDropdown();
          }}
        >
          Manage Subscription
        </button>
      ) : (
        <button
          className="dropdown-button resubscribe-button"
          onClick={() => {
            navigate('/signup');
            closeDropdown();
          }}
        >
          Subscribe
        </button>
      )}
      <button
        className="dropdown-button"
        onClick={() => {
          closeDropdown();
          navigate("/reset-password");
        }}
      >
        Change Password
      </button>
      <button
        className="dropdown-button"
        onClick={() => {
          closeDropdown();
          setShowHighlightPopup(true);
        }}
      >
        Highlight Settings
      </button>
      <button
        className="dropdown-button"
        onClick={() => {
          closeDropdown();
          navigate('/tutorial');
        }}
      >
        Tutorial
      </button>
      <button className="dropdown-button logout-button" onClick={handleLogout}>
        Sign Out
      </button>
      <button 
        className="dropdown-button delete-account-button" 
        onClick={() => {
          closeDropdown();
          setShowDeleteConfirmPopup(true);
        }}
      >
        Delete Account
      </button>
    </div>
  );

  const renderPersonIcon = () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 20c0-3.866 3.134-7 7-7s7 3.134 7 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );

  const renderAccountControls = (isMobileView = false, options = {}) => {
    const { iconOnly = false } = options;
    const isNative = isNativeApp();
    const isIntro = location.pathname === '/';
    const isLoginPage = location.pathname === '/login';
    const isSignupPage = location.pathname === '/signup';
    
    // Hide sign in button on native app intro page (it's blocked by status bar)
    // Also hide on login and signup pages (both mobile and app) - not needed and blocks X button
    if (!user && ((isNative && isIntro) || isLoginPage || isSignupPage)) {
      return null;
    }
    
    if (user) {
      const buttonProps = isMobileView
        ? { onClick: toggleDropdown }
        : {
            onClick: toggleDropdown,
            onMouseEnter: () => setIsDropdownOpen(true),
            onMouseLeave: handleDesktopMouseLeave,
          };

      return (
        <div className="user-dropdown">
          <button
            className={`user-button${iconOnly ? ' icon-only' : ''}`}
            aria-label="Account"
            {...buttonProps}
          >
            {iconOnly ? renderPersonIcon() : 'Account'}
          </button>
          {isDropdownOpen && renderDropdownMenu(isMobileView)}
        </div>
      );
    }

    // Don't show Sign In button - removed per user request
    return null;
  };

  useEffect(() => {
    closeDropdown();
  }, [location.pathname, isMobile]);

  // Close dropdown when user interacts with the map (for native apps)
  useEffect(() => {
    if (!isMapPage) return;

    const handleMapInteraction = () => {
      if (isDropdownOpen) {
        closeDropdown();
      }
    };

    // Listen for map interaction events
    window.addEventListener('map-user-interaction', handleMapInteraction);
    document.addEventListener('map-user-interaction', handleMapInteraction);

    return () => {
      window.removeEventListener('map-user-interaction', handleMapInteraction);
      document.removeEventListener('map-user-interaction', handleMapInteraction);
    };
  }, [isMapPage, isDropdownOpen]);

  if (isMobile) {
    if (isMapPage) {
      return (
        <>
          <div className="mobile-account-floating">
            {renderAccountControls(true, { iconOnly: true })}
          </div>
          {isContactFormOpen && <ContactForm onClose={handleCloseContactForm} />}
          {showHighlightPopup && (
            <HighlightSettingsPopup onClose={() => setShowHighlightPopup(false)} />
          )}
          {showPortalRedirectPopup && (
            <div className="popup-overlay">
              <div className="popup">
                <p> Taking you to your secure billing portal... Please wait.</p>
              </div>
            </div>
          )}
          {showDeleteConfirmPopup && (
            <div className="popup-overlay" onClick={() => !isDeletingAccount && setShowDeleteConfirmPopup(false)}>
              <div className="popup" onClick={(e) => e.stopPropagation()}>
                <h3>Delete Account</h3>
                <p>Are you sure you want to delete your account? This action cannot be undone.</p>
                <p><strong>This will permanently delete:</strong></p>
                <ul style={{ textAlign: 'left', margin: '10px 0' }}>
                  <li>Your account and all data</li>
                  <li>Your active subscription (will be canceled)</li>
                  <li>All saved settings and preferences</li>
                </ul>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
                  <button 
                    className="dropdown-button" 
                    onClick={() => setShowDeleteConfirmPopup(false)}
                    disabled={isDeletingAccount}
                  >
                    Cancel
                  </button>
                  <button 
                    className="dropdown-button delete-account-button" 
                    onClick={handleDeleteAccount}
                    disabled={isDeletingAccount}
                  >
                    {isDeletingAccount ? 'Deleting...' : 'Yes, Delete My Account'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      );
    }
    return (
      <>
        <div className="main-header mobile-account-only">
          <div className="header-right">
            {renderAccountControls(true)}
          </div>
        </div>
        {isContactFormOpen && <ContactForm onClose={handleCloseContactForm} />}
        {showHighlightPopup && (
          <HighlightSettingsPopup onClose={() => setShowHighlightPopup(false)} />
        )}
        {showPortalRedirectPopup && (
          <div className="popup-overlay">
            <div className="popup">
              <p> Taking you to your secure billing portal... Please wait.</p>
            </div>
          </div>
        )}
        {showDeleteConfirmPopup && (
          <div className="popup-overlay" onClick={() => !isDeletingAccount && setShowDeleteConfirmPopup(false)}>
            <div className="popup" onClick={(e) => e.stopPropagation()}>
              <h3>Delete Account</h3>
              <p>Are you sure you want to delete your account? This action cannot be undone.</p>
              <p><strong>This will permanently delete:</strong></p>
              <ul style={{ textAlign: 'left', margin: '10px 0' }}>
                <li>Your account and all data</li>
                <li>Your active subscription (will be canceled)</li>
                <li>All saved settings and preferences</li>
              </ul>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
                <button 
                  className="dropdown-button" 
                  onClick={() => setShowDeleteConfirmPopup(false)}
                  disabled={isDeletingAccount}
                >
                  Cancel
                </button>
                <button 
                  className="dropdown-button delete-account-button" 
                  onClick={handleDeleteAccount}
                  disabled={isDeletingAccount}
                >
                  {isDeletingAccount ? 'Deleting...' : 'Yes, Delete My Account'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Hide header on sales one-pager
  if (isOnePage) {
    return null;
  }

  return (
    <>
      {isIntroPage && (
        <div className="main-header intro-header">
          {/* Left - Logo (hidden on mobile) */}
          {!isMobile && (
            <div className="header-left">
              <Link to="/" className="logo-link">
                <img src="/logo.png" alt="Community View Logo" className="logo-image" />
              </Link>
            </div>
          )}

          {/* Center - Navigation Links */}
          <div className="header-center">
            <button className="nav-button" onClick={() => navigate('/features')}>
              Features
            </button>
            <button className="nav-button" onClick={() => navigate('/updates')}>
              Updates
            </button>
            <button className="nav-button" onClick={() => navigate('/pricing')}>
              Pricing
            </button>
            <button className="nav-button" onClick={() => navigate('/faq')}>
              FAQ
            </button>
            <a className="nav-button" href="mailto:noahgans@communityview.ai">
              Contact
            </a>
          </div>

          {/* Right - Map + Account */}
          <div className="header-right">
            <button className="map-button" onClick={() => navigate('/map')}>
              Map
            </button>
            {renderAccountControls()}
          </div>
        </div>
      )}

      {/* Main Header for product pages */}
      {!isIntroPage && (
        <div className="main-header">
          {/* Left Side - Logo/Home */}
          <div className="header-left">
            <Link to="/" className="logo-link">
              {isMobile ? (
                <span className="home-text">Home</span>
              ) : (
                <img src="/logo.png" alt="Community View Logo" className="logo-image" />
              )}
            </Link>
          </div>

          {/* Center - Navigation Tabs (only on product pages) */}
          {isProductPage && (
            <div className="header-center">
              <Link
                className={`header-tab ${currentActiveTab === "map" ? "active" : ""}`}
                onClick={() => handleTabChange("map")}
                to="/map"
              >
                Map
              </Link>
              <Link
                className={`header-tab ${currentActiveTab === "search" ? "active" : ""}`}
                onClick={() => handleTabChange("search")}
                to="/search"
              >
                Search
              </Link>
              {!isMobile && (
                <Link
                  className={`header-tab ${currentActiveTab === "report" ? "active" : ""}`}
                  onClick={() => handleTabChange("report")}
                  to="/report"
                >
                  Reports
                </Link>
              )}
              {!isMobile && (
                <Link
                  className={`header-tab ${currentActiveTab === "print" ? "active" : ""}`}
                  onClick={() => handleTabChange("print")}
                  to="/print"
                >
                  Print
                </Link>
              )}
            </div>
          )}

          {/* Right Side - Account (always visible) */}
          <div className="header-right">
            {renderAccountControls()}
          </div>
        </div>
      )}

      {/* Modals */}
      {isContactFormOpen && <ContactForm onClose={handleCloseContactForm} />}
      {showHighlightPopup && (
        <HighlightSettingsPopup onClose={() => setShowHighlightPopup(false)} />
      )}
      {showPortalRedirectPopup && (
        <div className="popup-overlay">
          <div className="popup">
            <p> Taking you to your secure billing portal... Please wait.</p>
          </div>
        </div>
      )}
      {showDeleteConfirmPopup && (
        <div className="popup-overlay" onClick={() => !isDeletingAccount && setShowDeleteConfirmPopup(false)}>
          <div className="popup" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Account</h3>
            <p>Are you sure you want to delete your account? This action cannot be undone.</p>
            <p><strong>This will permanently delete:</strong></p>
            <ul style={{ textAlign: 'left', margin: '10px 0' }}>
              <li>Your account and all data</li>
              <li>Your active subscription (will be canceled)</li>
              <li>All saved settings and preferences</li>
            </ul>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
              <button 
                className="dropdown-button" 
                onClick={() => setShowDeleteConfirmPopup(false)}
                disabled={isDeletingAccount}
              >
                Cancel
              </button>
              <button 
                className="dropdown-button delete-account-button" 
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
              >
                {isDeletingAccount ? 'Deleting...' : 'Yes, Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MainHeader;
