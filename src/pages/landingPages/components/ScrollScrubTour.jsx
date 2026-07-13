import React from 'react';
import TourShowcaseSection from './TourShowcaseSection';
import { propertyTourShowcase, amenitiesTourShowcase } from '../content/messaging';

export default function ScrollScrubTour() {
  return (
    <>
      <TourShowcaseSection
        id="tours"
        lead
        title={propertyTourShowcase.title}
        subtitle={propertyTourShowcase.subtitle}
        bullets={propertyTourShowcase.bullets}
        videoSrc={propertyTourShowcase.videoSrc}
        videoLabel={propertyTourShowcase.videoLabel}
        showLiveExample
      />
      <TourShowcaseSection
        id="tour-amenities"
        title={amenitiesTourShowcase.title}
        subtitle={amenitiesTourShowcase.subtitle}
        bullets={amenitiesTourShowcase.bullets}
        videoSrc={amenitiesTourShowcase.videoSrc}
        videoLabel={amenitiesTourShowcase.videoLabel}
        reversed
      />
    </>
  );
}
