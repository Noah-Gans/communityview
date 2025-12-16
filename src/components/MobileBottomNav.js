import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './MobileBottomNav.css';

const MobileBottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/pricing', label: 'Pricing', icon: '💰' },
    { path: '/faq', label: 'FAQ', icon: '❓' },
    { path: '/updates', label: 'Updates', icon: '📰' },
    { path: '/features', label: 'Features', icon: '⭐' },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="mobile-bottom-nav">
      {navItems.map((item) => (
        <button
          key={item.path}
          className={`mobile-nav-item ${isActive(item.path) ? 'active' : ''}`}
          onClick={() => navigate(item.path)}
          aria-label={item.label}
        >
          <span className="mobile-nav-icon">{item.icon}</span>
          <span className="mobile-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default MobileBottomNav;

