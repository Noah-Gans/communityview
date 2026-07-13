import React from 'react';
import { useNavigate } from 'react-router-dom';
import './FAQ.css';
import './styles/marketing-layout.css';
import MarketingLayout from './components/MarketingLayout';
import MarketingFooter from './components/MarketingFooter';
import { faqItems, faqPageHero } from './content/faq';

const FAQ = () => {
  const navigate = useNavigate();

  return (
    <MarketingLayout className="faq-page">
      <div className="faq-hero">
        <h1 className="faq-main-title">{faqPageHero.title}</h1>
        <p className="faq-subtitle">{faqPageHero.subtitle}</p>
      </div>

      <div className="faq-content">
        <div className="faq-grid">
          {faqItems.map((item) => (
            <div key={item.question} className="faq-item">
              <h4>{item.question}</h4>
              <p>{item.answer}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="faq-cta">
        <h2 className="cta-title">Still have questions?</h2>
        <p className="cta-description">Get in touch with our team for personalized assistance</p>
        <div className="cta-buttons">
          <button
            type="button"
            className="cta-button primary"
            onClick={() => {
              window.location.href = 'mailto:noahgans@communityview.ai?subject=Question';
            }}
          >
            Contact Us
            <span className="button-arrow">→</span>
          </button>
          <button type="button" className="cta-button secondary" onClick={() => navigate('/pricing')}>
            View Pricing
            <span className="button-arrow">→</span>
          </button>
        </div>
      </div>

      <MarketingFooter />
    </MarketingLayout>
  );
};

export default FAQ;
