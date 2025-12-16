import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './FAQ.css';

const FAQ = () => {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="faq-page">
      {/* Hero Section */}
      <div className="faq-hero">
        <h1 className="faq-main-title">Frequently Asked Questions</h1>
        <p className="faq-subtitle">
          Find answers to common questions about Community View
        </p>
      </div>

      {/* FAQ Section */}
      <div className="faq-content">
        <div className="faq-grid">
          <div className="faq-item">
            <h4>What payment methods do you accept?</h4>
            <p>We accept all major credit cards and debit cards through our secure Stripe payment processing.</p>
          </div>
          <div className="faq-item">
            <h4>Can I cancel anytime?</h4>
            <p>Yes, you can cancel your subscription at any time. You'll retain access until the end of your billing period.</p>
          </div>
          <div className="faq-item">
            <h4>How often is the data updated?</h4>
            <p>All paid plans include daily updates directly from county sources, ensuring you always have the most current data.</p>
          </div>
          <div className="faq-item">
            <h4>Can I switch between plans?</h4>
            <p>Yes, you can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle.</p>
          </div>
          <div className="faq-item">
            <h4>What counties are covered?</h4>
            <p>We currently serve Teton County with plans to expand to additional counties. Contact us for more information.</p>
          </div>
          <div className="faq-item">
            <h4>Do you offer refunds?</h4>
            <p>We offer a 30-day money-back guarantee. If you're not satisfied, contact us for a full refund within 30 days of purchase.</p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="faq-cta">
        <h2 className="cta-title">Still have questions?</h2>
        <p className="cta-description">
          Get in touch with our team for personalized assistance
        </p>
        <div className="cta-buttons">
          <button 
            className="cta-button primary"
            onClick={() => window.location.href = 'mailto:noahgans@tetoncountygis.com?subject=Question'}
          >
            Contact Us
            <span className="button-arrow">→</span>
          </button>
          <button 
            className="cta-button secondary"
            onClick={() => navigate('/pricing')}
          >
            View Pricing
            <span className="button-arrow">→</span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="intro-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="footer-logo-container">
              <img src="/logo.png" alt="Community View Logo" className="footer-logo-image" />
            </div>
            <p>Spatial GIS Solutions</p>
          </div>
          <div className="footer-links">
            <button className="footer-button" onClick={() => navigate('/pricing')}>Pricing</button>
            <button className="footer-button" onClick={() => navigate('/faq')}>FAQ</button>
            {!isMobile && (
              <button className="footer-button" onClick={() => navigate('/updates')}>Updates</button>
            )}
            <button className="footer-button" onClick={() => navigate('/features')}>Features</button>
            <a className="footer-button" href="mailto:noahgans@tetoncountygis.com" target="_blank" rel="noopener noreferrer">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default FAQ;

