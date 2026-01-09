/**
 * GitHub Webhook for Auto-Update
 * Listens for push events and triggers git pull + docker compose rebuild
 */

const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = process.env.WEBHOOK_PORT || 9000;
const SECRET = process.env.AUTOUPDATE_WEBHOOK_FROM_GITHUB || '';
const WORK_DIR = process.env.WORK_DIR || '/app';

let updateInProgress = false;

/**
 * Verify GitHub webhook signature
 */
function verifySignature(payload, signature) {
    if (!SECRET) return true; // No secret configured, skip verification

    if (!signature) {
        console.log('Missing signature header');
        return false;
    }

    const [shaName, sig] = signature.split('=');
    if (shaName !== 'sha1') {
        console.log('Only SHA1 signatures supported');
        return false;
    }

    const hmac = crypto.createHmac('sha1', SECRET);
    hmac.update(payload);
    const digest = hmac.digest('hex');

    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig));
}

/**
 * Run update commands
 */
function runUpdate() {
    if (updateInProgress) {
        console.log('Update already in progress. Skipping.');
        return;
    }

    updateInProgress = true;
    console.log('Received valid webhook. Starting update process...');

    // Step 1: git pull
    console.log('Running: git pull');
    exec('git pull', { cwd: WORK_DIR }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Git pull error: ${error.message}`);
            updateInProgress = false;
            return;
        }
        console.log(`Git pull output: ${stdout}`);
        if (stderr) console.log(`Git pull stderr: ${stderr}`);

        // Step 2: docker compose up
        console.log('Running: docker compose -p crazywalk-game -f docker-compose.prod.yml up -d --build app');
        exec(
            'docker compose -p crazywalk-game -f docker-compose.prod.yml up -d --build app',
            { cwd: WORK_DIR },
            (error, stdout, stderr) => {
                if (error) {
                    console.error(`Docker compose error: ${error.message}`);
                } else {
                    console.log(`Docker compose output: ${stdout}`);
                    if (stderr) console.log(`Docker compose stderr: ${stderr}`);
                    console.log('Update completed successfully.');
                }
                updateInProgress = false;
            }
        );
    });
}

/**
 * HTTP Request handler
 */
function requestHandler(req, res) {
    if (req.method !== 'POST' || req.url !== '/push_and_update_server') {
        res.writeHead(404);
        res.end('Not Found');
        return;
    }

    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        const signature = req.headers['x-hub-signature'];

        if (!verifySignature(body, signature)) {
            res.writeHead(403);
            res.end('Forbidden: Invalid Signature');
            return;
        }

        // Respond immediately to avoid GitHub timeout
        res.writeHead(200);
        res.end('Update triggered successfully');

        // Run update in background
        setImmediate(runUpdate);
    });
}

// Create and start server
const server = http.createServer(requestHandler);

server.listen(PORT, () => {
    console.log(`Webhook listener serving at port ${PORT}`);
});
