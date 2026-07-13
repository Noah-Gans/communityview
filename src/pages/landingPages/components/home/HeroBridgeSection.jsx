import React from 'react';
import { heroPeek } from '../../content/messaging';
import { scrollToElementId } from '../../hooks/useMarketing';
import './HeroBridgeSection.css';

export default function HeroBridgeSection() {
  return (
    <div className="hero-bridge" aria-labelledby="hero-bridge-title">
      <div className="hero-bridge__intro">
        <h2 id="hero-bridge-title" className="hero-bridge__title">
          {heroPeek.title}
        </h2>
        <p className="hero-bridge__subtitle">{heroPeek.subtitle}</p>
      </div>

      <div className="hero-bridge__cards">
        {heroPeek.pillars.map((pillar) => (
          <button
            key={pillar.id}
            type="button"
            className="hero-bridge__card"
            onClick={() => scrollToElementId(pillar.scrollTarget)}
          >
            <span className="hero-bridge__card-label">{pillar.label}</span>
            <span className="hero-bridge__card-title">{pillar.title}</span>
            <span className="hero-bridge__card-body">{pillar.body}</span>
            <span className="hero-bridge__card-arrow" aria-hidden="true">
              →
            </span>
          </button>
        ))}
      </div>

      {heroPeek.navLinks?.length > 0 && (
        <nav className="hero-bridge__nav" aria-label="Jump to section">
          {heroPeek.navLinks.map((link) => (
            <button
              key={link.target}
              type="button"
              className="hero-bridge__nav-link"
              onClick={() => scrollToElementId(link.target)}
            >
              {link.label}
            </button>
          ))}
        </nav>
      )}

      <button
        type="button"
        className="hero-bridge__scroll-btn"
        onClick={() => scrollToElementId('tours')}
      >
        {heroPeek.scrollCue}
        <span className="hero-bridge__scroll-arrow" aria-hidden="true">
          ↓
        </span>
      </button>
    </div>
  );
}
