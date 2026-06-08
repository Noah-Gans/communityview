import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebase/firebaseConfig';
import { useUser } from '../../contexts/UserContext';
import {
  IconUser,
  IconCreditCard,
  IconLock,
  IconPalette,
  IconCompass,
  IconLogOut,
} from './AccountMenuIcons';
import AccountSubscriptionSettings from './AccountSubscriptionSettings';
import AccountProfileSettings from './AccountProfileSettings';
import './AccountSettingsPanel.css';

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: IconUser },
  { id: 'subscription', label: 'Subscription', icon: IconCreditCard },
  { id: 'profile', label: 'Profile', icon: IconUser },
  { id: 'security', label: 'Security', icon: IconLock },
  { id: 'preferences', label: 'Map preferences', icon: IconPalette },
  { id: 'help', label: 'Help', icon: IconCompass },
];

const hexToRgba = (hex, alpha) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const tierLabel = (status) => {
  if (status === 'plus' || status === 'active') return 'Plus';
  if (status === 'regular') return 'Regular';
  if (status === 'canceled') return 'Canceled';
  return 'Free';
};

const NavItem = ({ section, isActive, onClick, hint }) => {
  const Icon = section.icon;
  return (
    <button
      type="button"
      className={`account-settings-nav-item${isActive ? ' active' : ''}`}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
    >
      <span className="account-settings-nav-icon">
        <Icon />
      </span>
      <span className="account-settings-nav-label">{section.label}</span>
      {hint && <span className="account-settings-nav-hint">{hint}</span>}
    </button>
  );
};

const DEFAULT_HIGHLIGHT = {
  fillColor: '#2aff21',
  fillOpacity: 0.25,
  outlineColor: '#ff8a00',
  lineWidth: 3,
};

