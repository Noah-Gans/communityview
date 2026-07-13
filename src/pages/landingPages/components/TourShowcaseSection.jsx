import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sampleTourPath } from '../content/messaging';
import './TourShowcaseSection.css';

export default function TourShowcaseSection({
  id,
  title,
  subtitle,
  bullets = [],
  videoSrc,
  posterSrc,
  videoLabel,
  reversed = false,
  showLiveExample = false,
  lead = false,
}) {
  const navigate = useNavigate();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const handler = (e) => setReduceMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <section
      id={id}
      className={`tour-showcase marketing-section${reversed ? ' tour-showcase--reversed' : ''}${lead ? ' tour-showcase--lead' : ''}`}
      aria-label={videoLabel || title}
    >
      <div className="tour-showcase__inner">
        <div className="tour-showcase__copy">
          <h2 className="tour-showcase__title">{title}</h2>
          <p className="tour-showcase__subtitle">{subtitle}</p>
          {bullets.length > 0 && (
            <ul className="tour-showcase__bullets">
              {bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
          <div className="tour-showcase__actions">
            <button type="button" className="cta-button" onClick={() => navigate('/signup')}>
              Create your tour
              <span aria-hidden="true">→</span>
            </button>
            {showLiveExample && sampleTourPath ? (
              <button
                type="button"
                className="cta-button cta-button--secondary"
                onClick={() => navigate(sampleTourPath)}
              >
                See live example
                <span aria-hidden="true">→</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="tour-showcase__media-wrap">
          <div className="tour-showcase__media-offset">
            <div className="tour-showcase__media-frame">
              {reduceMotion ? (
                <img
                  src={posterSrc || videoSrc}
                  alt=""
                  className="tour-showcase__poster"
                  loading="lazy"
                />
              ) : (
                <video
                  className="tour-showcase__video"
                  src={videoSrc}
                  poster={posterSrc}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label={videoLabel || title}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
