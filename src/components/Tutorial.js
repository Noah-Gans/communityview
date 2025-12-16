import React from 'react';
import './Tutorial.css';
import on_load from "../assets/images/tutorial/on_load.png"
import tool_panel from "../assets/images/tutorial/tool_panel.png"
import single_select from "../assets/images/tutorial/single_feature_select.png"
import multi_select from "../assets/images/tutorial/multi_feature_select.png"
import side_panel_layers from "../assets/images/tutorial/side_panel_ledgend_layers.png"
import side_panel_info from "../assets/images/tutorial/side_panel_feature_info.png"
import toplayer_one from "../assets/images/tutorial/toplayer_one.png"
import toplayer_two from "../assets/images/tutorial/toplayer_two.png"
import toplayer_three from "../assets/images/tutorial/toplayer_three.png"
import toplayer_four from "../assets/images/tutorial/toplayer_four.png"
import basemap from "../assets/images/tutorial/basemap.png"
import search from "../assets/images/tutorial/search.png"
import report from "../assets/images/tutorial/report.png"
import print from "../assets/images/tutorial/print.png"

import { useNavigate, useLocation } from 'react-router-dom'; // For navigation
import { useEffect } from 'react';

const Tutorial = () => {
  const navigate = useNavigate(); // For navigation back to previous page
  const location = useLocation();

  const handleClose = () => {
    if (location.state?.fromIntro) {
      navigate('/'); // go back to Intro explicitly
    } else {
      navigate(-1); // fallback to history
    }
  };
  useEffect(() => {
    document.body.style.overflow = 'hidden'; // 🔒 Lock scroll
    return () => {
      document.body.style.overflow = '';     // 🔓 Reset on unmount
    };
  }, []);
  return (
    <div className="tutorial-page">
      <button className="tutorial-close-btn" onClick={handleClose}>
        ×
      </button>
      <div className="tutorial-content-container">
      <div className="tutorial-content">
            <h1>How to Use The Better Teton County GIS</h1>
            <p>Welcome to the tutorial! Here you will learn how to explore spatial data in Teton County.</p>
            <hr className="section-divider" />
            
            <h2>Controls and Layout Overview</h2>
            <p>
              The main map interface is designed to be intuitive and fast for both everyday use and in-depth research. At the top of the page, you’ll find the <strong>tab navigation bar</strong>, which allows you to quickly switch between the <em>Map</em>, <em>Search</em>, <em>Reports</em>, and <em>Print</em> views. These tabs let you control what part of the platform you're interacting with.
            </p>
            <p>
              Along the left-hand side of the map, you'll see the <strong>base map selector</strong>. This tool lets you choose your preferred background for the map — such as satellite imagery or a simplified street view — to better suit your task or visual preference.
            </p>
            <p>
              In the center-top of the map, you'll find the <strong>tool panel</strong>. This includes key interactive tools like zoom controls, draw tools, measurement tools, and a clear/reset button. Use these to annotate the map, take measurements, or highlight areas of interest. Hovering over each icon reveals a tooltip explaining its function.
            </p>
            <p>
              On the right-hand side, you'll see the <strong>side panel</strong>. This has two tabs: <em>Layers</em> and <em>Info</em>. The <em>Layers</em> tab lets you toggle which data layers are visible — such as ownership parcels, roads, or public lands. The <em>Info</em> tab shows detailed information about whatever feature you've clicked on in the map.
            </p>
            <p>
              Just above the side panel is the <strong>tab selector</strong>, which lets you switch between viewing layers and viewing information about selected features. If the side panel gets in the way, you can use the <strong>minimize button</strong> to collapse it and give more room to the map.
            </p>
            <p>
              At any time, clicking on a parcel or feature on the map will highlight it and bring up its details in the <em>Info</em> tab of the side panel. This makes it easy to quickly gather key data from the map view.
            </p>
            <img src={on_load} alt="Map with annotations" className="step-image" />
            
            <hr className="section-divider" />
            <h2>Navigate the Map</h2>
            <p>Use your mouse wheel or the + or - zoom buttons in the tool panel to zoom in and out of the map. Click and drag to pan the map around.</p>
            <img src={tool_panel} alt="Zoom functionality" className="step-image" />

            <hr className="section-divider" />
            <h2>Selecting Features</h2>
            <p>Features, or ownership lots, can be selected by clicking them on the map. Selected features will highlight red and their details will be shown in the info tab of the side panel</p>
            <p>In the example below, the Jackson Hole Higsh School Lot was selected, and its ownership information populates the info tab:</p>
            <img src={single_select} alt="Wilson school selection" className="step-image" />
            <p>Multiple parcels can be selected by holding shift and clicking parcels. Their information will populate in the side panel. </p>
            <img src={multi_select} alt="Wilson school selection" className="step-image" />

            <hr className="section-divider" />
            <h2>The Side Panel</h2>
            <p>The side panel contains all the layers that can be shown on the platform. Layers with multiple feature types contain a legend, which can be expanded by clicking the 'Legend' button.</p>
            <p>
               The side panel will also display feature information. These views can be toggled with the tabs at the top. The :"See Featyres in Report Builder" button allows you to toake the selected features and oppen them in the report builder. It is a method to spatially construct reports.   
            </p>
            <img src={side_panel_layers} alt="Ownership side panel" className="image-spacing" />
            <img src={side_panel_info} alt="Public side panel" className="image-spacing" />
            
            <hr className="section-divider" />
            <h2>Managing the Top Layer and Selecting Features</h2>
            <p>This platform allows for the selection of features from multiple layers.</p>
           
            <p>The most recently selected layer is always placed on top. This layer will be indicated withe a black underline of the layer name in the side panel.</p>
            <p>To move a layer to the top, unselect and reselect it in the side panel. The following images illustrate how this works with the Ownership and Conservation Easements layers:</p>
            <img src={toplayer_one} alt="Ownership layer top" className="step-image" />
            <img src={toplayer_two} alt="Ownership details in info tab" className="step-image" />
            <img src={toplayer_three} alt="Public land layer top" className="step-image" />
            <img src={toplayer_four} alt="Public land info" className="step-image" />
            
            <hr className="section-divider" />
            <h2>Basemap Layer Selection</h2>
            <p>Basemaps can be selected in the bottom left of the interface.</p>
            <img src={basemap} alt="Basemap selection" className="step-image" />

            <hr className="section-divider" />
            <h2>Use the Tool Panel to Draw on the Map</h2>
            <p>The tool panel has other tools beside theoom in and out on the left. </p>
            <p>From Left to right the tools follow as:</p>
            <p>Zoom In, Zoom Out, Measure Distance, Measure Polygon, Select Parcels with Polygon, Delete Selcted Drawing, Clear all Drawings</p>
            <p>Note, when drawing a polygon or line, double click to stop adding to the shape and then click a third time to finalize</p>


            <img src={tool_panel} alt="Tool panel" className="step-image" />

            <hr className="section-divider" />
            <h2>Searching for Properties</h2>
            <p>The search feature allows you to search ownership parcels. Results will display in a list, and you can view the property's basic information and navigate to the clerk records, property details, and tax records or highlight it on the map by clicking the respective buttons. Multiple parcels can be selected and mapped too.</p>
            <img src={search} alt="Search properties" className="step-image" />

            <hr className="section-divider" />
            <h2>Building Reports</h2>
            <p>
              The <strong>Reports</strong> tab is where you can generate, filter, and download detailed property reports based on the ownership layer. This section allows you to select specific attributes — like ownership details, valuation data, or tax history — and create a customized dataset that fits your needs.
            </p>
            <p>
              On the left-hand side, the <strong>attribute selector panel</strong> allows you to toggle on and off specific fields under three expandable sections: General Property Info, Property Details, and Tax Information. As you check fields, they’re added to your current report view and included in your CSV download.
            </p>
            <p>
              The main panel on the right displays a <strong>report table</strong> of all selected parcels and you can paginate through large datasets with the bottom next an previous buttons. 
            </p>
            <p>
              If you've selected parcels on the map or drawn a polygon using the Geo Filter tool, the table will automatically show only the selected features.
            </p>
            <p>
              When you’re ready to export your results, click the <strong>Download</strong> button to save your filtered table as a CSV file.
            </p>
            <img src={report} alt="Search properties" className="step-image" />

            <hr className="section-divider" />
            <h2>Printing Custom Maps</h2>
            <p>
              The <strong>Print</strong> tab lets you create beautiful, customized map layouts with annotations, shapes, legends, and directional elements. This tool is ideal for exporting professional-quality maps for presentations, reports, or offline use.
            </p>
            <p>
              When entering print mode, the layout is centered on the screen and constrained to a paper-sized view — either <strong>portrait</strong> or <strong>landscape</strong>. You can toggle between these orientations using the buttons at the top of the print panel.
            </p>
            <p>
              The left side panel offers a wide range of customizable elements. Under <strong>Add Shape</strong>, you’ll find options like arrows, triangles, rectangles, pins, and thematic icons like mountains, parks, or schools. You can also place map elements such as <strong>notes</strong>, <strong>legends</strong>, and a <strong>compass</strong>.
            </p>
            <p>
              Once an item is placed, clicking it will open an <strong>Edit Panel</strong> where you can customize colors, borders, font settings (for notes), opacity, and alignment. This allows for complete control over the map's appearance and layout.
            </p>
            <p>
              When your map is ready, click the <strong>🖨️ Print</strong> button to export it using your browser’s native print dialog. All editable graphics will be hidden during printing to give a clean, professional output. To clear your layout and start fresh, hit <strong>🧹 Clear All</strong>.
            </p>
            <img src={print} alt="Search properties" className="step-image" />
        </div>
        </div>
    </div>
  );
};

export default Tutorial;
