/**
 * Centralized configuration for CrazyWalk Game
 * All environment variables and settings in one place
 */

require('dotenv').config();

const config = {
  // Server settings
  server: {
    port: parseInt(process.env.SERVER_PORT || '8000', 10),
    frontendDir: process.env.FRONTEND_INDEX_PAGE || 'src/public'
  },

  // Redis settings
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    db: 0,
    retryAttempts: 3
  },

  // External APIs
  apis: {
    nominatim: {
      baseUrl: 'https://nominatim.openstreetmap.org',
      userAgent: 'CrazyWalk/1.0',
      timeout: 3000
    },
    ipApi: {
      baseUrl: 'http://ip-api.com/json',
      timeout: 5000
    },
    overpass: {
      servers: [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
      ],
      timeout: 30000
    }
  },

  // Game settings
  game: {
    greenCircleSpacing: 15,      // meters between green circles
    maxPolygonArea: 50000,       // max polygon area in sq meters
    minPolygonArea: 100,         // min polygon area in sq meters
    initialRadius: 300,          // initial map radius in meters
    expandRadius: 200,           // expand radius in meters
    posterGridSize: 3,           // poster grid dimension (3x3)
    cacheTTL: 86400              // 24 hours in seconds
  },

  // Cache TTL settings
  cache: {
    gameState: 60 * 60 * 24 * 7,     // 7 days
    locationState: 60 * 60 * 24 * 7, // 7 days
    mapData: 60 * 60 * 24,           // 24 hours
    staticAssets: 86400              // 24 hours
  }
};

module.exports = config;
