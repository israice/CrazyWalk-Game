/**
 * Async handler wrapper for Express routes
 * Eliminates need for try-catch in every async route handler
 */

/**
 * Wraps an async function and catches any errors, passing them to next()
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
