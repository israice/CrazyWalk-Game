/**
 * Authentication Routes for CrazyWalk Game
 * Converted from Python server.py
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const router = express.Router();

const USERS_FILE = path.join(__dirname, '../../CORE/DATA/users.csv');

/**
 * Read users from CSV file
 * @returns {Array} Array of user objects
 */
function readUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        return [];
    }

    const content = fs.readFileSync(USERS_FILE, 'utf-8');
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
    fs.appendFileSync(USERS_FILE, row);
}

/**
 * POST /api/register
 * Register a new user
 */
router.post('/register', (req, res) => {
    try {
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
    } catch (err) {
        console.error(`Register Error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/login
 * Authenticate user
 */
router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Missing username or password' });
        }

        const users = readUsers();
        const user = users.find(u => u.username === username && u.password === password);

        if (user) {
            console.log(`User logged in: ${username}`);
            res.json({
                status: 'ok',
                user: {
                    username: user.username,
                    type: user.type
                }
            });
        } else {
            res.json({ status: 'error', message: 'Invalid credentials' });
        }
    } catch (err) {
        console.error(`Login Error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
