import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Intro.css';
import { useMapContext } from '../pages/MapContext';
import LinearStyleFeatureStack from '../components/LinearStyleFeatureStack';
import CoverageMap from '../components/CoverageMap';
import { isNativeApp } from '../utils/platformDetection';
import { useUser } from '../contexts/UserContext';

const Intro = ({ onStartClick }) => {
  const navigate = useNavigate();
  const { activeTab, setActiveTab } = useMapContext();
  const [active, setActive] = useState(0);
  const [mobileFeatureIndex, setMobileFeatureIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const isNative = isNativeApp();
  const { user, loading } = useUser();

  // Features data for mobile carousel
  const mobileFeatures = [
    {
      id: 1,
      title: "Map",
      shortDesc: "Fast, accurate parcel mapping with zoning, easements, roads, and PLSS overlays.",
      img: "/map.png",
      icon: "🗺️",
    },
    {
      id: 2,
      title: "Parcel Search",
      shortDesc: "Search across counties by owner, address, or parcel ID—instantly.",
      img: "/search.png",
      icon: "🔍",
    },
    {
      id: 3,
      title: "Report Builder",
      shortDesc: "Generate parcel and ownership reports—ready to export or share.",
      img: "/report.png",
      icon: "📊",
    },
    {
      id: 4,
      title: "Print Builder",
      shortDesc: "Design professional map layouts with notes, arrows, and legends.",
      img: "/print.png",
      icon: "🖨️",
    },
  ];

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      setMobileFeatureIndex((prev) => (prev < mobileFeatures.length - 1 ? prev + 1 : 0));
    }
    if (isRightSwipe) {
      setMobileFeatureIndex((prev) => (prev > 0 ? prev - 1 : mobileFeatures.length - 1));
    }
  };

  // Redirect authenticated users to map immediately (don't wait for loading)
  useEffect(() => {
    if (user) {
      console.log('✅ User is authenticated, redirecting to /map');
      setActiveTab('map');
      navigate('/map', { replace: true });
    }
  }, [user, navigate, setActiveTab]);

  // Listen for screen resize to update mobile state
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // If user is authenticated, don't render intro (redirect will happen)
  if (user) {
    return null;
  }

  // Removed duplicate, unused local features list; using inline props below

  // Simplified version for native app - just login/signup
  if (isNative) {
    const handleLearnMore = () => {
      window.open('https://tetoncountygis.com', '_blank', 'noopener,noreferrer');
    };

    return (
      <div className="intro intro-native">
        <div className="hero-section hero-section-native">
          <div className="hero-content hero-content-native">
            <div className="logo-container-native">
              <img src="/logo_transparent_no_background.png" alt="Community View Logo" className="logo-image-native" />
            </div>
            <div className="hero-cta-group hero-cta-group-native">
              <button
                className="hero-primary-btn"
                onClick={() => navigate("/login")}
              >
                <span>Sign In</span>
                <div className="btn-icon">→</div>
              </button>
            </div>
            <div className="bottom-actions">
              <div className="hero-cta-group-bottom">
                <button
                  className="hero-secondary-btn"
                  onClick={() => navigate("/signup")}
                >
                  <span>Create Account</span>
                  <div className="btn-icon">→</div>
                </button>
              </div>
              <div className="learn-more-link">
                <span>Learn more </span>
                <button className="learn-more-button" onClick={handleLearnMore}>
                  click here
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full landing page for web
  return (
    <div className="intro">
      {/* Top-left header navigation */}
      

      {/* Hero Section */}
      <div className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            <span className="catchphrase">
              <span className="catchphrase-line">Smarter Land Data</span>
              <span className="catchphrase-line">Better Decisions</span>
            </span>
            <span className="company-name">
              <span className="word-community">Community</span>
              <span className="word-view">View</span>
            </span>
          </h1>
          <p className="hero-description">
            Community View delivers unparalleled accuracy for ownership and community mapping by connecting directly into county platforms.
          </p>
          <div className="hero-cta-group">
            {isMobile ? (
              <>
                <button
                  className="hero-primary-btn"
                  onClick={() => navigate("/signup")}
                >
                  <span>Sign Up</span>
                  <div className="btn-icon">→</div>
                </button>
                <a
                  className="hero-secondary-btn"
                  href="https://apps.apple.com/us/app/community-view/id6755610726"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>Download App</span>
                  <div className="btn-icon">→</div>
                </a>
              </>
            ) : (
              <button
                className="hero-primary-btn"
                onClick={() => {
                  onStartClick();
                  setActiveTab("map");
                  navigate("/map");
                }}
              >
                <span>Start Exploring</span>
                <div className="btn-icon">️</div>
              </button>
            )}
          </div>
          {/* Coverage Map - Hidden on mobile (non-app version) */}
          {!isMobile && (
            <div className="coverage-map-container">
              <CoverageMap />
            </div>
          )}
        </div>
      </div>
      <h3 className="partner-logos-title">Our Partners</h3>
      <div className="stats-banner">
        <div className="stats-banner-container">
          <div className="partner-logos-carousel">
            <div className="partner-logos-track">
              {/* First set of logos */}
              <div className="partner-logo-item">
                <img src="/partner_logos/TetonBoardRealtors-Logo.webp" alt="Teton Board of Realtors" />
              </div>
              <div className="partner-logo-item">
                <img src="/partner_logos/prugh logo.jpg" alt="Prugh" />
              </div>
              <div className="partner-logo-item">
                <img src="/partner_logos/engel_volkers_jackson_hole_logo.jpg" alt="Engel & Völkers Jackson Hole" />
              </div>
              <div className="partner-logo-item">
                <img src="/partner_logos/Compass Logo.jpg" alt="Compass" />
              </div>
              <div className="partner-logo-item">
                <img src="/partner_logos/bank of jacjson hole.jpg" alt="Bank of Jackson Hole" />
              </div>
              <div className="partner-logo-item">
                <img src="/partner_logos/KellerWilliams_JacksonHole_Logo-B_RGB.png" alt="Keller Williams Jackson Hole" />
              </div>
              <div className="partner-logo-item partner-logo-with-bg">
                <img src="/partner_logos/jackson hole sothobyes.png" alt="Jackson Hole Sotheby's" />
              </div>
              <div className="partner-logo-item partner-logo-with-bg">
                <img src="/partner_logos/BH Logo.png" alt="BH" />
              </div>
              {/* Duplicate set for seamless loop */}
              <div className="partner-logo-item">
                <img src="/partner_logos/TetonBoardRealtors-Logo.webp" alt="Teton Board of Realtors" />
              </div>
              <div className="partner-logo-item">
                <img src="/partner_logos/prugh logo.jpg" alt="Prugh" />
              </div>
              <div className="partner-logo-item">
                <img src="/partner_logos/engel_volkers_jackson_hole_logo.jpg" alt="Engel & Völkers Jackson Hole" />
              </div>
              <div className="partner-logo-item">
                <img src="/partner_logos/Compass Logo.jpg" alt="Compass" />
              </div>
              <div className="partner-logo-item">
                <img src="/partner_logos/bank of jacjson hole.jpg" alt="Bank of Jackson Hole" />
              </div>
              <div className="partner-logo-item">
                <img src="/partner_logos/KellerWilliams_JacksonHole_Logo-B_RGB.png" alt="Keller Williams Jackson Hole" />
              </div>
              <div className="partner-logo-item partner-logo-with-bg">
                <img src="/partner_logos/jackson hole sothobyes.png" alt="Jackson Hole Sotheby's" />
              </div>
              <div className="partner-logo-item partner-logo-with-bg">
                <img src="/partner_logos/BH Logo.png" alt="BH" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Why Community View Section */}
      <div className="why-community-view-section">
        <div className="why-community-view-content">
          <h2 className="why-community-view-title">Why Community View</h2>
          
          {/* Mobile version */}
          {isMobile ? (
            <>
              <p className="why-community-view-subtitle">
                Community View focuses on a region to deliver a high-quality platform at a massive discount for boards. By concentrating our efforts on specific regions, we provide unparalleled accuracy and relevance for each community while making enterprise-grade GIS tools accessible and affordable.
              </p>
              <div className="mobile-why-cta-buttons">
                <button 
                  className="mobile-cta-button enterprise-button"
                  onClick={() => window.location.href = 'mailto:noahgans@tetoncountygis.com?subject=Enterprise Inquiry'}
                >
                  Enterprise Pricing
                </button>
                <button 
                  className="mobile-cta-button explore-button"
                  onClick={() => navigate('/signup')}
                >
                  Start Exploring
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="why-community-view-subtitle">
                Community View uses mixed data and construction methods to deliver custom GIS platforms for regions, providing unparalleled accuracy and relevance for each community.
              </p>
              
              <div className="comparison-timelines">
            {/* Single Starting Point */}
            <div className="timeline-start-point">
              <div className="start-content">
                <h4>Local County Government</h4>
                <p>Nearly every county manages and publishes county ownership and community data</p>
              </div>
              <div className="start-dot"></div>
            </div>

            {/* Branching Lines */}
            <div className="timeline-branches">
              {/* Community View Timeline */}
              <div className="timeline-container community-view-timeline">
                <h3 className="timeline-title">Community View</h3>
                <div className="timeline-line"></div>
                <div className="timeline-steps">
                  <div className="timeline-step">
                    <div className="step-dot"></div>
                    <div className="step-content">
                      <h4>Daily Direct Access</h4>
                      <p>Community View retrives all community data daily from each county within a region. Communty view collects deep tax, 
                        ownership, clerk, and other community data to create the most accurate platform for any given county.</p>
                    </div>
                  </div>
                  <div className="timeline-step">
                    <div className="step-dot"></div>
                    <div className="step-content">
                      <h4>Internal Data Cleaning</h4>
                      <p>Thousands of internal processes clean and organize the messy and different community data. This ensures consistantcy across counties and enables
                        accurate and effect mapping tools for the final product.
                      </p>
                    </div>
                  </div>
                  <div className="timeline-step">
                    <div className="step-dot"></div>
                    <div className="step-content">
                      <h4>Community View Platform</h4>
                      <p>Community view uses its up to date and cleanded data to devliver the higest quality data on modern platform delivering an unparalleled platform.</p>
                    </div>
                  </div>
  
                </div>
              </div>

              {/* Third-Party Vendor Timeline */}
              <div className="timeline-container vendor-timeline">
                <h3 className="timeline-title">Third-Party Vendors</h3>
                <div className="timeline-line"></div>
                <div className="timeline-steps">
                  <div className="timeline-step">
                    <div className="step-dot"></div>
                    <div className="step-content">
                      <h4>Data Vendor Collection</h4>
                      <p>Other platforms rely on data vendors for their ownership and community data. These vendors collect less information on ownership so national collection is easier.
                        This data lacks depth and may only be updated once a year. They also do not collect zoning, easments, or other community specific data.
                      </p>
                    </div>
                  </div>
                  <div className="timeline-step">
                    <div className="step-dot"></div>
                    <div className="step-content">
                      <h4>Vendor Processing </h4>
                      <p>After collecting the data, the vendors process and standardize ownership data across the county possibly stripping ownership information from parcels. 
                       For example, an owner name can change from its true name of "CARLMAN, LEONARD R. & ANN LADD" to just Leonard Carlman - an actual example from a leading Software in ownership mapping.</p>
                    </div>
                  </div>
                  <div className="timeline-step">
                    <div className="step-dot"></div>
                    <div className="step-content">
                      <h4>Data Sold to GIS Platform</h4>
                      <p>The data vendor sells their ownership data to a GIS platform company. By this point, the ownership data being sold is inaccurate and out of date. Typically the
                        buying companines will buy by state and get the data for a certian amount of time. This is why the data is often out of date and inaccurate.
                      </p>
                    </div>
                  </div>
                  <div className="timeline-step">
                    <div className="step-dot"></div>
                    <div className="step-content">
                      <h4>GIS Platform Processing</h4>
                      <p>Typically the GIS platform will process and possibly even strip more data from the ownerhsip infomation. They may further change the stucture of the data they bought 
                        from the vendor to make it work with their platform.
                      </p>
                    </div>
                  </div>
                  <div className="timeline-step">
                    <div className="step-dot"></div>
                    <div className="step-content">
                      <h4>GIS Platform Final Product</h4>
                      <p>The twice manipulated data is then shown and integrated into the GIS platform. By this point the data is often inaccurate and out of date. Not to mention 
                        these platforms do not have community specific data like tax history, zoning, easments, clerk records, or other community specific data. The user recives a worse product for their money.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile Features Section - Only shown on mobile, positioned right after Why Community View */}
      {isMobile && (
        <div className="mobile-features-section">
          <h2 className="section-title">Features</h2>
          <div className="mobile-features-carousel">
            <div className="mobile-features-carousel-container">
              <div 
                className="mobile-features-track"
                style={{ transform: `translateX(calc(-${mobileFeatureIndex * 100}%))` }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                {mobileFeatures.map((feature, index) => (
                  <div key={feature.id} className="mobile-feature-card">
                    <div className="mobile-feature-image-container">
                      <img src={feature.img} alt={feature.title} className="mobile-feature-image" />
                    </div>
                    <div className="mobile-feature-content">
                      <h3 className="mobile-feature-title">{feature.title}</h3>
                      <p className="mobile-feature-desc">{feature.shortDesc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mobile-features-nav">
              <button 
                className="mobile-feature-nav-arrow mobile-feature-nav-left"
                onClick={() => setMobileFeatureIndex((prev) => (prev > 0 ? prev - 1 : mobileFeatures.length - 1))}
                aria-label="Previous feature"
              >
                ←
              </button>
              <div className="mobile-feature-dots">
                {mobileFeatures.map((_, index) => (
                  <button
                    key={index}
                    className={`mobile-feature-dot ${index === mobileFeatureIndex ? 'active' : ''}`}
                    onClick={() => setMobileFeatureIndex(index)}
                    aria-label={`Go to feature ${index + 1}`}
                  />
                ))}
              </div>
              <button 
                className="mobile-feature-nav-arrow mobile-feature-nav-right"
                onClick={() => setMobileFeatureIndex((prev) => (prev < mobileFeatures.length - 1 ? prev + 1 : 0))}
                aria-label="Next feature"
              >
                →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Banner Section */}
     
          
      {/* LinearStyleFeatureStack Section - Hidden on mobile */}
      {!isMobile && (
        <div className="feature-stack-section">
          <LinearStyleFeatureStack 
            features={[
              {
                title: "Print Builder",
                desc: "Export-ready layouts with notes, arrows, compass, legends",
                img: "/print.png",
                href: "/map"
              },
              {
                title: "Report Building",
                desc: "Generate parcel and ownership reports with tables, stats, and export",
                img: "/report.png",
                href: "/map"
              },
              {
                title: "Parcel Search",
                desc: "Cross-county owner/address/PIDN search with advanced filters",
                img: "/search.png",
                href: "/map"
              },
              {
                title: "Ownership Layers", 
                desc: "Parcels, easements, zoning, roads, PLSS—readable at every zoom",
                img: "/map.png",
                href: "/map"
              },
              
            ]}
            heading="Built for power users"
          />
        </div>
      )}

      {/* CTA Lead and Section */}
      <div className="cta-lead">
        <p className="cta-lead-text">Want to better understand your community?</p>
        <div className="cta-down-arrow" aria-hidden="true"></div>
      </div>
      <div className="cta-section">
        <button
          className="cta-button"
          onClick={() => {
            onStartClick();
            setActiveTab("map");
            navigate("/map");
          }}
        >
          <span>Explore The Platform</span>
          <div className="button-icon">→</div>
        </button>
        <p className="cta-subtitle">Experience professional-grade GIS tools</p>
      </div>

      {/* Services Section */}
      <div className="services-section">
        <h2 className="section-title">Our Services</h2>
        <div className="services-grid">
          <div className="service-card">
            <h3>Comunity Specific GIS Platform</h3>
            <p>Our main GIS platform service focus's on a single community allowing our platform to provide unparalleled accuracy and relevance for the community.</p>
          </div>
          <div className="service-card">
            <h3>Custom Layer Hosting</h3>
            <p>Do you have a custom spatial layer that you want on the platform? We can add it so you can see it on the platform.</p>
          </div>
          <div className="service-card">
            <h3>Complex Analysis</h3>
            <p>Interested in a complex analysis? Our GIS professionals can help answer your questions and provide the analysis you need.</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="intro-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="footer-logo-container">
              <img src="/logo.png" alt="Community View Logo" className="footer-logo-image" />
            </div>
            <p>Spatial GIS Solutions</p>
          </div>
          <div className="footer-links">
            <button className="footer-button" onClick={() => navigate('/pricing')}>Pricing</button>
            <button className="footer-button" onClick={() => navigate('/faq')}>FAQ</button>
            {!isMobile && (
              <button className="footer-button" onClick={() => navigate('/updates')}>Updates</button>
            )}
            <button className="footer-button" onClick={() => navigate('/features')}>Features</button>
            <a className="footer-button" href="mailto:noahgans@tetoncountygis.com" target="_blank" rel="noopener noreferrer">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Intro;
