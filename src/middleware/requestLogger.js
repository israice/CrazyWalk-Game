/**
 * Request logging middleware
 */

/**
 * Logs incoming HTTP requests
 * Filters out Chrome DevTools noise
 */
const requestLogger = (req, res, next) => {
  // Filter out Chrome DevTools noise
  if (req.path.includes('com.chrome.devtools.json')) {
    return next();
  }

  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`${timestamp} - ${req.method} ${req.path}`);
  next();
};

module.exports = requestLogger;
