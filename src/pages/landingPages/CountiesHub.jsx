import React from 'react';
import { Link } from 'react-router-dom';
import './CountiesHub.css';
import './styles/marketing-layout.css';
import MarketingLayout from './components/MarketingLayout';
import MarketingFooter from './components/MarketingFooter';
import { FREE_COUNTY_MAPS, buildFreeCountyMapUrl } from '../../data/freeCountyMaps';

function groupByState(counties) {
  const groups = new Map();
  counties.forEach((county) => {
    if (!groups.has(county.stateName)) groups.set(county.stateName, []);
    groups.get(county.stateName).push(county);
  });
  return Array.from(groups.entries())
    .map(([stateName, list]) => ({
      stateName,
      counties: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.stateName.localeCompare(b.stateName));
}

export default function CountiesHub() {
  const stateGroups = groupByState(FREE_COUNTY_MAPS);

  return (
    <MarketingLayout className="counties-hub-page">
      <header className="counties-hub-hero">
        <p className="counties-hub-eyebrow">Free ownership maps</p>
        <h1 className="counties-hub-title">Free Property Ownership Maps by County</h1>
        <p className="counties-hub-lede">
          Explore parcel boundaries and property ownership free, county by county — no
          account required. Pick a county below to see who owns what on an interactive
          map, or sign up for full property details nationwide.
        </p>
      </header>

      <section className="counties-hub-groups" aria-label="Counties by state">
        {stateGroups.map((group) => (
          <div className="counties-hub-group" key={group.stateName}>
            <h2>{group.stateName}</h2>
            <ul>
              {group.counties.map((county) => (
                // Plain <a>, not <Link>: Map.js only reads the lat/lng/zoom URL
                // params on its own first mount, so the county needs a real page
                // load to center correctly — same path as a search-result click.
                <li key={`${county.state}-${county.slug}`}>
                  <a href={buildFreeCountyMapUrl(county)}>{county.name} Ownership Map</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="counties-hub-cta">
        <h2>Want full property details on every parcel?</h2>
        <p>Sign up for owner mailing address, APN, assessed value, and more nationwide.</p>
        <Link className="counties-hub-cta-btn" to="/signup">
          Start free trial
          <span aria-hidden="true"> →</span>
        </Link>
      </section>

      <MarketingFooter />
    </MarketingLayout>
  );
}
