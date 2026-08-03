import React from 'react';
import { Link } from 'react-router-dom';
import { mapBuilder } from '../../content/messaging';
import './HomeSections.css';

export default function MapBuilderSection() {
  return (
    <section id="listing-maps" className="marketing-section map-builder-section">
      <div className="map-builder-inner">
        <div className="map-builder-image-wrap">
          <img
            src={mapBuilder.imageSrc}
            alt={mapBuilder.imageAlt}
            className="map-builder-image"
            loading="lazy"
          />
        </div>
        <div className="map-builder-copy">
          <h2 className="marketing-section-title">{mapBuilder.title}</h2>
          <p className="marketing-section-subtitle">{mapBuilder.subtitle}</p>
          {mapBuilder.bullets?.length > 0 && (
            <ul className="map-builder-bullets">
              {mapBuilder.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
          {mapBuilder.links?.length > 0 && (
            <p className="marketing-section-links">
              {mapBuilder.links.map((link, index) => (
                <React.Fragment key={link.to}>
                  {index > 0 ? <span aria-hidden="true"> · </span> : null}
                  <Link to={link.to}>{link.label}</Link>
                </React.Fragment>
              ))}
            </p>
          )}
          <Link className="cta-button map-builder-cta" to="/signup">
            Create a listing map
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
