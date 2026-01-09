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
export function initTopBarEvents(options) {
    const {
        onDebugToggle,
        onPostersToggle,
        updateDebugBoxIntersections,
        resetWhiteLineColors,
        resetSelection,
        map
    } = options;

    const debugBtn = document.getElementById('debug-btn');
    const menuBtn = document.getElementById('menu-btn');
    const topBar = document.getElementById('top-bar');
    const mapElement = document.getElementById('map');

    const closeMenu = () => {
        if (topBar && topBar.classList.contains('expanded')) {
            topBar.classList.remove('expanded');
        }
    };

    // Debug button handler
    if (debugBtn) {
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

    // Menu button handler
    if (menuBtn && topBar) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            topBar.classList.toggle('expanded');
        });
    }

    // POSTERS Button Handler (now in top bar)
    const btnDebugPosters = document.getElementById('btn-debug-posters');
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

    // Close menu when clicking on map
    if (mapElement) {
        mapElement.addEventListener('click', closeMenu);
    }

    return { closeMenu };
}
