import React from 'react';
import { nationwideTrust, ownershipDetails, searchBridge } from '../../content/messaging';
import './HomeSections.css';

export default function SearchBridgeSection() {
  return (
    <section className="marketing-section search-bridge-section" id="search">
      <div className="search-bridge-inner">
        <div className="search-bridge-copy">
          <h2 className="marketing-section-title">{searchBridge.title}</h2>
          <p className="marketing-section-subtitle">{searchBridge.subtitle}</p>
        </div>
        <div className="search-bridge-image-wrap">
          <img
            src={searchBridge.imageSrc}
            alt={searchBridge.imageAlt}
            className="search-bridge-image"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}

export function OwnershipDetailsSection() {
  return (
    <section id="ownership" className="marketing-section ownership-details-section">
      <div className="ownership-details-inner">
        <div className="ownership-details-copy">
          <h2 className="marketing-section-title">{ownershipDetails.title}</h2>
          <p className="marketing-section-subtitle">{ownershipDetails.subtitle}</p>
          {ownershipDetails.bullets?.length > 0 && (
            <ul className="ownership-details-bullets">
              {ownershipDetails.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="ownership-details-image-wrap">
          <img
            src={ownershipDetails.imageSrc}
            alt={ownershipDetails.imageAlt}
            className="ownership-details-image"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}

export function NationwideTrustSection() {
  return (
    <section className="marketing-section nationwide-trust-section">
      <h2 className="marketing-section-title">{nationwideTrust.title}</h2>
      <p className="marketing-section-subtitle">{nationwideTrust.subtitle}</p>
      <ul className="nationwide-trust-points">
        {nationwideTrust.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </section>
  );
}
