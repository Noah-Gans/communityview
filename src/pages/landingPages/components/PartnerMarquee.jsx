import React from 'react';
import { partnerLogos, partnersSectionTitle } from '../content/partners';
import './PartnerMarquee.css';

export default function PartnerMarquee({ title = partnersSectionTitle }) {
  const logos = [...partnerLogos, ...partnerLogos];

  return (
    <>
      <h3 className="partner-logos-title">{title}</h3>
      <div className="stats-banner">
        <div className="stats-banner-container">
          <div className="partner-logos-carousel">
            <div className="partner-logos-track">
              {logos.map((logo, index) => (
                <div
                  key={`${logo.src}-${index}`}
                  className={`partner-logo-item${logo.withBg ? ' partner-logo-with-bg' : ''}`}
                >
                  <img src={logo.src} alt={logo.alt} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
