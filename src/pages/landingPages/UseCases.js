import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './UseCases.css';
import './styles/marketing-layout.css';
import MarketingLayout from './components/MarketingLayout';
import MarketingFooter from './components/MarketingFooter';
import { useCases, useCasesHub } from './content/useCases';

export default function UseCases() {
  const navigate = useNavigate();

  return (
    <MarketingLayout className="use-cases-page">
      <header className="use-cases-hero">
        <p className="use-cases-eyebrow">Use cases</p>
        <h1 className="use-cases-title">{useCasesHub.h1}</h1>
        <p className="use-cases-lede">{useCasesHub.lede}</p>
      </header>

      <section className="use-cases-grid" aria-label="CommunityView use cases">
        {useCases.map((item) => (
          <Link
            key={item.slug}
            to={`/use-cases/${item.slug}`}
            className="use-case-card"
          >
            <div className="use-case-card-media">
              <img src={item.image} alt={item.imageAlt} />
            </div>
            <div className="use-case-card-body">
              <h2>{item.cardTitle}</h2>
              <p>{item.cardBlurb}</p>
              <span className="use-case-card-link">
                Read more
                <span aria-hidden="true"> →</span>
              </span>
            </div>
          </Link>
        ))}
      </section>

      <section className="use-cases-cta">
        <h2>Ready to try it on a listing?</h2>
        <p>Start a free trial and run parcel search, maps, and tours in one place.</p>
        <div className="use-case-hero-actions" style={{ justifyContent: 'center' }}>
          <button type="button" className="use-cases-cta-btn" onClick={() => navigate('/signup')}>
            Start free trial
            <span aria-hidden="true"> →</span>
          </button>
          <button
            type="button"
            className="use-cases-secondary-btn"
            onClick={() => navigate('/compare/land-id')}
          >
            Compare vs Land id
          </button>
        </div>
      </section>

      <MarketingFooter />
    </MarketingLayout>
  );
}
