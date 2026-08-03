import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import './UseCases.css';
import './styles/marketing-layout.css';
import MarketingLayout from './components/MarketingLayout';
import MarketingFooter from './components/MarketingFooter';
import { getUseCaseBySlug, useCases } from './content/useCases';

export default function UseCasePage() {
  const { slug } = useParams();
  const useCase = getUseCaseBySlug(slug);

  if (!useCase) {
    return <Navigate to="/use-cases" replace />;
  }

  const others = useCases.filter((item) => item.slug !== useCase.slug);
  const faqs = useCase.faqs || [];

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
          <Link className="use-cases-cta-btn" to="/signup">
            {useCase.ctaLabel}
            <span aria-hidden="true"> →</span>
          </Link>
          <Link className="use-cases-secondary-btn" to="/pricing">
            View pricing
          </Link>
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
        {useCase.sections.map((section, index) => (
          <React.Fragment key={section.heading}>
            <section className="use-case-section">
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
            </section>
            {index === 1 && (
              <aside className="use-case-mid-cta" aria-label="Get started">
                <p>Ready to try this on a live parcel?</p>
                <Link className="use-cases-cta-btn" to="/signup">
                  Start free trial
                  <span aria-hidden="true"> →</span>
                </Link>
              </aside>
            )}
          </React.Fragment>
        ))}
      </article>

      {faqs.length > 0 && (
        <section className="use-case-faq" aria-labelledby="use-case-faq-heading">
          <h2 id="use-case-faq-heading">Frequently asked questions</h2>
          <dl className="use-case-faq-list">
            {faqs.map((item) => (
              <div key={item.question} className="use-case-faq-item">
                <dt>{item.question}</dt>
                <dd>{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="use-cases-cta use-case-detail-cta">
        <h2>Try this on your next listing</h2>
        <p>Start a free trial and run it yourself.</p>
        <Link className="use-cases-cta-btn" to="/signup">
          Start free trial
          <span aria-hidden="true"> →</span>
        </Link>
      </section>

      <section className="use-case-more" aria-label="More use cases">
        <h2>More ways agents use Community View</h2>
        <div className="use-case-more-links">
          {others.map((item) => (
            <Link key={item.slug} to={`/use-cases/${item.slug}`}>
              {item.cardTitle}
            </Link>
          ))}
          <Link to="/compare/land-id">Community View vs Land id</Link>
        </div>
      </section>

      <MarketingFooter />
    </MarketingLayout>
  );
}
