import React from 'react';
import { Link } from 'react-router-dom';

export default function MarketingFooter() {
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
          <Link className="footer-button" to="/pricing">
            Pricing
          </Link>
          <Link className="footer-button" to="/use-cases">
            Use cases
          </Link>
          <Link className="footer-button" to="/compare/land-id">
            vs Land id
          </Link>
          <Link className="footer-button" to="/faq">
            FAQ
          </Link>
          <Link className="footer-button" to="/features">
            Features
          </Link>
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
