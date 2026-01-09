/**
 * API Routes for CrazyWalk Game
 * Thin routes that delegate to controllers
 */

const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middleware');
const { sessionController, locationController, gameController } = require('../controllers');

// Session routes
router.get('/session', sessionController.getSession);

// Location routes
router.get('/ip_locate', asyncHandler(locationController.getIpLocation));
router.get('/locate', asyncHandler(locationController.locate));
router.get('/reverse', asyncHandler(locationController.reverseProxy));
router.get('/search', asyncHandler(locationController.searchProxy));
router.get('/location_state', asyncHandler(locationController.getLocationState));
router.post('/location_state', asyncHandler(locationController.saveLocationState));

// Game routes
router.get('/game_state', asyncHandler(gameController.getGameState));
router.post('/game_state', asyncHandler(gameController.saveGameState));
router.get('/promos', gameController.getPromos);
router.get('/game_data', asyncHandler(gameController.getGameData));

module.exports = router;
