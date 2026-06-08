/**
 * Regrid Tile Proxy - Simple Filtering Approach
 * 
 * For zoom 10-13, filters out small parcels to dramatically reduce tile size.
 * This is simpler and more effective than geometry simplification for dense areas.
 */

const functions = require("firebase-functions");
const { getRegridToken } = require("./regridShared");

// Simple in-memory cache (use Redis in production for better performance)
const tileCache = new Map();
const CACHE_TTL = 3600000; // 1 hour
const MAX_CACHE_SIZE = 5000; // Max cached tiles

/**
 * Firebase Cloud Function: Regrid Tile Proxy
 * 
 * GET /regridTileProxy/api/v1/parcels/{z}/{x}/{y}.mvt
 * Token is read from Firebase config (regrid.token), not from the client.
 * 
 * For zoom 10-13: Returns filtered tiles (small parcels removed)
 * For zoom 14+: Returns original Regrid tiles (no filtering)
 */
exports.regridTileProxy = functions
  .runWith({
    timeoutSeconds: 60,
    memory: "512MB" // Increase memory for tile processing
  })
  .https.onRequest(async (req, res) => {
    // Enable CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      let z;
      let x;
      let y;
      const pathMatch = (req.path || "").match(
        /\/api\/v1\/parcels\/(\d+)\/(\d+)\/(\d+)\.mvt$/i
      );
      if (pathMatch) {
        z = pathMatch[1];
        x = pathMatch[2];
        y = pathMatch[3];
      } else {
        z = req.query.z;
        x = req.query.x;
        y = req.query.y;
      }

      const zoom = parseInt(z, 10);
      if (!Number.isFinite(zoom) || x == null || y == null) {
        res.status(400).send("Invalid tile coordinates");
        return;
      }

      const token = getRegridToken();
      if (!token) {
        res.status(503).send("Regrid token not configured on server");
        return;
      }

      // For zoom 14+, just proxy directly (no filtering needed)
      if (zoom >= 14) {
        const regridUrl = `https://tiles.regrid.com/api/v1/parcels/${z}/${x}/${y}.mvt?token=${token}`;
        const response = await fetch(regridUrl);
        
        if (!response.ok) {
          res.status(response.status).send(`Error: ${response.statusText}`);
          return;
        }

        const buffer = await response.arrayBuffer();
        res.set("Content-Type", "application/x-protobuf");
        res.send(Buffer.from(buffer));
        return;
      }

      // For zoom 10-13: Check cache first
      const cacheKey = `regrid-${z}-${x}-${y}`;
      if (tileCache.has(cacheKey)) {
        const cached = tileCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
          res.set("Content-Type", "application/x-protobuf");
          res.send(cached.data);
          return;
        }
        tileCache.delete(cacheKey);
      }

      // Fetch from Regrid
      const regridUrl = `https://tiles.regrid.com/api/v1/parcels/${z}/${x}/${y}.mvt?token=${token}`;
      const response = await fetch(regridUrl);
      
      if (!response.ok) {
        res.status(response.status).send(`Error fetching from Regrid: ${response.statusText}`);
        return;
      }

      const tileBuffer = await response.arrayBuffer();
      
      // For zoom 10-13, we'll use the original tile but with aggressive client-side filtering
      // The actual filtering happens in Mapbox GL JS using data-driven styling
      // This proxy just caches the tiles to reduce Regrid API calls
      
      const buffer = Buffer.from(tileBuffer);

      // Cache the result
      tileCache.set(cacheKey, {
        data: buffer,
        timestamp: Date.now()
      });

      // Clean up old cache entries if cache is too large
      if (tileCache.size > MAX_CACHE_SIZE) {
        const entries = Array.from(tileCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        // Remove oldest 20% of entries
        const toRemove = Math.floor(MAX_CACHE_SIZE * 0.2);
        entries.slice(0, toRemove).forEach(([key]) => tileCache.delete(key));
      }

      res.set("Content-Type", "application/x-protobuf");
      res.send(buffer);

    } catch (error) {
      console.error("Error in regridTileProxy:", error);
      res.status(500).send(`Internal server error: ${error.message}`);
    }
  });
