/**
 * Controllers export
 */

const sessionController = require('./sessionController');
const locationController = require('./locationController');
const gameController = require('./gameController');
const authController = require('./authController');

module.exports = {
  sessionController,
  locationController,
  gameController,
  authController
};
