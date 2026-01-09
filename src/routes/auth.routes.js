/**
 * Authentication Routes for CrazyWalk Game
 * Thin routes that delegate to controllers
 */

const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middleware');
const { authController } = require('../controllers');

// Auth routes
router.post('/register', authController.register);
router.post('/login', authController.login);

module.exports = router;
