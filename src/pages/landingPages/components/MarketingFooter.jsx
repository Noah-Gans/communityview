import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function MarketingFooter() {
  const navigate = useNavigate();

  return (
    <footer className="intro-footer">
      <div className="footer-content">
        <div className="footer-brand">
          <div className="footer-logo-container">
            <img src="/logo.png" alt="Community View Logo" className="footer-logo-image" />
          </div>
          <p>Maps and property tours for agents</p>
        </div>
        <div className="footer-links">
          <button type="button" className="footer-button" onClick={() => navigate('/pricing')}>
            Pricing
          </button>
          <button type="button" className="footer-button" onClick={() => navigate('/use-cases')}>
            Use cases
          </button>
          <button type="button" className="footer-button" onClick={() => navigate('/compare/land-id')}>
            vs Land id
          </button>
          <button type="button" className="footer-button" onClick={() => navigate('/faq')}>
            FAQ
          </button>
          <button type="button" className="footer-button" onClick={() => navigate('/features')}>
            Features
          </button>
          <a
            className="footer-button"
            href="mailto:noahgans@communityview.ai"
            target="_blank"
            rel="noopener noreferrer"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
