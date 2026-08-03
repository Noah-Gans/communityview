import React from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import './UseCases.css';
import './styles/marketing-layout.css';
import MarketingLayout from './components/MarketingLayout';
import MarketingFooter from './components/MarketingFooter';
import { getUseCaseBySlug, useCases } from './content/useCases';

export default function UseCasePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const useCase = getUseCaseBySlug(slug);

  if (!useCase) {
    return <Navigate to="/use-cases" replace />;
  }

  const others = useCases.filter((item) => item.slug !== useCase.slug);

  return (
    <MarketingLayout className="use-cases-page use-case-detail">
      <nav className="use-case-breadcrumb" aria-label="Breadcrumb">
        <Link to="/use-cases">Use cases</Link>
        <span aria-hidden="true"> / </span>
        <span>{useCase.navLabel}</span>
      </nav>

      <header className="use-case-detail-hero">
        <h1 className="use-cases-title">{useCase.h1}</h1>
        <p className="use-cases-lede">{useCase.lede}</p>
        <div className="use-case-hero-actions">
          <button
            type="button"
            className="use-cases-cta-btn"
            onClick={() => navigate('/signup')}
          >
            {useCase.ctaLabel}
            <span aria-hidden="true"> →</span>
          </button>
          <button
            type="button"
            className="use-cases-secondary-btn"
            onClick={() => navigate('/pricing')}
          >
            View pricing
          </button>
        </div>
      </header>

      <figure className="use-case-hero-figure">
        <img src={useCase.image} alt={useCase.imageAlt} />
      </figure>

      <ul className="use-case-highlights" aria-label="Highlights">
        {useCase.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>

      <article className="use-case-article">
        {useCase.sections.map((section) => (
          <section key={section.heading} className="use-case-section">
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </article>

      <section className="use-cases-cta use-case-detail-cta">
        <h2>Try this on your next listing</h2>
        <p>Start a free trial and run it yourself.</p>
        <button type="button" className="use-cases-cta-btn" onClick={() => navigate('/signup')}>
          Start free trial
          <span aria-hidden="true"> →</span>
        </button>
      </section>

      <section className="use-case-more" aria-label="More use cases">
        <h2>More ways agents use CommunityView</h2>
        <div className="use-case-more-links">
          {others.map((item) => (
            <Link key={item.slug} to={`/use-cases/${item.slug}`}>
              {item.cardTitle}
            </Link>
          ))}
          <Link to="/compare/land-id">CommunityView vs Land id</Link>
        </div>
      </section>

      <MarketingFooter />
    </MarketingLayout>
  );
}
