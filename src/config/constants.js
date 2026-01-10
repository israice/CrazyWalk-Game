/**
 * Game constants for CrazyWalk
 * Redis keys, file paths, and other constants
 */

const path = require('path');

// Redis key constants
const REDIS_KEYS = {
  RED_LINES: 'game:red_lines',
  BLUE_CIRCLES: 'game:blue_circles',
  ADJACENCY: 'game:adjacency',
  WHITE_LINES: 'game:white_lines',
  GREEN_CIRCLES: 'game:green_circles',
  POLYGONS: 'game:polygons',
  GROUPS: 'game:groups',
  META: 'game:meta',
  GAME_STATE: 'game:session:state'
};

// File paths
const PATHS = {
  DATA_DIR: path.join(__dirname, '../../data'),
  USERS_FILE: path.join(__dirname, '../../data/users.csv'),
  PROMOS_DIR: path.join(__dirname, '../../data/GAME_PROMOS'),
  POSTERS_DIR: path.join(__dirname, '../../data/GAME_POSTERS')
};

// Map generation modes
const MAP_MODES = {
  INITIAL: 'initial',
  EXPAND: 'expand'
};

// Highway types for Overpass queries
const HIGHWAY_TYPES = [
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'unclassified', 'residential', 'living_street', 'pedestrian',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link',
  'tertiary_link', 'service', 'track'
];

// Allowed file extensions
const ALLOWED_EXTENSIONS = {
  images: ['.jpg', '.jpeg', '.png'],
  gifs: ['.gif']
};

// HTTP status codes
const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500
};

module.exports = {
  REDIS_KEYS,
  PATHS,
  MAP_MODES,
  HIGHWAY_TYPES,
  ALLOWED_EXTENSIONS,
  HTTP_STATUS
};
