import React from 'react';
import {
  IconUser,
  IconCreditCard,
  IconLock,
  IconPalette,
  IconCompass,
  IconLogOut,
  IconChevronRight,
} from './AccountMenuIcons';
import './AccountMenuDropdown.css';

const MenuItem = ({ icon, label, hint, onClick, variant }) => (
  <button
    type="button"
    className={`account-menu-item${variant ? ` account-menu-item--${variant}` : ''}`}
    onClick={onClick}
  >
    <span className="account-menu-item-icon">{icon}</span>
    <span className="account-menu-item-label">{label}</span>
    {hint && <span className="account-menu-item-hint">{hint}</span>}
    {!hint && variant !== 'danger' && (
      <span className="account-menu-item-chevron">
        <IconChevronRight />
      </span>
    )}
  </button>
);

const MenuDivider = () => <div className="account-menu-divider" role="separator" />;

const subscriptionHint = (subscriptionStatus, hasActiveSubscription) => {
  if (!hasActiveSubscription) return 'Subscribe';
  if (subscriptionStatus === 'plus' || subscriptionStatus === 'active') return 'Plus';
  if (subscriptionStatus === 'regular') return 'Regular';
  return 'Active';
};

const AccountMenuDropdown = ({
  user,
  subscriptionStatus,
  hasActiveSubscription,
  onOpenAccountSettings,
  onOpenMapPreferences,
  onOpenSubscription,
  onSubscribe,
  onChangePassword,
  onQuickTour,
  onSignOut,
}) => {
  const subHint = subscriptionHint(subscriptionStatus, hasActiveSubscription);

  return (
    <div className="account-menu-dropdown" role="menu" aria-label="Account menu">
      <p className="account-menu-title">Account menu</p>
      <p className="account-menu-email" title={user?.email}>
        {user?.email}
      </p>

      <MenuItem
        icon={<IconUser />}
        label="Account settings"
        onClick={onOpenAccountSettings}
      />
      <MenuItem
        icon={<IconCreditCard />}
        label="Subscription"
        hint={subHint}
        onClick={hasActiveSubscription ? onOpenSubscription : onSubscribe}
      />
      <MenuItem
        icon={<IconLock />}
        label="Change password"
        onClick={onChangePassword}
      />

      <MenuDivider />

      <MenuItem
        icon={<IconPalette />}
        label="Highlight settings"
        onClick={onOpenMapPreferences}
      />
      <MenuItem
        icon={<IconCompass />}
        label="Quick tour"
        onClick={onQuickTour}
      />

      <MenuDivider />

      <MenuItem
        icon={<IconLogOut />}
        label="Sign out"
        onClick={onSignOut}
        variant="danger"
      />
    </div>
  );
};

export default AccountMenuDropdown;
