/**
 * CrazyWalk Game Server - Node.js/Express
 * Converted from Python server.py
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Import routes
const apiRoutes = require('./src/routes/api');
const authRoutes = require('./src/routes/auth');

// Import Redis utilities
const { getRedisClient, flushDatabase } = require('./src/services/redis');

// Configuration
const PORT = parseInt(process.env.SERVER_PORT || '8000', 10);
const FRONTEND_DIR = process.env.FRONTEND_INDEX_PAGE || 'CORE/FRONTEND';

// Generate unique session ID on server startup
const SERVER_SESSION_ID = uuidv4();
const SERVER_START_TIME = Math.floor(Date.now() / 1000);

console.log(`Server starting.`);
console.log(`Server Session ID: ${SERVER_SESSION_ID}`);
console.log(`Server Start Time: ${SERVER_START_TIME}`);

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Disable caching for development
app.use((req, res, next) => {
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    next();
});

// Logging middleware
app.use((req, res, next) => {
    // Filter out Chrome DevTools noise
    if (req.path.includes('com.chrome.devtools.json')) {
        return next();
    }

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`${timestamp} - ${req.method} ${req.path}`);
    next();
});

// Store session info in app.locals for access in routes
app.locals.SERVER_SESSION_ID = SERVER_SESSION_ID;
app.locals.SERVER_START_TIME = SERVER_START_TIME;

// API Routes
app.use('/api', apiRoutes);
app.use('/api', authRoutes);

// Serve README.md for version check
app.get('/README.md', (req, res) => {
    const readmePath = path.join(__dirname, 'README.md');
    if (fs.existsSync(readmePath)) {
        res.set('Content-Type', 'text/markdown; charset=utf-8');
        res.set('Cache-Control', 'no-cache');
        res.sendFile(readmePath);
    } else {
        res.status(404).send('README.md Not Found');
    }
});

// Serve poster images
app.get('/GAME_POSTERS/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const posterPath = path.join(__dirname, 'CORE', 'DATA', 'GAME_POSTERS', filename);

    if (!fs.existsSync(posterPath)) {
        console.error(`POSTER NOT FOUND: ${posterPath}`);
        return res.status(404).send('Poster Not Found');
    }

    const ext = path.extname(filename).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        return res.status(404).send('Invalid Extension');
    }

    res.set('Content-Type', ext === '.png' ? 'image/png' : 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(posterPath);
});

// Serve promo GIFs
app.get('/GAME_PROMOS/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const promoPath = path.join(__dirname, 'CORE', 'DATA', 'GAME_PROMOS', filename);

    if (!fs.existsSync(promoPath)) {
        console.error(`PROMO NOT FOUND: ${promoPath}`);
        return res.status(404).send('Promo Not Found');
    }

    if (!filename.toLowerCase().endsWith('.gif')) {
        return res.status(404).send('Invalid Extension');
    }

    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(promoPath);
});

// Serve static frontend files
const frontendPath = path.join(__dirname, FRONTEND_DIR);
if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));

    // Serve index.html for root
    app.get('/', (req, res) => {
        res.sendFile(path.join(frontendPath, 'index.html'));
    });
} else {
    console.error(`CRITICAL: Frontend directory does not exist: ${frontendPath}`);
}

// Initialize Redis and start server
async function startServer() {
    try {
        // Try to connect and flush Redis
        const redis = getRedisClient();
        await redis.ping();
        console.log('Flushing Redis database...');
        await flushDatabase();
        console.log(`✅ Redis database FLUSHED successfully (Port ${process.env.REDIS_PORT || 6379})`);
    } catch (err) {
        console.warn(`Redis connection failed: ${err.message}`);
        console.warn('Server will continue without Redis caching.');
    }

    // Start HTTP server
    const server = app.listen(PORT, () => {
        console.log(`http://localhost:${PORT}`);
    });

    // Graceful shutdown
    const shutdown = () => {
        console.log('Shutting down server...');
        server.close(() => {
            console.log('Server stopped.');
            process.exit(0);
        });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

startServer();
