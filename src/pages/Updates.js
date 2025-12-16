
import React, { useState, useEffect } from 'react';
import './Updates.css';
import { useNavigate } from 'react-router-dom';

const Updates = () => {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Updates in chronological order (oldest first, newest last)
  const updates = [
    {
      version: "1.0.0",
      title: "Initial Launch – Teton County Ownership Viewer",
      date: "September 25, 2024",
      description: "The first deployment of the platform showing parcel ownership data for Teton County, Wyoming.",
      features: [
        {
          category: "Map",
          items: [
            "Interactive parcel boundaries",
            "Property owner information",
            "Zoom and pan controls",
            "Multiple base map options"
          ]
        },
        {
          category: "Features",
          items: [
            "Click parcels to view details",
            "PIDN and owner name display",
            "Simple two-page navigation"
          ]
        }
      ],
      highlights: "First public launch of the Teton County ownership viewer"
    },
    {
      version: "1.1.0",
      title: "Search & Custom Domain Integration",
      date: "October 10, 2024",
      description: "Added parcel search functionality and launched the custom domain tetoncountygis.com.",
      features: [
        {
          category: "Search",
          items: [
            "Search by owner name or address",
            "Real-time results as you type",
            "Click results to highlight on map",
            "'Map It' buttons for each result"
          ]
        },
        {
          category: "Improvements",
          items: [
            "Better parcel highlighting",
            "Persistent layer settings",
            "Refined color scheme"
          ]
        }
      ],
      highlights: "Custom domain launch and parcel search capability"
    },
    {
      version: "2.0.0",
      title: "Vector Tiles & Mapbox Migration",
      date: "December 28, 2024",
      description: "Completely rebuilt the mapping system for dramatically improved performance and mobile experience.",
      features: [
        {
          category: "Performance",
          items: [
            "Instant map loading and smooth panning",
            "Fast zooming with no lag",
            "Works seamlessly on mobile devices",
            "Enhanced visual quality"
          ]
        },
        {
          category: "Map",
          items: [
            "Professional map styling",
            "Better hover effects",
            "Improved layer rendering"
          ]
        }
      ],
      highlights: "Lightning-fast performance with professional-grade mapping technology"
    },
    {
      version: "2.1.0",
      title: "Report Builder & Full UI Overhaul",
      date: "February 11, 2025",
      description: "Complete interface redesign and introduction of the Report Builder for analyzing property data.",
      features: [
        {
          category: "Report Builder",
          items: [
            "Select multiple parcels for analysis",
            "View property, tax, and ownership details",
            "Filter and sort by any field",
            "Export reports to CSV",
            "Draw areas on map to filter parcels"
          ]
        },
        {
          category: "Interface",
          items: [
            "Modern, intuitive design",
            "Better mobile experience",
            "Streamlined navigation",
            "Professional look and feel"
          ]
        }
      ],
      highlights: "Professional report builder with advanced filtering and CSV export"
    },
    {
      version: "2.2.0",
      title: "Print Maker & Map Maker",
      date: "April 24, 2025",
      description: "Powerful tools for creating custom maps with annotations, shapes, and professional layouts.",
      features: [
        {
          category: "Print Builder",
          items: [
            "24+ customizable shapes and icons",
            "Draggable text notes and labels",
            "Add compass and legend to maps",
            "Full control over colors and styling",
            "Portrait or landscape layouts",
            "Print-ready output"
          ]
        },
        {
          category: "Customization",
          items: [
            "Resize and rotate any element",
            "Change fonts, colors, and sizes",
            "Layer multiple annotations",
            "Professional map exports"
          ]
        }
      ],
      highlights: "Create professional custom maps with annotations and export print-ready documents"
    },
    {
      version: "2.3.0",
      title: "3D Maps & Terrain Visualization",
      date: "May 15, 2025",
      description: "Experience the landscape in 3D with interactive terrain and elevation visualization.",
      features: [
        {
          category: "3D Features",
          items: [
            "Toggle between 2D and 3D views",
            "See terrain and elevation",
            "Dynamic lighting effects",
            "Smooth transitions"
          ]
        }
      ],
      highlights: "Explore properties in stunning 3D with terrain visualization"
    },
    {
      version: "2.4.0",
      title: "Multi-County Expansion",
      date: "August 18, 2025",
      description: "Expanded to five counties with automated daily data updates and enhanced infrastructure.",
      features: [
        {
          category: "Coverage",
          items: [
            "Teton County, Wyoming",
            "Teton County, Idaho",
            "Sublette County, Wyoming",
            "Lincoln County, Wyoming",
            "Fremont County, Wyoming"
          ]
        },
        {
          category: "Data",
          items: [
            "Automatic daily updates",
            "Always-current property information",
            "Faster map loading across all counties"
          ]
        }
      ],
      highlights: "Five-county coverage with daily automated data updates"
    },
    {
      version: "2.5.0",
      title: "Rebrand & Property Details API Launch",
      date: "September 28, 2025",
      description: "Official rebrand to Community View with enhanced property details from live county data.",
      features: [
        {
          category: "Branding",
          items: [
            "New Community View identity",
            "Refreshed logo and design",
            "Unified experience across counties"
          ]
        },
        {
          category: "Property Details",
          items: [
            "Live tax information from county websites",
            "Detailed property valuations",
            "Recording and deed information",
            "Historical tax data",
            "Direct links to county records"
          ]
        },
        {
          category: "Performance",
          items: [
            "Smart caching for instant results",
            "Batch processing for multiple properties",
            "Works across all five counties"
          ]
        }
      ],
      highlights: "Rebrand to Community View with comprehensive live property data from county sources"
    },
    {
      version: "2.6.0",
      title: "Advanced Search & Multi-County Filtering",
      date: "October 17, 2025",
      description: "Major search upgrade with Advanced Search mode featuring field-specific queries and intelligent results.",
      features: [
        {
          category: "Standard Search",
          items: [
            "Filter by county (one or multiple)",
            "Search owner names, addresses, or parcel IDs",
            "Choose how many results to show (25-200)",
            "Select multiple properties to map at once",
            "Direct links to tax and property records"
          ]
        },
        {
          category: "Advanced Search",
          items: [
            "Search specific fields (owner, address, parcel ID, mailing address)",
            "Filter by owner type (individual, business, trust)",
            "Show only properties with physical addresses",
            "Sort results your way",
            "Combine multiple filters for precise results"
          ]
        },
        {
          category: "Experience",
          items: [
            "100x faster search performance",
            "Smarter result ranking",
            "Works on any device",
            "Instant results as you type"
          ]
        }
      ],
      highlights: "Powerful Advanced Search with smart filtering, owner type detection, and lightning-fast performance"
    }
  ];

  // Start with the newest update (last item in array)
  const [activeIndex, setActiveIndex] = useState(updates.length - 1);

  const handlePrev = () => {
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : updates.length - 1));
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev < updates.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="updates-page">
      <div className="updates-hero">
        <h1 className="updates-main-title">Platform Updates</h1>
      </div>

      <div className="updates-carousel-container">
        <div className="updates-cards-track" style={{ transform: `translateX(calc(  2950px - ${activeIndex * 740}px))` }}>
          {updates.map((update, index) => (
            <div 
              key={index} 
              className={`update-card ${index === activeIndex ? 'active' : ''}`}
              onClick={() => setActiveIndex(index)}
            >
              <div className="update-card-inner">
                <div className="update-card-header">
                  <div className="update-version-badge">v{update.version}</div>
                  <h2 className="update-title">{update.title}</h2>
                  <div className="update-date">{update.date}</div>
                </div>
                
                <div className="update-highlight-box">
                  <span className="highlight-label">Overview</span>
                  <p className="highlight-text">{update.description} {update.highlights}</p>
                </div>

                <div className="update-features">
                  {update.features.map((feature, fIndex) => (
                    <div key={fIndex} className="feature-section">
                      <h4 className="feature-category">{feature.category}</h4>
                      <ul className="feature-list">
                        {feature.items.map((item, iIndex) => (
                          <li key={iIndex}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Side Navigation Arrows */}
      <button className="nav-arrow nav-arrow-left" onClick={handlePrev} aria-label="Previous update">
        ←
      </button>
      <button className="nav-arrow nav-arrow-right" onClick={handleNext} aria-label="Next update">
        →
      </button>

      {/* Bottom Dots Navigation */}
      <div className="updates-navigation">
        <div className="nav-dots">
          {updates.map((_, index) => (
            <button
              key={index}
              className={`nav-dot ${index === activeIndex ? 'active' : ''}`}
              onClick={() => setActiveIndex(index)}
              aria-label={`Go to update ${index + 1}`}
            />
          ))}
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

export default Updates;


