/**
 * Session Controller
 * Handles server session endpoints
 */

/**
 * Get server session information
 * @param {Request} req
 * @param {Response} res
 */
function getSession(req, res) {
  res.json({
    session_id: req.app.locals.SERVER_SESSION_ID,
    start_time: req.app.locals.SERVER_START_TIME
  });
  console.log(`Session info sent: ${req.app.locals.SERVER_SESSION_ID}`);
}

module.exports = {
  getSession
};
