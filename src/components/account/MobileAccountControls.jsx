import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../../contexts/UserContext';
import { useTutorialWalkthrough } from '../../contexts/TutorialWalkthroughContext';
import AccountMenuDropdown from './AccountMenuDropdown';
import AccountSettingsPanel from './AccountSettingsPanel';
import './MobileAccountControls.css';

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 20c0-3.866 3.134-7 7-7s7 3.134 7 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function MobileAccountControls({ className = '' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, deleteAccount, subscriptionStatus } = useUser();
  const { start: startWalkthrough } = useTutorialWalkthrough();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [accountSettingsSection, setAccountSettingsSection] = useState('overview');
  const [showDeleteConfirmPopup, setShowDeleteConfirmPopup] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const rootRef = useRef(null);

  const hasActiveSubscription =
    subscriptionStatus === 'active' ||
    subscriptionStatus === 'plus' ||
    subscriptionStatus === 'regular';

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!rootRef.current?.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
    return undefined;
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!isDropdownOpen) return undefined;

    const handleMapInteraction = () => {
      setIsDropdownOpen(false);
    };

    window.addEventListener('map-user-interaction', handleMapInteraction);
    document.addEventListener('map-user-interaction', handleMapInteraction);
    return () => {
      window.removeEventListener('map-user-interaction', handleMapInteraction);
      document.removeEventListener('map-user-interaction', handleMapInteraction);
    };
  }, [isDropdownOpen]);

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

  const handleLogout = async () => {
    try {
      await logout();
      setIsDropdownOpen(false);
    } catch (error) {
      console.error('Error during logout:', error.message);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
      setIsDropdownOpen(false);
      setShowDeleteConfirmPopup(false);
      navigate('/');
    } catch (error) {
      alert(`Failed to delete account: ${error.message || 'Unknown error'}`);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (!user) return null;

  return (
    <>
      <div className={`mobile-account-controls${className ? ` ${className}` : ''}`} ref={rootRef}>
        <button
          type="button"
          className={`mobile-account-controls-btn${isDropdownOpen ? ' is-open' : ''}`}
          aria-label="Account"
          aria-expanded={isDropdownOpen}
          onClick={(e) => {
            e.stopPropagation();
            setIsDropdownOpen((open) => !open);
          }}
        >
          <PersonIcon />
        </button>
        {isDropdownOpen && (
          <div className="mobile-account-controls-menu">
            <AccountMenuDropdown
              user={user}
              subscriptionStatus={subscriptionStatus}
              hasActiveSubscription={hasActiveSubscription}
              onOpenAccountSettings={() => {
                setIsDropdownOpen(false);
                setAccountSettingsSection('overview');
                setShowAccountSettings(true);
              }}
              onOpenMapPreferences={() => {
                setIsDropdownOpen(false);
                setAccountSettingsSection('preferences');
                setShowAccountSettings(true);
              }}
              onOpenSubscription={() => {
                setIsDropdownOpen(false);
                setAccountSettingsSection('subscription');
                setShowAccountSettings(true);
              }}
              onSubscribe={() => {
                setIsDropdownOpen(false);
                navigate('/signup');
              }}
              onChangePassword={() => {
                setIsDropdownOpen(false);
                navigate('/reset-password');
              }}
              onQuickTour={() => {
                setIsDropdownOpen(false);
                startWalkthrough();
              }}
              onSignOut={handleLogout}
            />
          </div>
        )}
      </div>

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
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
              <button
                type="button"
                className="dropdown-button"
                onClick={() => setShowDeleteConfirmPopup(false)}
                disabled={isDeletingAccount}
              >
                Cancel
              </button>
              <button
                type="button"
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
