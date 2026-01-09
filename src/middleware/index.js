/**
 * Middleware exports
 */

const asyncHandler = require('./asyncHandler');
const {
  AppError,
  NotFoundError,
  BadRequestError,
  ValidationError,
  errorHandler,
  notFoundHandler
} = require('./errorHandler');
const requestLogger = require('./requestLogger');

module.exports = {
  asyncHandler,
  AppError,
  NotFoundError,
  BadRequestError,
  ValidationError,
  errorHandler,
  notFoundHandler,
  requestLogger
};