const AccountSettingsPanel = ({
  onClose,
  initialSection = 'overview',
  onQuickTour,
  onSignOut,
  onDeleteAccount,
}) => {
  const navigate = useNavigate();
  const { user, subscriptionStatus, highlightSettings, setHighlightSettings } = useUser();
  const [activeSection, setActiveSection] = useState(initialSection);
  const [profileSummary, setProfileSummary] = useState({
    firstName: '',
    lastName: '',
    profilePhotoUrl: '',
    contactEmail: '',
  });
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState('');
  const [fillColor, setFillColor] = useState(DEFAULT_HIGHLIGHT.fillColor);
  const [fillOpacity, setFillOpacity] = useState(DEFAULT_HIGHLIGHT.fillOpacity);
  const [outlineColor, setOutlineColor] = useState(DEFAULT_HIGHLIGHT.outlineColor);
  const [lineWidth, setLineWidth] = useState(DEFAULT_HIGHLIGHT.lineWidth);
  const [highlightSaving, setHighlightSaving] = useState(false);
  const [highlightMessage, setHighlightMessage] = useState('');

  const hasActiveSubscription =
    subscriptionStatus === 'active' ||
    subscriptionStatus === 'plus' ||
    subscriptionStatus === 'regular';

  const subscriptionHint = hasActiveSubscription
    ? tierLabel(subscriptionStatus)
    : 'Subscribe';

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const loadProfileSummary = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const data = snap.data();
        setProfileSummary({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          profilePhotoUrl: data.profilePhotoUrl || '',
          contactEmail: data.contactEmail || data.email || user.email || '',
        });
      }
    } catch (err) {
      console.error('Failed to load profile summary:', err);
    }
  }, [user?.uid, user?.email]);

  const loadSubscription = useCallback(async () => {
    setDetailsLoading(true);
    setDetailsError('');
    try {
      const functions = getFunctions();
      const getSubscriptionDetails = httpsCallable(functions, 'getSubscriptionDetails');
      const result = await getSubscriptionDetails({});
      setDetails(result.data);
    } catch (err) {
      console.error('Failed to load subscription:', err);
      setDetailsError(
        err.message || 'Could not load subscription details. Please try again.'
      );
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfileSummary();
    loadSubscription();
  }, [loadProfileSummary, loadSubscription]);

  useEffect(() => {
    loadSubscription();
  }, [subscriptionStatus, loadSubscription]);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (activeSection !== 'preferences') return;
    setFillColor(highlightSettings?.fillColor || DEFAULT_HIGHLIGHT.fillColor);
    setFillOpacity(
      highlightSettings?.fillOpacity ?? DEFAULT_HIGHLIGHT.fillOpacity
    );
    setOutlineColor(
      highlightSettings?.lineColor ||
        highlightSettings?.fillOutlineColor ||
        DEFAULT_HIGHLIGHT.outlineColor
    );
    setLineWidth(highlightSettings?.lineWidth ?? DEFAULT_HIGHLIGHT.lineWidth);
    setHighlightMessage('');
  }, [activeSection, highlightSettings]);

  const handleSaveHighlightSettings = async () => {
    setHighlightSaving(true);
    setHighlightMessage('');
    try {
      const newSettings = {
        fillColor,
        fillOpacity: parseFloat(fillOpacity),
        fillOutlineColor: outlineColor,
        lineColor: outlineColor,
        lineWidth: parseFloat(lineWidth),
      };
      await setHighlightSettings(newSettings);
      setHighlightMessage('Highlight settings saved.');
      setTimeout(() => {
        if (window.updateExistingHighlights) {
          window.updateExistingHighlights();
        }
      }, 500);
    } catch {
      setHighlightMessage('Could not save highlight settings. Please try again.');
    } finally {
      setHighlightSaving(false);
    }
  };

  const displayName =
    [profileSummary.firstName, profileSummary.lastName].filter(Boolean).join(' ') ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'Account';

  const overviewEmail = profileSummary.contactEmail || user?.email;

  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const stripeInfo = details?.stripe;
  const planTier =
    stripeInfo?.tier ||
    details?.firestorePlan?.tier ||
    tierLabel(subscriptionStatus);
  const billingInterval =
    stripeInfo?.interval || details?.firestorePlan?.interval;
  const amountDisplay =
    stripeInfo?.amountDisplay || details?.firestorePlan?.amountDisplay;

  const handleChangePassword = () => {
    onClose();
    navigate('/reset-password');
  };

  const sectionTitle = {
    overview: 'Overview',
    subscription: 'Subscription',
    profile: 'Profile',
    security: 'Security',
    preferences: 'Map preferences',
    help: 'Help',
    account: 'Account actions',
  };

  const renderProfileCard = () => (
    <div className="account-settings-profile-card">
      <div
        className={`account-settings-avatar${
          profileSummary.profilePhotoUrl ? ' account-settings-avatar--photo' : ''
        }`}
        aria-hidden={profileSummary.profilePhotoUrl ? undefined : true}
      >
        {profileSummary.profilePhotoUrl ? (
          <img src={profileSummary.profilePhotoUrl} alt="" />
        ) : (
          initials
        )}
      </div>
      <div className="account-settings-profile-meta">
        <strong>{displayName}</strong>
        <span>{overviewEmail}</span>
        <span
          className={`account-settings-badge ${
            hasActiveSubscription ? 'active' : 'inactive'
          }`}
        >
          {hasActiveSubscription
            ? `${planTier}${billingInterval ? ` · ${billingInterval}` : ''}`
            : 'No active subscription'}
        </span>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <>
            {renderProfileCard()}
            <p className="account-settings-lead">
              Manage your Community View account, billing, and map preferences from
              the sections on the left.
            </p>
            <div className="account-settings-quick-links">
              <button
                type="button"
                className="account-settings-quick-link"
                onClick={() => setActiveSection('subscription')}
              >
                <IconCreditCard />
                <span>View subscription</span>
              </button>
              <button
                type="button"
                className="account-settings-quick-link"
                onClick={() => setActiveSection('profile')}
              >
                <IconUser />
                <span>Edit profile</span>
              </button>
              <button
                type="button"
                className="account-settings-quick-link"
                onClick={() => setActiveSection('preferences')}
              >
                <IconPalette />
                <span>Highlight settings</span>
              </button>
            </div>
          </>
        );

      case 'subscription':
        return (
          <>
            <p className="account-settings-lead">
              Your plan, billing cycle, and payment method on file.
            </p>
            <AccountSubscriptionSettings
              details={details}
              detailsLoading={detailsLoading}
              detailsError={detailsError}
              onReload={loadSubscription}
            />
          </>
        );

      case 'profile':
        return (
          <AccountProfileSettings
            user={user}
            onProfileUpdated={(profile) =>
              setProfileSummary({
                firstName: profile.firstName || '',
                lastName: profile.lastName || '',
                profilePhotoUrl: profile.profilePhotoUrl || '',
                contactEmail: profile.contactEmail || user?.email || '',
              })
            }
          />
        );

      case 'security':
        return (
          <>
            <p className="account-settings-lead">
              Reset your password using a secure link sent to your email.
            </p>
            <button
              type="button"
              className="account-settings-btn account-settings-btn--secondary account-settings-btn--inline"
              onClick={handleChangePassword}
            >
              Change password
            </button>
          </>
        );

      case 'preferences':
        return (
          <>
            <p className="account-settings-lead">
              Customize how selected parcels appear on the map.
            </p>
            <div className="account-settings-highlight-panel">
              <div className="account-settings-highlight-preview">
                <div
                  className="account-settings-highlight-preview-canvas"
                  aria-hidden="true"
                >
                  <div
                    className="account-settings-highlight-preview-shape"
                    style={{
                      backgroundColor: hexToRgba(fillColor, fillOpacity),
                      borderColor: outlineColor,
                      borderWidth: `${lineWidth}px`,
                    }}
                  />
                </div>
                <p className="account-settings-highlight-preview-caption">
                  Live preview
                </p>
              </div>

              <div className="account-settings-highlight-fields">
                <div className="account-settings-field">
                  <label htmlFor="account-highlight-fill">Fill color</label>
                  <div className="account-settings-color-control">
                    <span
                      className="account-settings-color-swatch"
                      style={{ backgroundColor: fillColor }}
                    />
                    <span className="account-settings-color-value">
                      {fillColor.toUpperCase()}
                    </span>
                    <input
                      id="account-highlight-fill"
                      type="color"
                      value={fillColor}
                      onChange={(e) => setFillColor(e.target.value)}
                      className="account-settings-color-input"
                      aria-label="Choose fill color"
                    />
                  </div>
                </div>

                <div className="account-settings-field">
                  <div className="account-settings-slider-header">
                    <label htmlFor="account-highlight-opacity">Fill opacity</label>
                    <span className="account-settings-slider-value">
                      {Math.round(fillOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    id="account-highlight-opacity"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={fillOpacity}
                    onChange={(e) => setFillOpacity(parseFloat(e.target.value))}
                    className="account-settings-range"
                  />
                </div>

                <div className="account-settings-field">
                  <label htmlFor="account-highlight-outline">Outline color</label>
                  <div className="account-settings-color-control">
                    <span
                      className="account-settings-color-swatch"
                      style={{ backgroundColor: outlineColor }}
                    />
                    <span className="account-settings-color-value">
                      {outlineColor.toUpperCase()}
                    </span>
                    <input
                      id="account-highlight-outline"
                      type="color"
                      value={outlineColor}
                      onChange={(e) => setOutlineColor(e.target.value)}
                      className="account-settings-color-input"
                      aria-label="Choose outline color"
                    />
                  </div>
                </div>

                <div className="account-settings-field account-settings-field--last">
                  <div className="account-settings-slider-header">
                    <label htmlFor="account-highlight-width">Outline width</label>
                    <span className="account-settings-slider-value">
                      {lineWidth}px
                    </span>
                  </div>
                  <input
                    id="account-highlight-width"
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={lineWidth}
                    onChange={(e) => setLineWidth(parseInt(e.target.value, 10))}
                    className="account-settings-range"
                  />
                </div>
              </div>
            </div>
            {highlightMessage && (
              <p
                className={`account-settings-feedback ${
                  highlightMessage.includes('saved') ? 'success' : 'error'
                }`}
              >
                {highlightMessage}
              </p>
            )}
            <button
              type="button"
              className="account-settings-btn account-settings-btn--primary account-settings-btn--inline"
              onClick={handleSaveHighlightSettings}
              disabled={highlightSaving}
            >
              {highlightSaving ? 'Saving…' : 'Save highlight settings'}
            </button>
          </>
        );

      case 'help':
        return (
          <>
            <p className="account-settings-lead">
              Take a short guided tour of maps, search, and reports.
            </p>
            <button
              type="button"
              className="account-settings-btn account-settings-btn--secondary account-settings-btn--inline"
              onClick={() => {
                onClose();
                onQuickTour();
              }}
            >
              Start quick tour
            </button>
          </>
        );

      case 'account':
        return (
          <>
            <p className="account-settings-lead">
              Sign out on this device or permanently delete your account.
            </p>
            <button
              type="button"
              className="account-settings-btn account-settings-btn--secondary account-settings-btn--inline"
              onClick={() => {
                onClose();
                onSignOut();
              }}
            >
              Sign out
            </button>
            <button
              type="button"
              className="account-settings-btn account-settings-btn--danger account-settings-btn--inline"
              onClick={() => {
                onClose();
                onDeleteAccount();
              }}
            >
              Delete account
            </button>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="account-settings-fullscreen" role="dialog" aria-modal="true">
      <header className="account-settings-topbar">
        <div className="account-settings-topbar-text">
          <h1 id="account-settings-title">Account settings</h1>
          <p>Manage your profile, billing, and preferences</p>
        </div>
        <button
          type="button"
          className="account-settings-close"
          onClick={onClose}
          aria-label="Close account settings"
        >
          ×
        </button>
      </header>

      <div className="account-settings-layout">
        <nav className="account-settings-nav" aria-label="Account sections">
          <p className="account-settings-nav-title">Account menu</p>
          <p className="account-settings-nav-email" title={user?.email}>
            {user?.email}
          </p>

          {SECTIONS.map((section) => (
            <NavItem
              key={section.id}
              section={section}
              isActive={activeSection === section.id}
              onClick={() => setActiveSection(section.id)}
              hint={section.id === 'subscription' ? subscriptionHint : undefined}
            />
          ))}

          <div className="account-settings-nav-divider" role="separator" />

          <NavItem
            section={{ id: 'account', label: 'Account actions', icon: IconLogOut }}
            isActive={activeSection === 'account'}
            onClick={() => setActiveSection('account')}
          />
        </nav>

        <main className="account-settings-main">
          <div className="account-settings-main-inner">
            <h2 className="account-settings-section-title">
              {sectionTitle[activeSection]}
            </h2>
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AccountSettingsPanel;
