import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./MainHeader.css";
import ContactForm from "../components/ui/ContactForm";
import { useMapContext } from "./MapContext";
import { useUser } from "../contexts/UserContext";
import AccountMenuDropdown from "../components/account/AccountMenuDropdown";
import AccountSettingsPanel from "../components/account/AccountSettingsPanel";
import { isNativeApp } from "../utils/platformDetection";
import { useTutorialWalkthrough } from "../contexts/TutorialWalkthroughContext";
import { REGRID_BATCH_REPORTS_ENABLED } from "../config/featureFlags";
import { STAY_ON_HOME_STATE } from "../utils/marketingNavigation";
import { normalizePathname } from "../utils/mapBackedRoutes";

const MainHeader = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isContactFormOpen, setIsContactFormOpen] = useState(false);
  const { activeTab, setActiveTab, isPrinting } = useMapContext();
  const { user, logout, deleteAccount, subscriptionStatus } = useUser();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [accountSettingsSection, setAccountSettingsSection] = useState('overview');
  const [showDeleteConfirmPopup, setShowDeleteConfirmPopup] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const { start: startWalkthrough, startPrint: startPrintWalkthrough, isActive: tourActive, stepIndex: tourStepIndex } =
    useTutorialWalkthrough();
  const pathname = normalizePathname(location.pathname);
  const isMapPage = pathname.startsWith('/map');
  const isMapRoute = pathname === '/map';
  const isPrintEditMode = pathname === '/print' && isPrinting;
  // Check if we're on a product page (map, search, report, print)
  const isProductPage = ['/map', '/search', '/report', '/print'].includes(pathname);
  
  const isMarketingPage =
    pathname === '/' ||
    pathname === '/pricing' ||
    pathname === '/features' ||
    pathname === '/faq' ||
    pathname === '/use-cases' ||
    pathname.startsWith('/use-cases/') ||
    pathname.startsWith('/compare/');
  
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

  const closeDropdown = () => setIsDropdownOpen(false);
  const hasActiveSubscription = subscriptionStatus === 'active' || subscriptionStatus === 'plus' || subscriptionStatus === 'regular';
  const dropdownCloseTimerRef = useRef(null);

  const clearDropdownCloseTimer = () => {
    if (dropdownCloseTimerRef.current) {
      clearTimeout(dropdownCloseTimerRef.current);
      dropdownCloseTimerRef.current = null;
    }
  };

  const scheduleDropdownClose = () => {
    clearDropdownCloseTimer();
    dropdownCloseTimerRef.current = setTimeout(() => {
      setIsDropdownOpen(false);
      dropdownCloseTimerRef.current = null;
    }, 250);
  };

  useEffect(() => () => clearDropdownCloseTimer(), []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const section = params.get('accountSection');
    const validSections = new Set([
      'overview',
      'subscription',
      'profile',
      'security',
      'preferences',
      'help',
      'account',
    ]);
    if (!section || !validSections.has(section) || !user) return;
    setAccountSettingsSection(section);
    setShowAccountSettings(true);
    navigate({ pathname: location.pathname, search: '' }, { replace: true });
  }, [location.search, location.pathname, navigate, user]);

  const renderDropdownMenu = () => (
    <AccountMenuDropdown
      user={user}
      subscriptionStatus={subscriptionStatus}
      hasActiveSubscription={hasActiveSubscription}
      onOpenAccountSettings={() => {
        closeDropdown();
        setAccountSettingsSection('overview');
        setShowAccountSettings(true);
      }}
      onOpenMapPreferences={() => {
        closeDropdown();
        setAccountSettingsSection('preferences');
        setShowAccountSettings(true);
      }}
      onOpenSubscription={() => {
        closeDropdown();
        setAccountSettingsSection('subscription');
        setShowAccountSettings(true);
      }}
      onSubscribe={() => {
        closeDropdown();
        navigate('/signup');
      }}
      onChangePassword={() => {
        closeDropdown();
        navigate('/reset-password');
      }}
      onQuickTour={() => {
        closeDropdown();
        startWalkthrough();
      }}
      onSignOut={handleLogout}
    />
  );

  const renderAccountModals = () => (
    <>
      {showAccountSettings && (
        <AccountSettingsPanel
          key={accountSettingsSection}
          initialSection={accountSettingsSection}
          onClose={() => setShowAccountSettings(false)}
          onQuickTour={startWalkthrough}
          onSignOut={handleLogout}
          onDeleteAccount={() => setShowDeleteConfirmPopup(true)}
        />
      )}
      {showDeleteConfirmPopup && (
        <div
          className="popup-overlay"
          onClick={() => !isDeletingAccount && setShowDeleteConfirmPopup(false)}
        >
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

  const renderTutorialHelpButton = (className = '', onClick = () => startWalkthrough()) => (
    <button
      type="button"
      className={`header-tutorial-help-button${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-label="Start quick tour"
      title="Quick tour"
    >
      ?
    </button>
  );

  const handlePrintOpenSave = () => {
    window.dispatchEvent(new CustomEvent('print-open-save-dialog'));
  };

  const handlePrintBackToMaps = () => {
    window.dispatchEvent(new CustomEvent('print-exit-edit'));
  };

  const handlePrintShareMap = () => {
    window.dispatchEvent(new CustomEvent('print-share-map'));
  };

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
    const isLanding = location.pathname === '/';
    const isLoginPage = location.pathname === '/login';
    const isSignupPage = location.pathname === '/signup';
    
    // Hide sign in button on native app landing page (it's blocked by status bar)
    // Also hide on login and signup pages (both mobile and app) - not needed and blocks X button
    if (!user && ((isNative && isLanding) || isLoginPage || isSignupPage)) {
      return null;
    }
    
    if (user) {
      const wrapperProps = isMobileView
        ? {}
        : {
            onMouseEnter: () => {
              clearDropdownCloseTimer();
              setIsDropdownOpen(true);
            },
            onMouseLeave: scheduleDropdownClose,
          };

      return (
        <div className="user-dropdown" {...wrapperProps}>
          <button
            className={`user-button${iconOnly ? ' icon-only' : ''}${isDropdownOpen ? ' is-open' : ''}`}
            aria-label="Account"
            aria-expanded={isDropdownOpen}
            onClick={toggleDropdown}
          >
            {iconOnly ? renderPersonIcon() : 'Account'}
          </button>
          {isDropdownOpen && renderDropdownMenu()}
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

  const showMobileTourNavStrip =
    isMobile && isMapPage && tourActive && tourStepIndex === 1;

  const isPrintDashboard = pathname === '/print';

  if (isMobile) {
    if (isMapPage) {
      return (
        <>
          {showMobileTourNavStrip && (
            <div className="mobile-tutorial-nav-strip" data-tour="product-nav">
              <button type="button" className="mobile-tutorial-nav-btn" onClick={() => navigate('/map')}>
                Map
              </button>
              <button type="button" className="mobile-tutorial-nav-btn" onClick={() => navigate('/search')}>
                Search
              </button>
              <span className="mobile-tutorial-nav-hint">More tabs on wider screens</span>
            </div>
          )}
          {isMapRoute && (
            <div className="mobile-account-floating mobile-account-floating--tutorial-only">
              {renderTutorialHelpButton()}
            </div>
          )}
          {isContactFormOpen && <ContactForm onClose={handleCloseContactForm} />}
          {renderAccountModals()}
        </>
      );
    }
    if (isPrintDashboard) {
      return (
        <>
          {isContactFormOpen && <ContactForm onClose={handleCloseContactForm} />}
          {renderAccountModals()}
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
        {renderAccountModals()}
      </>
    );
  }

  // Hide header on sales one-pager
  if (isOnePage) {
    return null;
  }

  return (
    <>
      {isMarketingPage && (
        <div className="main-header intro-header">
          {/* Left - Logo (hidden on mobile) */}
          {!isMobile && (
            <div className="header-left">
              <Link to="/" state={user ? STAY_ON_HOME_STATE : undefined} className="logo-link">
                <img src="/logo.png" alt="Community View Logo" className="logo-image" />
              </Link>
            </div>
          )}

          {/* Center - Navigation Links */}
          <div className="header-center">
            <Link className="nav-button" to="/features">
              Features
            </Link>
            <Link className="nav-button" to="/use-cases">
              Use cases
            </Link>
            <Link className="nav-button" to="/pricing">
              Pricing
            </Link>
            <Link className="nav-button" to="/faq">
              FAQ
            </Link>
            <a className="nav-button" href="mailto:noahgans@communityview.ai">
              Contact
            </a>
          </div>

          {/* Right - Map + Account */}
          <div className="header-right">
            <Link className="map-button" to="/map">
              Map
            </Link>
            {renderAccountControls()}
          </div>
        </div>
      )}

      {/* Main Header for product pages */}
      {!isMarketingPage && (
        <div
          className={`main-header ${isProductPage ? 'map-mode' : ''}`}
          data-tour={isProductPage ? 'product-nav' : undefined}
        >
          {/* Left Side - Logo/Home */}
          <div className="header-left">
            <Link to="/" state={user ? STAY_ON_HOME_STATE : undefined} className="logo-link">
              {isMobile ? (
                <span className="home-text">Home</span>
              ) : (
                <img src="/logo.png" alt="Community View Logo" className="logo-image" />
              )}
            </Link>
            {isPrintEditMode && (
              <button
                type="button"
                className="header-print-exit-btn"
                onClick={handlePrintBackToMaps}
                title="Exit map editing"
              >
                Exit
              </button>
            )}
          </div>

          {/* Center - Navigation Tabs (only on product pages) */}
          {isProductPage && !isPrintEditMode && (
            <div className="header-center">
              <Link
                className={`header-tab ${currentActiveTab === "map" ? "active" : ""}`}
                onClick={() => handleTabChange("map")}
                to={{ pathname: "/map", search: location.search }}
              >
                Map
              </Link>
              <Link
                className={`header-tab ${currentActiveTab === "search" ? "active" : ""}`}
                onClick={() => handleTabChange("search")}
                to="/search"
                data-tour="header-tab-search"
              >
                Search
              </Link>
              {!isMobile && REGRID_BATCH_REPORTS_ENABLED && (
                <Link
                  className={`header-tab ${currentActiveTab === "report" ? "active" : ""}`}
                  onClick={() => handleTabChange("report")}
                  to="/report"
                >
                  Reports
                </Link>
              )}
              <Link
                className={`header-tab ${currentActiveTab === "print" ? "active" : ""}`}
                onClick={() => handleTabChange("print")}
                to={{ pathname: "/print", search: location.search }}
              >
                Maps
              </Link>
            </div>
          )}

          {/* Right Side - Tutorial help (map only) + Account */}
          <div className="header-right">
            {isPrintEditMode && (
              <>
                {renderTutorialHelpButton('print-header-help', startPrintWalkthrough)}
                <div className="header-print-actions" data-tour="print-header-actions">
                  <button type="button" className="header-print-action-btn" onClick={handlePrintOpenSave}>
                    Save Map
                  </button>
                  <button
                    type="button"
                    className="header-print-action-btn header-print-action-btn-secondary"
                    onClick={handlePrintBackToMaps}
                  >
                    Back to Maps
                  </button>
                  <button type="button" className="header-print-action-btn" onClick={handlePrintShareMap}>
                    Share Map
                  </button>
                </div>
              </>
            )}
            {!isPrintEditMode && isMapRoute && renderTutorialHelpButton()}
            {renderAccountControls()}
          </div>
        </div>
      )}

      {/* Modals */}
      {isContactFormOpen && <ContactForm onClose={handleCloseContactForm} />}
      {renderAccountModals()}
    </>
  );
};

export default MainHeader;
