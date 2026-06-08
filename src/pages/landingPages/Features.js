import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Features.css';

const Features = () => {
  const navigate = useNavigate();
  const [activeFeature, setActiveFeature] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  
    const features = [
        {
          id: 1,
          title: "Map",
          shortDesc: "Fast, accurate parcel mapping with zoning, easements, roads, and PLSS overlays.",
          fullDesc: "Explore detailed property data on a map built for professionals. Every parcel, zoning area, and easement is rendered clearly and loads instantly—whether you’re viewing one lot or an entire county.",
          howItHelps: "Get all your spatial context in one place. Identify boundaries, understand zoning, trace easements, and navigate road networks without juggling multiple tools or slow data sources.",
          img: "/map.png",
          icon: "🗺️",
          highlights: [
            "Crisp parcel boundaries with smart labeling",
            "Zoning and easement overlays with clear color coding",
            "Full road and address network",
            "PLSS sections, townships, and ranges",
            "Optimized for clarity and speed at every zoom level"
          ]
        },
        {
          id: 2,
          title: "Parcel Search",
          shortDesc: "Search across counties by owner, address, or parcel ID—instantly.",
          fullDesc: "Find properties in seconds using a unified search across counties. Enter an owner name, address, or PIDN to see complete parcel data with instant map results and filters for acreage, value, or date range.",
          howItHelps: "Skip the maze of county portals. Whether you’re confirming ownership, preparing reports, or researching comparable properties, our search gives you clean, accurate results in one place.",
          img: "/search.png",
          icon: "🔍",
          highlights: [
            "Instant, cross-county search",
            "Owner, address, and PIDN lookup",
            "Fuzzy matching for misspellings and abbreviations",
            "Advanced filters by acreage, value, and date",
            "Batch search for multiple properties"
          ]
        },
        {
          id: 3,
          title: "Report Builder",
          shortDesc: "Generate parcel and ownership reports—ready to export or share.",
          fullDesc: "Compile ownership, valuation, and tax data into clean, standardized reports in a few clicks. Each report includes deed history, acreage, and summary statistics, formatted for review or presentation.",
          howItHelps: "Turn manual data collection into structured, exportable output. Perfect for due diligence, appraisals, and title work—everything you need in one professional document.",
          img: "/report.png",
          icon: "📊",
          highlights: [
            "Automated parcel and ownership summaries",
            "Deed and tax reference integration",
            "Valuation and acreage calculations",
            "Custom report templates",
            "Export to PDF, Excel, or CSV"
          ]
        },
        {
          id: 4,
          title: "Print Builder",
          shortDesc: "Design professional map layouts with notes, arrows, and legends.",
          fullDesc: "Create presentation-ready map layouts directly in your browser. Add annotations, legends, north arrows, and scale bars, then export high-resolution prints for reports or fieldwork.",
          howItHelps: "Produce polished visuals without GIS software or post-processing. Ideal for planning documents, court exhibits, or client deliverables where clarity and presentation matter.",
          img: "/print.png",
          icon: "🖨️",
          highlights: [
            "Customizable map templates",
            "Annotation tools for notes, arrows, and shapes",
            "Automatic scale bars and north arrows",
            "Legend builder synced to active layers",
            "High-resolution exports (PDF, PNG, JPEG)"
          ]
        }
      ];
      

  useEffect(() => {
    // Preload images
    features.forEach(feature => {
      const img = new Image();
      img.src = feature.img;
    });
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (activeFeature) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [activeFeature]);

  const handleFeatureClick = (featureId) => {
    setActiveFeature(activeFeature === featureId ? null : featureId);
  };

  const closeModal = () => {
    setActiveFeature(null);
  };

  return (
    <div className="features-page">
      {/* Hero Section */}
      <div className="features-hero">
        <div className="features-badge">
          <span>Powerful Tools</span>
        </div>
        <h1 className="features-main-title">
          Everything you need for <span className="features-highlight-text">GIS work</span>
        </h1>
        <p className="features-subtitle">
          Professional-grade tools designed for land professionals, planners, and GIS analysts
        </p>
      </div>

      {/* Features List */}
      <div className="features-content">
        <div className="features-list">
          {features.map((feature, index) => (
            <div 
              key={feature.id}
              className="feature-card"
              onClick={() => handleFeatureClick(feature.id)}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Feature Image */}
              <div className="feature-image-container">
                <img 
                  src={feature.img} 
                  alt={feature.title}
                  className="feature-image"
                />
                <div className="feature-overlay">
                  <span className="feature-icon">{feature.icon}</span>
                </div>
              </div>

              {/* Feature Content */}
              <div className="feature-content">
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-short-desc">
                  {feature.shortDesc || feature.desc}
                </p>

                {/* Expand Indicator */}
                <div className="expand-indicator">
                  <span>Learn More</span>
                  <span className="arrow">→</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Expanded Modal */}
      {activeFeature && (
        <div className="feature-modal-overlay" onClick={closeModal}>
          <div className="feature-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>×</button>
            
            {features.filter(f => f.id === activeFeature).map(feature => (
              <div key={feature.id} className="modal-content">
                {/* Modal Image */}
                <div className="modal-image-container">
                  <img 
                    src={feature.img} 
                    alt={feature.title}
                    className="modal-image"
                  />
                </div>

                {/* Modal Text Content */}
                <div className="modal-text-content">
                  <h2 className="modal-title">{feature.title}</h2>
                  <p className="modal-full-desc">{feature.fullDesc}</p>
                  
                  <div className="how-it-helps-section">
                    <h4>How it helps you:</h4>
                    <p>{feature.howItHelps}</p>
                  </div>

                  <div className="modal-highlights">
                    <h4>Key Features:</h4>
                    <ul className="modal-highlights-list">
                      {feature.highlights.map((highlight, idx) => (
                        <li key={idx}>{highlight}</li>
                      ))}
                    </ul>
                  </div>

                  <button 
                    className="modal-try-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/map');
                    }}
                  >
                    Try it now →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA Section */}
      <div className="features-cta">
        <h2 className="cta-title">Ready to get started?</h2>
        <p className="cta-description">
          Experience all features with a free trial. No credit card required.
        </p>
        <button className="cta-button" onClick={() => navigate('/map')}>
          Launch App
          <span className="button-arrow">→</span>
        </button>
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
            <a className="footer-button" href="mailto:noahgans@communityview.ai" target="_blank" rel="noopener noreferrer">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Features;

