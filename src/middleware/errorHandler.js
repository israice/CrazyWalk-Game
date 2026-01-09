/**
 * Centralized error handling middleware for Express
 */

const { HTTP_STATUS } = require('../config/constants');

/**
 * Custom application error class
 */
class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_ERROR) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Not found error (404)
 */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, HTTP_STATUS.NOT_FOUND);
  }
}

/**
 * Bad request error (400)
 */
class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, HTTP_STATUS.BAD_REQUEST);
  }
}

/**
 * Validation error (400)
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, HTTP_STATUS.BAD_REQUEST);
    this.errors = errors;
  }
}

/**
 * Global error handler middleware
 * Must be registered after all routes
 */
const errorHandler = (err, req, res, next) => {
  // Default values
  let statusCode = err.statusCode || HTTP_STATUS.INTERNAL_ERROR;
  let message = err.message || 'Internal server error';

  // Log error
  if (statusCode >= 500) {
    console.error(`[ERROR] ${err.stack || err.message}`);
  } else {
    console.warn(`[WARN] ${statusCode} - ${message}`);
  }

  // Don't expose internal errors in production
  if (statusCode === HTTP_STATUS.INTERNAL_ERROR && !err.isOperational) {
    message = 'Internal server error';
  }

  // Build response
  const response = {
    status: 'error',
    message
  };

  // Include validation errors if present
  if (err.errors && err.errors.length > 0) {
    response.errors = err.errors;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * 404 handler for unmatched routes
 */
const notFoundHandler = (req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
};

module.exports = {
  AppError,
  NotFoundError,
  BadRequestError,
  ValidationError,
  errorHandler,
  notFoundHandler
};
