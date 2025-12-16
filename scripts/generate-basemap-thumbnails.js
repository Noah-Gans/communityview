/**
 * Script to generate basemap thumbnails using Mapbox Static Images API
 * 
 * Usage:
 * 1. Install: npm install axios (or use fetch)
 * 2. Run: node scripts/generate-basemap-thumbnails.js
 * 3. Download the images and save them to public/basemaps/
 */

const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1Ijoibm9haC1nYW5zIiwiYSI6ImNsb255ajJteDB5Z2gya3BpdXU5M29oY3YifQ.VbPKEHZ91PNoSAH-raskhw';
const CENTER = '-110.76,43.48'; // Teton County center
const ZOOM = 10;
const WIDTH = 200;
const HEIGHT = 120;

const basemaps = [
  { id: 'streets-v11', style: 'streets-v11', name: 'Streets' },
  { id: 'light-v10', style: 'light-v10', name: 'Light' },
  { id: 'satellite-streets-v12', style: 'satellite-streets-v12', name: 'Satellite' },
  { id: 'outdoors-v12', style: 'outdoors-v12', name: 'Outdoor' },
  { id: 'streets-v11-3d', style: 'streets-v11', name: '3D Terrain' },
  { id: 'satellite-streets-v12-3d', style: 'satellite-streets-v12', name: '3D Satellite' },
  { id: 'streets-v11-terrain', style: 'streets-v11', name: 'Streets + Terrain' },
  { id: 'light-v10-terrain', style: 'light-v10', name: 'Light + Terrain' },
  { id: 'satellite-streets-v12-terrain', style: 'satellite-streets-v12', name: 'Satellite + Terrain' },
  { id: 'streets-v11-terrain-3d', style: 'streets-v11', name: 'Streets + Terrain 3D' },
  { id: 'light-v10-terrain-3d', style: 'light-v10', name: 'Light + Terrain 3D' },
  { id: 'satellite-streets-v12-terrain-3d', style: 'satellite-streets-v12', name: 'Satellite + Terrain 3D' },
  { id: 'teton-ortho-2024', style: 'satellite-streets-v12', name: '2024 Teton Ortho' },
];

function generateThumbnailUrl(styleId) {
  // Mapbox Static Images API format
  return `https://api.mapbox.com/styles/v1/mapbox/${styleId}/static/${CENTER},${ZOOM}/${WIDTH}x${HEIGHT}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;
}

// Download all thumbnails automatically
const fs = require('fs');
const path = require('path');
const https = require('https');

function downloadThumbnail(url, filename) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(path.join(__dirname, '../public/basemaps', filename));
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else {
        file.close();
        fs.unlinkSync(path.join(__dirname, '../public/basemaps', filename));
        reject(new Error(`Failed to download: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(path.join(__dirname, '../public/basemaps', filename));
      reject(err);
    });
  });
}

// Download all thumbnails
async function downloadAll() {
  const basemapDir = path.join(__dirname, '../public/basemaps');
  if (!fs.existsSync(basemapDir)) {
    fs.mkdirSync(basemapDir, { recursive: true });
    console.log('Created directory: public/basemaps/');
  }
  
  console.log('Downloading basemap thumbnails...\n');
  
  for (const basemap of basemaps) {
    const url = generateThumbnailUrl(basemap.style);
    const filename = `${basemap.id}.png`;
    try {
      console.log(`Downloading ${basemap.name} (${basemap.id})...`);
      await downloadThumbnail(url, filename);
      console.log(`✅ Saved: ${filename}\n`);
    } catch (error) {
      console.error(`❌ Failed to download ${basemap.name}: ${error.message}\n`);
    }
  }
  console.log('✨ All thumbnails downloaded to public/basemaps/');
}

downloadAll();

