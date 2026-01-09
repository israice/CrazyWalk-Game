/**
 * Auth Controller
 * Handles user registration and login
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { PATHS } = require('../config/constants');

/**
 * Read users from CSV file
 * @returns {Array} Array of user objects
 */
function readUsers() {
  if (!fs.existsSync(PATHS.USERS_FILE)) {
    return [];
  }

  const content = fs.readFileSync(PATHS.USERS_FILE, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true
  });

  return records.map(row => ({
    // Handle 'usename' typo in csv header
    username: row.usename || row.username,
    password: row.password,
    type: row.type
  }));
}

/**
 * Append user to CSV file
 * @param {string} username
 * @param {string} password
 * @param {string} type
 */
function appendUser(username, password, type = 'user') {
  const row = `${username},${password},${type}\n`;
  fs.appendFileSync(PATHS.USERS_FILE, row);
}

/**
 * Register a new user
 * @param {Request} req
 * @param {Response} res
 */
function register(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }

  const users = readUsers();
  const existingUser = users.find(u => u.username === username);

  if (existingUser) {
    return res.json({ status: 'error', message: 'Username taken' });
  }

  appendUser(username, password, 'user');
  console.log(`User registered: ${username}`);

  res.json({ status: 'ok', message: 'User registered' });
}

/**
 * Authenticate user
 * @param {Request} req
 * @param {Response} res
 */
function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }

  const users = readUsers();
  const user = users.find(u => u.username === username && u.password === password);

  if (user) {
    console.log(`User logged in: ${username}`);
    return res.json({
      status: 'ok',
      user: {
        username: user.username,
        type: user.type
      }
    });
  }

  res.json({ status: 'error', message: 'Invalid credentials' });
}

module.exports = {
  register,
  login,
  readUsers,
  appendUser
};
