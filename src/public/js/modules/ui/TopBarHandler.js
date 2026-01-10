/**
 * TopBarHandler.js
 * 
 * Top bar UI event handlers and menu control.
 * Extracted from map-logic.js (lines 3388-3457)
 */

/**
 * Initialize top bar event handlers
 * Sets up debug button, menu button, and posters button
 * 
 * @param {Object} options - Configuration options
 * @param {Function} options.onDebugToggle - Callback when debug mode is toggled
 * @param {Function} options.onPostersToggle - Callback when posters visibility is toggled
 * @param {Function} options.updateDebugBoxIntersections - Function to update debug box intersections
 * @param {Function} options.resetWhiteLineColors - Function to reset white line colors
 * @param {Function} options.resetSelection - Function to reset selection
 * @param {Object} options.map - Leaflet map instance
 */
/**
 * Initialize top bar event handlers
 * Sets up debug button, menu button, and posters button
 * 
 * @param {Object} options - Configuration options
 * @param {Function} options.onDebugToggle - Callback when debug mode is toggled
 * @param {Function} options.onPostersToggle - Callback when posters visibility is toggled
 * @param {Function} options.updateDebugBoxIntersections - Function to update debug box intersections
 * @param {Function} options.resetWhiteLineColors - Function to reset white line colors
 * @param {Function} options.resetSelection - Function to reset selection
 * @param {Object} options.map - Leaflet map instance
 */
export function initTopBarEvents(options) {
    const context = {
        debugBtn: document.getElementById('debug-btn'),
        menuBtn: document.getElementById('menu-btn'),
        topBar: document.getElementById('top-bar'),
        mapElement: document.getElementById('map'),
        btnDebugPosters: document.getElementById('btn-debug-posters'),
        ...options
    };

    const closeMenu = () => {
        if (context.topBar && context.topBar.classList.contains('expanded')) {
            context.topBar.classList.remove('expanded');
        }
    };

    setupDebugButton(context);
    setupMenuButton(context);
    setupPostersButton(context);
    setupMapClickHandler(context, closeMenu);

    return { closeMenu };
}

// --- Helper Functions ---

function setupDebugButton({ debugBtn, onDebugToggle, updateDebugBoxIntersections, resetWhiteLineColors, resetSelection, map }) {
    if (!debugBtn) return;

    debugBtn.addEventListener('click', () => {
        const isActive = debugBtn.classList.contains('active');
        const newState = !isActive;

        if (newState) {
            console.log("DEBUG: Debug Mode ENABLED");
            debugBtn.classList.add('active');
            document.body.classList.add('debug-mode');

            // Check for debug box intersections with white lines
            if (updateDebugBoxIntersections) {
                updateDebugBoxIntersections();
            }
        } else {
            console.log("DEBUG: Debug Mode DISABLED");
            debugBtn.classList.remove('active');
            document.body.classList.remove('debug-mode');

            // Reset all white lines to original color
            if (resetWhiteLineColors) {
                resetWhiteLineColors();
            }

            if (map) {
                map.closePopup();
            }

            if (resetSelection) {
                resetSelection();
            }
        }

        // Dispatch event for posters button visibility
        document.dispatchEvent(new CustomEvent('debug-mode-change', {
            detail: { active: newState }
        }));

        // Call callback
        if (onDebugToggle) {
            onDebugToggle(newState);
        }
    });
}

function setupMenuButton({ menuBtn, topBar }) {
    if (menuBtn && topBar) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            topBar.classList.toggle('expanded');
        });
    }
}

function setupPostersButton({ btnDebugPosters, onPostersToggle }) {
    if (btnDebugPosters) {
        btnDebugPosters.addEventListener('click', () => {
            const isActive = btnDebugPosters.classList.contains('active');
            const newState = !isActive;

            btnDebugPosters.classList.toggle('active', newState);

            // Call callback
            if (onPostersToggle) {
                onPostersToggle(newState);
            }
        });
    }
}

function setupMapClickHandler({ mapElement }, closeMenu) {
    if (mapElement) {
        mapElement.addEventListener('click', closeMenu);
    }
}
