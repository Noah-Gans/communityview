import React from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';
import './styles/marketing-layout.css';
import { useMapContext } from '../MapContext';
import LinearStyleFeatureStack from '../../components/map/LinearStyleFeatureStack';
import { isNativeApp } from '../../utils/platformDetection';
import { useUser } from '../../contexts/UserContext';
import { hero, featureStackHeading, featureStackSubtitle } from './content/messaging';
import {
  homeResearchStack,
  researchMapLayers,
  researchPropertyDetails,
} from './content/features';
import { useIsMobile, scrollToElementId } from './hooks/useMarketing';
import MarketingFooter from './components/MarketingFooter';
import ScrollScrubTour from './components/ScrollScrubTour';
import SearchBridgeSection, { OwnershipDetailsSection } from './components/home/SearchBridgeSection';
import MapBuilderSection from './components/home/MapBuilderSection';
import FinalCtaSection from './components/home/FinalCtaSection';
import HeroBridgeSection from './components/home/HeroBridgeSection';

const LandingPage = ({ onStartClick }) => {
  const navigate = useNavigate();
  const { setActiveTab } = useMapContext();
  const isMobile = useIsMobile();
  const isNative = isNativeApp();
  const { user } = useUser();

  if (isNative && !user) {
    const handleLearnMore = () => {
      window.open('https://communityview.ai', '_blank', 'noopener,noreferrer');
    };

    return (
      <div className="intro intro-native">
        <div className="hero-section hero-section-native">
          <div className="hero-content hero-content-native">
            <div className="logo-container-native">
              <img
                src="/logo_transparent_no_background.png"
                alt="Community View Logo"
                className="logo-image-native"
              />
            </div>
            <div className="hero-cta-group hero-cta-group-native">
              <button type="button" className="hero-primary-btn" onClick={() => navigate('/login')}>
                <span>Sign In</span>
                <div className="btn-icon">→</div>
              </button>
            </div>
            <div className="bottom-actions">
              <div className="hero-cta-group-bottom">
                <button type="button" className="hero-secondary-btn" onClick={() => navigate('/signup')}>
                  <span>Create Account</span>
                  <div className="btn-icon">→</div>
                </button>
              </div>
              <div className="learn-more-link">
                <span>Learn more </span>
                <button type="button" className="learn-more-button" onClick={handleLearnMore}>
                  click here
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleStartExploring = () => {
    onStartClick?.();
    setActiveTab('map');
    navigate('/map');
  };

  return (
    <div className="intro marketing-page">
      <div className="hero-section">
        <div className="hero-section__main">
          <div className="hero-content">
            <h1 className="hero-title">
            <span className="catchphrase">
              <span className="catchphrase-line">{hero.catchphrase[0]}</span>
              <span className="catchphrase-line">{hero.catchphrase[1]}</span>
            </span>
            <span className="company-name">
              <span className="word-community">Community</span>
              <span className="word-view">View</span>
            </span>
          </h1>
          <p className="hero-description">{hero.description}</p>
          <div className="hero-cta-group">
            {isMobile ? (
              <>
                <button type="button" className="hero-primary-btn" onClick={() => navigate('/signup')}>
                  <span>Sign Up</span>
                  <div className="btn-icon">→</div>
                </button>
                <button
                  type="button"
                  className="hero-secondary-btn"
                  onClick={() => scrollToElementId('tours')}
                >
                  <span>See it in action</span>
                  <div className="btn-icon">→</div>
                </button>
                <a
                  className="hero-secondary-btn hero-tertiary-link"
                  href="https://apps.apple.com/us/app/community-view/id6755610726"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>Download App</span>
                  <div className="btn-icon">→</div>
                </a>
              </>
            ) : (
              <>
                <button type="button" className="hero-primary-btn" onClick={handleStartExploring}>
                  <span>Start Exploring</span>
                  <div className="btn-icon">→</div>
                </button>
                <button
                  type="button"
                  className="hero-secondary-btn"
                  onClick={() => scrollToElementId('tours')}
                >
                  <span>See it in action</span>
                  <div className="btn-icon">→</div>
                </button>
              </>
            )}
          </div>
          </div>
        </div>
        <HeroBridgeSection />
      </div>

      <div className="landing-tours-entry">
        <ScrollScrubTour />
      </div>

      <div id="research" className="feature-stack-section">
        <LinearStyleFeatureStack
          features={homeResearchStack}
          heading={featureStackHeading}
          subtitle={featureStackSubtitle}
          layerCatalog={researchMapLayers}
          detailCatalog={researchPropertyDetails}
        />
      </div>

      <SearchBridgeSection />

      <OwnershipDetailsSection />

      <MapBuilderSection />

      <FinalCtaSection onStartClick={onStartClick} setActiveTab={setActiveTab} />
      <MarketingFooter />
    </div>
  );
};

export default LandingPage;
