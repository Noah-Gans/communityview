import React from 'react';
import { howItWorks } from '../../content/messaging';
import './HomeSections.css';

export default function HowItWorksSection() {
  return (
    <section className="marketing-section how-it-works-section">
      <h2 className="marketing-section-title">{howItWorks.title}</h2>
      <div className="how-it-works-grid">
        {howItWorks.steps.map((step, index) => (
          <div key={step.title} className="how-it-works-step">
            <span className="how-it-works-num">{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
