/**
 * KeyboardNavigation.js
 * Handles keyboard input for marker movement along navigation graph
 */

/**
 * Direction vectors for 8-way movement
 */
const DIAG = 0.7071; // 1/sqrt(2) for 45-degree angles
const DIR_VECTORS = {
    'UP': { x: 0, y: 1 },
    'DOWN': { x: 0, y: -1 },
    'RIGHT': { x: 1, y: 0 },
    'LEFT': { x: -1, y: 0 },
    'UP_LEFT': { x: -DIAG, y: DIAG },
    'UP_RIGHT': { x: DIAG, y: DIAG },
    'DOWN_LEFT': { x: -DIAG, y: -DIAG },
    'DOWN_RIGHT': { x: DIAG, y: -DIAG }
};

/**
 * KeyboardNavigation - Handles WASD/Arrow key input for graph traversal
 */
class KeyboardNavigation {
    constructor(mapControls) {
        this.mapControls = mapControls;
        this.pressedKeys = new Set();
        this.moveTimeout = null;
        this.isFirstPress = true;
        this.DEBOUNCE_MS = 100;
    }

    /**
     * Get current direction from pressed keys
     * @returns {string|null} Direction string or null
     */
    getDirection() {
        const up = this.pressedKeys.has('ArrowUp') || this.pressedKeys.has('w');
        const down = this.pressedKeys.has('ArrowDown') || this.pressedKeys.has('s');
        const left = this.pressedKeys.has('ArrowLeft') || this.pressedKeys.has('a');
        const right = this.pressedKeys.has('ArrowRight') || this.pressedKeys.has('d');

        // Diagonals first (combinations)
        if (up && left) return 'UP_LEFT';
        if (up && right) return 'UP_RIGHT';
        if (down && left) return 'DOWN_LEFT';
        if (down && right) return 'DOWN_RIGHT';

        // Single directions
        if (up) return 'UP';
        if (down) return 'DOWN';
        if (left) return 'LEFT';
        if (right) return 'RIGHT';

        // Q/E/Z/C fallback for diagonal hotkeys
        if (this.pressedKeys.has('q')) return 'UP_LEFT';
        if (this.pressedKeys.has('e')) return 'UP_RIGHT';
        if (this.pressedKeys.has('z')) return 'DOWN_LEFT';
        if (this.pressedKeys.has('c')) return 'DOWN_RIGHT';

        return null;
    }

    /**
     * Move to best neighbor in direction
     * @param {string} direction - Direction to move
     */
    moveSelection(direction) {
        const map = this.mapControls.map;
        const navNodes = this.mapControls.navNodes;

        if (!map || !navNodes || navNodes.length === 0) return;

        // Find current node
        let center = this.mapControls.lastPosition || map.getCenter();
        if (Array.isArray(center)) {
            center = { lat: center[0], lon: center[1] };
        } else if (center.lat && center.lng) {
            center = { lat: center.lat, lon: center.lng };
        }

        let currentNode = null;
        let minDistSq = Infinity;

        navNodes.forEach(node => {
            const d = (node.lat - center.lat) ** 2 + (node.lon - center.lon) ** 2;
            if (d < minDistSq) {
                minDistSq = d;
                currentNode = node;
            }
        });

        if (!currentNode) return;

        const targetDir = DIR_VECTORS[direction];
        if (!targetDir) return;

        let bestNeighbor = null;
        let maxScore = -Infinity;

        // Find best aligned neighbor
        currentNode.neighbors.forEach(n => {
            let dLat = n.lat - currentNode.lat;
            let dLon = n.lon - currentNode.lon;

            // Correct for aspect ratio
            const dLonCorrected = dLon * Math.cos(currentNode.lat * Math.PI / 180);

            const len = Math.sqrt(dLat * dLat + dLonCorrected * dLonCorrected);
            if (len === 0) return;

            const nX = dLonCorrected / len;
            const nY = dLat / len;

            // Dot product with target direction
            const dot = nX * targetDir.x + nY * targetDir.y;

            // Must be somewhat aligned (within ~60 degrees)
            if (dot > 0.5 && dot > maxScore) {
                maxScore = dot;
                bestNeighbor = n;
            }
        });

        if (bestNeighbor) {
            const newPos = [bestNeighbor.lat, bestNeighbor.lon];

            map.panTo(newPos);
            this.mapControls.lastPosition = newPos;

            // Dispatch event for marker update
            const event = new CustomEvent('map-move-request', {
                detail: { lat: newPos[0], lon: newPos[1], direction: direction }
            });
            document.dispatchEvent(event);
        }
    }

    /**
     * Bind keyboard event listeners
     */
    bind() {
        const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'q', 'e', 'z', 'c'];

        document.addEventListener('keydown', (e) => {
            if (!this.mapControls.keyboardEnabled) return;
            if (!navKeys.includes(e.key)) return;

            e.preventDefault();

            const isRepeat = this.pressedKeys.has(e.key);
            this.pressedKeys.add(e.key);

            if (isRepeat) {
                // Key held - move continuously
                const direction = this.getDirection();
                if (direction) this.moveSelection(direction);
            } else if (this.isFirstPress) {
                // First key - wait for combination
                this.isFirstPress = false;
                if (this.moveTimeout) clearTimeout(this.moveTimeout);
                this.moveTimeout = setTimeout(() => {
                    const direction = this.getDirection();
                    if (direction) this.moveSelection(direction);
                }, this.DEBOUNCE_MS);
            } else {
                // Additional key - restart debounce
                if (this.moveTimeout) clearTimeout(this.moveTimeout);
                this.moveTimeout = setTimeout(() => {
                    const direction = this.getDirection();
                    if (direction) this.moveSelection(direction);
                }, this.DEBOUNCE_MS);
            }
        });

        document.addEventListener('keyup', (e) => {
            this.pressedKeys.delete(e.key);
            if (this.pressedKeys.size === 0) {
                this.isFirstPress = true;
                if (this.moveTimeout) clearTimeout(this.moveTimeout);
            }
        });

        window.addEventListener('blur', () => {
            this.pressedKeys.clear();
            this.isFirstPress = true;
            if (this.moveTimeout) clearTimeout(this.moveTimeout);
        });
    }
}

// Export for browser global usage
if (typeof window !== 'undefined') {
    window.KeyboardNavigation = KeyboardNavigation;
}
