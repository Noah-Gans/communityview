import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './UseCases.css';
import './Compare.css';
import './styles/marketing-layout.css';
import MarketingLayout from './components/MarketingLayout';
import MarketingFooter from './components/MarketingFooter';
import { landIdCompare } from './content/compare';

export default function CompareLandId() {
  const navigate = useNavigate();
  const page = landIdCompare;

  return (
    <MarketingLayout className="use-cases-page compare-page">
      <nav className="use-case-breadcrumb" aria-label="Breadcrumb">
        <Link to="/use-cases">Use cases</Link>
        <span aria-hidden="true"> / </span>
        <span>vs {page.competitorName}</span>
      </nav>

      <header className="use-cases-hero">
        <p className="use-cases-eyebrow">Compare</p>
        <h1 className="use-cases-title">{page.h1}</h1>
        <p className="use-cases-lede">{page.lede}</p>
        <div className="use-case-hero-actions">
          <button type="button" className="use-cases-cta-btn" onClick={() => navigate('/signup')}>
            Start free trial
            <span aria-hidden="true"> →</span>
          </button>
          <button
            type="button"
            className="use-cases-secondary-btn"
            onClick={() => navigate('/use-cases')}
          >
            See use cases
          </button>
        </div>
      </header>

      <section className="compare-columns" aria-label="When to choose each">
        <div className="compare-column">
          <h2>Choose CommunityView if</h2>
          <ul>
            {page.whenCommunityView.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="compare-column">
          <h2>Choose {page.competitorName} if</h2>
          <ul>
            {page.whenLandId.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="compare-table-wrap" aria-label="Feature comparison">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col"> </th>
              <th scope="col">CommunityView</th>
              <th scope="col">{page.competitorName}</th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{row.communityView}</td>
                <td>{row.competitor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="use-cases-cta">
        <h2>{page.closingTitle}</h2>
        <p>{page.closingBody}</p>
        <button type="button" className="use-cases-cta-btn" onClick={() => navigate('/signup')}>
          Start free trial
          <span aria-hidden="true"> →</span>
        </button>
      </section>

      <MarketingFooter />
    </MarketingLayout>
  );
}
