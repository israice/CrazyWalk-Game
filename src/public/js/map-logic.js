// ========== MODULE IMPORTS ==========
// Phase 1: Pure Utilities
import { getLocationKey, parseLocationKey, getCoordinateKey, parseCoordinateKey } from './modules/utils/CoordinateUtils.js';
import { generateUID, createUIDMaps } from './modules/utils/UIDGenerator.js';
import { euclideanDistance, isWithinDistance } from './modules/utils/GeometryUtils.js';
import { showError } from './modules/ui/ErrorDisplay.js';

// Phase 2: UI Components
import { initTopBarEvents } from './modules/ui/TopBarHandler.js';
import { resetSelection, addToSelection, getSelectedLayers, clearSelection } from './modules/ui/DebugMode.js';

// Phase 3: State Management
import { gameState, resetGameState, getCurrentPosition, setCurrentPosition, isCircleCollected, collectCircle, isCircleExpanded, markCircleExpanded } from './modules/state/GameState.js';

// Phase 4: Rendering
import { PosterRenderer } from './modules/rendering/PosterRenderer.js';
import { renderGameElements as renderGameElementsModule } from './modules/rendering/index.js';

// Phase 5: API & State Persistence
import { loadGlobalState, loadLocationState } from './modules/api/StateLoader.js';
import { StateSaver } from './modules/api/StateSaver.js';
import { renderFromSavedState } from './modules/api/StateRestorer.js';

// Phase 6: Event Handlers
import { setupMovementHandlers } from './modules/events/MovementHandlers.js';
import { setupDebugHandlers } from './modules/events/DebugHandlers.js';

// Phase 7: Debug Tools
import { lineIntersectsRect, updateDebugBoxIntersections, resetWhiteLineColors } from './modules/debug/IntersectionDebug.js';

// Phase 8: Progress & Logic
import { setupProgressHiding, findNearestActiveCircle } from './modules/logic/ProgressManager.js';
import { DebugInteractionHandler } from './modules/ui/DebugInteractionHandler.js'; // Phase 9: Debug UI Logic

// Version Badge Loader - Fetches version from README.md
(async function loadVersionBadge() {
    const versionBadge = document.getElementById('version-badge');

    try {
        // Fetch README.md from server root
        const response = await fetch('/README.md?t=' + Date.now());
        if (!response.ok) throw new Error('README.md not found');

        const text = await response.text();

        // Parse version from git commit line: git commit -m "v0.0.27 - ..."
        const match = text.match(/git commit -m "(v[\d.]+)/m);
        if (!match) throw new Error('Version not found in README.md');

        const currentVersion = match[1];

        // Update badge text
        versionBadge.textContent = currentVersion;
        versionBadge.style.opacity = '1';

    } catch (err) {
        console.warn('DEBUG: Failed to load version badge:', err.message);
        versionBadge.style.display = 'none';
    }
})();

document.addEventListener('DOMContentLoaded', () => {
    const mapElement = document.getElementById('map');
    const loadingGif = document.getElementById('loading-gif');

    // ========== STATE VARIABLES ==========
    // Note: All state variables now managed in modules/state/GameState.js
    // Access via: gameState.collectedCircles, gameState.isDebugActive, etc.
    // Helpers: isCircleCollected(key), collectCircle(key), setCurrentPosition(lat, lon), etc.

    // Default coordinates
    const DEFAULT_LAT = 32.05688;
    const DEFAULT_LON = 34.76878;

    // Note: getLocationKey now imported from modules/utils/CoordinateUtils.js


    const updateAndSaveUserPosition = (marker, lat, lon) => {
        // Update position via controls
        controls.updateUserPosition(marker, lat, lon);

        // Save current position to gameState
        setCurrentPosition(lat, lon);
        console.log(`DEBUG: Saved user position: ${lat}, ${lon}`);
    };

    // Initialize StateSaver with 2 second debounce
    const stateSaver = new StateSaver(2000);

    const debouncedSavePosition = () => {
        stateSaver.debouncedSave(async () => {
            console.log('DEBUG: Saving position to Redis (debounced)...');
            await stateSaver.saveGlobalState({
                gameState,
                visiblePolygonIds,
                currentPosterGrid: posterRenderer ? posterRenderer.getPosterGrid() : null
            });
            console.log('DEBUG: Position saved successfully');
        });
    };





    // Global helper to load promo GIFs once
    const loadPromoGifs = async () => {
        try {
            const res = await fetch('/api/promos');
            if (res.ok) {
                gameState.promoGifCache = await res.json();
                console.log(`DEBUG: Loaded ${gameState.promoGifCache.length} promo GIFs globally`);
            }
        } catch (e) {
            console.warn("DEBUG: Failed to load promo GIFs", e);
        }
    };
    loadPromoGifs(); // Trigger load immediately

    // ========== GLOBAL STATE FUNCTIONS ==========
    // Note: loadGlobalState, saveGlobalState, and renderFromSavedState are now imported from modules/api/


    // Initialize Map via MapControls (Centralized Logic)
    const controls = new MapControls('map', [DEFAULT_LAT, DEFAULT_LON], {
        defaultZoom: 18,
        minZoom: 3,  // Unrestricted Zoom Out
        maxZoom: 18  // Max Zoom In
    });
    const map = controls.getMap();

    // Create dedicated pane for posters (не затрагивается debug фильтрами)
    map.createPane('postersPane');
    map.getPane('postersPane').style.zIndex = 200; // Ниже overlay pane, но выше tile pane

    // Create dedicated pane for blue circles (всегда поверх белых линий)
    map.createPane('blueCirclesPane');
    map.getPane('blueCirclesPane').style.zIndex = 450; // Выше markerPane (400), поверх белых линий

    // --- QUADRANT NAVIGATION HELPER ---
    let lastInputTime = 0; // Debounce tracker
    let blockMouseEvents = false; // Touch Lockout flag

    // --- DEBUG SELECTION HELPERS (Global to DOMContentLoaded) ---
    // Arrays to support highlighting multiple elements (polygon perimeter + lines + circles)
    let selectedLayers = [];
    let originalStyles = [];

    // Shared Debug Maps (Global to DOMContentLoaded for access by toggleHiddenDebug)
    let _lineLayerMap = null;
    let _circleLayerMap = null;
    let _blueCircleLayerMap = null;
    let _greenCirclesByLine = null;
    let _polygonState = null;

    // Note: resetSelection now imported from modules/ui/DebugMode.js

    // ------------------------------------------------

    // Initialize Layer Groups
    const groupsLayer = L.layerGroup().addTo(map);
    const detailsLayer = L.layerGroup(); // Don't add to map yet - wait until all elements loaded
    const expandedLayer = L.layerGroup(); // Separate layer for expanded polygons (can be cleared independently)
    let expandedItemUids = new Set(); // Track UIDs of items in expandedLayer
    let expandedCircleCoords = new Set(); // Track coordinates of expanded circles (for gameState.collectedCircles cleanup)
    let clearedCircleCoords = new Set(); // Track coordinates that were intentionally cleared (don't reload from server)
    const completedPolygonsLayer = L.layerGroup().addTo(map); // Always visible layer for completed zones
    const postersLayer = L.layerGroup().addTo(map); // Background posters

    // Initialize PosterRenderer
    const posterRenderer = new PosterRenderer(map, postersLayer, gameState);

    // Initialize Debug Handler
    const debugHandler = new DebugInteractionHandler(map, gameState, posterRenderer);

    // Global circle layer tracking (persist across expand mode)
    const circleLayerMap = new Map(); // coord key -> layer (persists across renders)
    const blueCircleLayerMap = new Map(); // coord key -> blue circle layer
    const lineLayerMap = new Map(); // line id -> layer composite
    const greenCirclesByLine = new Map(); // line id -> [visual layers] (persist across renders)
    const polygonState = new Map(); // polygon id -> state (persist across renders)
    const circleToPolyMap = new Map(); // "lat,lon" -> [polygon IDs] (persist across renders)
    let visiblePolygonIds = new Set(); // Track all visible polygon IDs (initial + expanded)

    // Visibility Rules
    // 1. Details (Polygons, Lines, Circles) -> Visible ONLY at Zoom 18
    controls.addVisibilityRule(detailsLayer, 18);

    // 2. Groups (Monolith) -> Visible ONLY at Zoom 18 (Same as details)
    controls.addVisibilityRule(groupsLayer, 18);

    // 3. Expanded polygons -> Same rules as details
    controls.addVisibilityRule(expandedLayer, 18);

    // Custom Marker Icon (Visual)
    // Goal: Purple Circle (Shadow) is centered on the LatLon (Anchor). GIF stands on top.
    const customIcon = L.divIcon({
        className: 'custom-marker',
        html: `
                    <div style="transform: translate(-50%, -50%); position: relative; display: flex; align-items: center; justify-content: center;">
                        <div style="position: absolute; width: 4vh; height: 4vh; background-color: #9900ff; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 15px #9900ff; opacity: 0.8; transform: perspective(500px) rotateX(45deg);"></div>
                        <img id="marker-gif" src="/B_map_page/components/marker.gif" style="position: relative; z-index: 2; width: 8vh; height: auto; transform: translateY(-25%); bottom: 2vh;">
                    </div>
                `,
        iconSize: null,
        iconAnchor: [0, 0]
    });

    // Create Marker pinned to map
    const userMarker = L.marker([DEFAULT_LAT, DEFAULT_LON], {
        icon: customIcon,
        zIndexOffset: 1000
    }).addTo(map);

    // Handle keyboard movement requests from map_controls.js
    document.addEventListener('map-move-request', (e) => {
        const { lat, lon, direction } = e.detail;
        console.log(`DEBUG: Keyboard move request to ${lat}, ${lon} (direction: ${direction})`);

        // Move marker to new position
        userMarker.setLatLng([lat, lon]);

        // Update current position
        gameState.currentUserPosition = { lat, lon };

        // Update circle UID if we moved to a blue circle
        const coordKey = `${lat.toFixed(6)},${lon.toFixed(6)}`;
        if (window.allItems) {
            // Try to find blue circle at this position
            for (const [uid, item] of window.allItems.entries()) {
                if (item.lat !== undefined && item.lon !== undefined) {
                    const itemKey = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
                    if (itemKey === coordKey && uid.startsWith('BLUE_CIRCLE_')) {
                        gameState.currentCircleUid = uid;
                        console.log(`DEBUG: Moved to blue circle ${uid}`);
                        break;
                    }
                }
            }
        }

        // Trigger debounced save
        debouncedSavePosition();
    });


    // Reveal Map Logic (Visual Transition)
    const topBarContainer = document.getElementById('top-bar-container');
    const revealMap = () => {
        if (gameState.hasRevealed) return;
        gameState.hasRevealed = true;
        console.log("DEBUG: Revealing Map...");



        map.invalidateSize();
        loadingGif.style.opacity = '0';
        mapElement.style.opacity = '1';
        topBarContainer.style.opacity = '1';
        setTimeout(() => {
            loadingGif.style.display = 'none';
            // initPosterGrid moved to renderGameElements after polygons are loaded
        }, 600);
    };


    // --- POSTER GRID LOGIC ---
    // Moved to modules/rendering/PosterRenderer.js
    // Usage: posterRenderer.initPosterGrid(), posterRenderer.updatePosterSVG(), etc.

    // Note: showError now imported from modules/ui/ErrorDisplay.js

    // Note: showError now imported from modules/ui/ErrorDisplay.js


    const loadGameData = async (lat, lon, forceRebuild = false, mode = 'initial') => {
        console.log("GPS: ========================================");
        console.log(`GPS: Starting polygon generation for (${lat.toFixed(6)}, ${lon.toFixed(6)}) [Mode: ${mode}]`);
        console.log(`GPS: Force rebuild: ${forceRebuild}`);
        console.log("GPS: ========================================");

        // Update to new location key
        const newLocationKey = getLocationKey(lat, lon);
        console.log(`DEBUG: Location key: current=${gameState.currentLocationKey}, new=${newLocationKey}, mode=${mode}`);

        // RESTORE STATE FIRST (in initial mode only) - BEFORE checking location switch
        // This ensures we have gameState.collectedCircles/visiblePolygonIds populated before making decisions
        if (mode !== 'expand') {
            // Set flag to prevent saving during restoration
            gameState.isRestoringState = true;
            console.log(`DEBUG: 🔒 Setting gameState.isRestoringState = true (prevent saves during restoration)`);

            // Restore state from Redis (server) ONLY - no client-side storage
            try {
                console.log(`DEBUG: Attempting to restore state from Redis for location: ${newLocationKey}`);
                const serverState = await window.gameAPI.loadLocationState(newLocationKey);

                if (serverState && serverState.visible_polygon_ids && serverState.visible_polygon_ids.length > 0) {
                    console.log(`DEBUG: ✓ Found saved state in Redis: ${serverState.visible_polygon_ids.length} polygons, ${serverState.collected_circles.length} circles`);

                    // Restore polygon IDs
                    visiblePolygonIds.clear();
                    serverState.visible_polygon_ids.forEach(id => visiblePolygonIds.add(id));
                    console.log(`DEBUG: Restored ${visiblePolygonIds.size} polygon IDs from Redis`);

                    // Restore expanded circles
                    if (serverState.expanded_circles && serverState.expanded_circles.length > 0) {
                        gameState.expandedCircles.clear();
                        serverState.expanded_circles.forEach(coord => gameState.expandedCircles.add(coord));
                        console.log(`DEBUG: Restored ${gameState.expandedCircles.size} expanded circles from Redis`);
                    }

                    // Restore collected circles
                    if (serverState.collected_circles && serverState.collected_circles.length > 0) {
                        gameState.collectedCircles.clear();
                        serverState.collected_circles.forEach(coord => gameState.collectedCircles.add(coord));
                        console.log(`DEBUG: Restored ${gameState.collectedCircles.size} collected circles from Redis`);
                    }

                    // Restore blue circles
                    if (serverState.blue_circles && serverState.blue_circles.length > 0) {
                        gameState.restoredBlueCircles = serverState.blue_circles;
                        console.log(`DEBUG: Restored ${gameState.restoredBlueCircles.length} blue circles from Redis`);
                    } else {
                        gameState.restoredBlueCircles = [];
                    }

                    // Restore user position
                    if (serverState.user_position && serverState.user_position.lat !== undefined) {
                        gameState.currentUserPosition = serverState.user_position;
                        console.log(`DEBUG: Restored user position from Redis: ${gameState.currentUserPosition.lat}, ${gameState.currentUserPosition.lon}`);
                    }
                } else {
                    console.log(`DEBUG: No saved state found in Redis for location: ${newLocationKey}`);
                    gameState.restoredBlueCircles = [];
                }
            } catch (e) {
                console.warn("DEBUG: Failed to load state from Redis:", e);
                gameState.restoredBlueCircles = [];
            }
        } else {
            // Expand mode - clear restored blue circles
            gameState.restoredBlueCircles = [];
        }


        // In EXPAND mode, keep the same location key (don't switch)
        // In INITIAL mode, save old location and switch to new
        if (mode !== 'expand') {
            // Check if we're actually switching location or just reloading same location
            const isSameLocation = (gameState.currentLocationKey === newLocationKey);

            if (!isSameLocation) {
                // SAVE current location state before switching to new location
                if (gameState.currentLocationKey && gameState.collectedCircles.size > 0) {
                    console.log(`DEBUG: Saving state for ${gameState.currentLocationKey} before switching...`);
                    await saveGlobalState();
                }

                // Switch to new location
                console.log(`DEBUG: Switching location: ${gameState.currentLocationKey} -> ${newLocationKey}`);
                gameState.currentLocationKey = newLocationKey;
                // DON'T clear gameState.collectedCircles here - we just restored them above!
                // gameState.collectedCircles = new Set(); // ← REMOVED
            } else {
                // Same location - keep gameState.collectedCircles (page reload scenario)
                console.log(`DEBUG: Same location (${gameState.currentLocationKey}) - keeping collected circles in memory`);
            }
        } else {
            // EXPAND mode: Keep same location key, just save current progress
            console.log(`DEBUG: Expansion mode - Keeping location key ${gameState.currentLocationKey}`);
            console.log(`DEBUG: Retaining ${gameState.collectedCircles.size} collected circles in memory.`);

            // Save progress to current location (not switching)
            if (gameState.currentLocationKey && gameState.collectedCircles.size > 0) {
                console.log(`DEBUG: Saving expanded state for ${gameState.currentLocationKey}...`);
                await stateSaver.saveGlobalState({
                    gameState,
                    visiblePolygonIds,
                    currentPosterGrid: posterRenderer ? posterRenderer.getPosterGrid() : null
                });
            }
        }

        // Show Loading GIF and dim map (Visual Transition)
        // DON'T dim if expanding (seamless) - User Request "seamless"
        if (mode !== 'expand') {
            loadingGif.style.display = 'block';
            loadingGif.style.opacity = '1';
            mapElement.style.opacity = '0.3';
            gameState.hasRevealed = false;
        } else {
            console.log("GPS: Expansion mode - keeping map visible.");
        }

        // CHECK CACHE first (unless force rebuild OR expansion)
        // Expansion always fetches fresh data to merge
        if (mode !== 'expand' && !forceRebuild && gameState.gameDataCache.has(newLocationKey)) {
            console.log(`GPS: Using CACHED data for location ${newLocationKey}`);
            const cachedData = gameState.gameDataCache.get(newLocationKey);
            await renderGameElements(cachedData, mode);
            revealMap();
            return;
        }

        // Build URL with optional restored polygon IDs
        let url = `/api/game_data?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&rebuild=${forceRebuild}&mode=${mode}&_t=${Date.now()}`;

        // If initial mode and we have restored polygon IDs, send them to backend
        if (mode !== 'expand' && visiblePolygonIds.size > 0) {
            const polyIds = Array.from(visiblePolygonIds).join(',');
            url += `&restored_polygon_ids=${encodeURIComponent(polyIds)}`;
            console.log(`GPS: Restoring ${visiblePolygonIds.size} previously visible polygons`);
            console.log(`GPS: Backend polygon IDs being sent: ${polyIds.substring(0, 100)}...`);
        }

        console.log(`GPS: Fetching from ${url}`);

        fetch(url)
            .then(res => {
                console.log(`GPS: Response status: ${res.status}`);
                return res.json();
            })
            .then(async data => {
                console.log("GPS: Server response received");
                console.log("GPS: Response keys:", Object.keys(data));

                // Check for error in response (from retry logic)
                if (data.error) {
                    console.error(`GPS: ========================================`);
                    console.error(`GPS: SERVER ERROR: ${data.error}`);
                    console.error(`GPS: Message: ${data.message}`);
                    console.error(`GPS: ========================================`);
                    showError(`POLYGON GENERATION FAILED<br><br>${data.message}`);
                    return;
                }

                // Validate polygons exist
                if (!data.polygons || data.polygons.length === 0) {
                    console.error("GPS: No polygons in response (empty data)");
                    showError("CRITICAL ERROR<br><br>No polygons found<br>Map cannot be generated");
                    return;
                }

                console.log(`GPS: ========================================`);
                console.log(`GPS: SUCCESS! ${data.polygons.length} polygons received`);
                console.log(`GPS: Blue circles: ${data.blue_circles?.length || 0}`);
                console.log(`GPS: White lines: ${data.white_lines?.length || 0}`);
                console.log(`GPS: Green circles: ${data.green_circles?.length || 0}`);
                console.log(`GPS: ========================================`);

                // CACHE the data for this location
                gameState.gameDataCache.set(newLocationKey, data);
                console.log(`DEBUG: Cached game data for location ${newLocationKey}`);

                // ACCUMULATE to global cached data for Redis persistence
                if (mode === 'expand' && gameState.cachedGameData) {
                    // Merge new data with existing
                    gameState.cachedGameData.polygons = [...(gameState.cachedGameData.polygons || []), ...(data.polygons || [])];
                    gameState.cachedGameData.white_lines = [...(gameState.cachedGameData.white_lines || []), ...(data.white_lines || [])];
                    gameState.cachedGameData.green_circles = [...(gameState.cachedGameData.green_circles || []), ...(data.green_circles || [])];
                    gameState.cachedGameData.blue_circles = [...(gameState.cachedGameData.blue_circles || []), ...(data.blue_circles || [])];
                    // Keep original poster_grid
                    console.log(`DEBUG: Accumulated expand data - now ${gameState.cachedGameData.polygons.length} total polygons`);
                } else {
                    // Initial load - replace all
                    gameState.cachedGameData = {
                        polygons: data.polygons || [],
                        white_lines: data.white_lines || [],
                        green_circles: data.green_circles || [],
                        blue_circles: data.blue_circles || [],
                        poster_grid: data.poster_grid || [],
                        groups: data.groups || []
                    };
                    console.log(`DEBUG: Set initial gameState.cachedGameData - ${gameState.cachedGameData.polygons.length} polygons`);
                }

                await renderGameElements(data, mode);
                revealMap();

                // Save to global Redis state after rendering
                await stateSaver.saveGlobalState({
                    gameState,
                    visiblePolygonIds,
                    currentPosterGrid: posterRenderer ? posterRenderer.getPosterGrid() : null
                });
            })
            .catch(err => {
                console.error("GPS: ========================================");
                console.error("GPS: NETWORK ERROR:", err);
                console.error("GPS: ========================================");
                showError("CONNECTION ERROR<br><br>Server failed to respond<br>Please try again");
            });
    };

    // Helper function for updating polygon visuals (must be defined before renderGameElements)
    const updatePolygonVisuals = (state, lineMap) => {
        const pct = Math.floor((state.current / state.total) * 100);

        // Update Label
        if (state.label) {
            const icon = state.label.options.icon;
            icon.options.html = icon.options.html.replace(/>\d+%</, `>${pct}%<`);
            state.label.setIcon(icon);
        }

        // Check Completion
        if (state.current >= state.total) {
            console.log("DEBUG: Polygon Completed! Moving to Persistent Layer.");

            // Move to Persistent Layer
            if (detailsLayer.hasLayer(state.layer)) {
                detailsLayer.removeLayer(state.layer);
            } else {
                state.layer.remove();
            }

            if (!completedPolygonsLayer.hasLayer(state.layer)) {
                completedPolygonsLayer.addLayer(state.layer);
            }

            state.layer.setStyle({
                color: 'transparent',
                fillColor: 'transparent',
                fillOpacity: 0,
                stroke: false
            });

            // Reveal poster part
            posterRenderer.revealPolygonPart(state.coords);

            // Remove label and promo
            if (state.label) {
                if (!gameState.isPostersDebugActive) {
                    if (detailsLayer.hasLayer(state.label)) {
                        detailsLayer.removeLayer(state.label);
                    } else if (expandedLayer.hasLayer(state.label)) {
                        expandedLayer.removeLayer(state.label);
                    } else {
                        state.label.remove();
                    }
                    state.label = null;
                }
            }
            if (state.promo) {
                if (!gameState.isPostersDebugActive) {
                    if (detailsLayer.hasLayer(state.promo)) {
                        detailsLayer.removeLayer(state.promo);
                    } else if (expandedLayer.hasLayer(state.promo)) {
                        expandedLayer.removeLayer(state.promo);
                    } else {
                        state.promo.remove();
                    }
                    state.promo = null;
                }
            }

            // Hide circles at polygon vertices
            if (state.coords && circleLayerMap) {
                state.coords.forEach(coord => {
                    const key = `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
                    const circleLayer = circleLayerMap.get(key);
                    if (circleLayer && !gameState.isPostersDebugActive) {
                        if (typeof circleLayer.setStyle === 'function') {
                            circleLayer.setStyle({ opacity: 0, fillOpacity: 0 });
                        }
                    }
                });
            }
        }
    };

    const renderGameElements = async (data, mode = 'initial') => {
        // Call the modularized render function with all dependencies
        await renderGameElementsModule(data, mode, {
            // Layers
            map,
            groupsLayer,
            detailsLayer,
            expandedLayer,
            completedPolygonsLayer,
            postersLayer,

            // State Maps
            circleLayerMap,
            blueCircleLayerMap,
            lineLayerMap,
            greenCirclesByLine,
            polygonState,
            circleToPolyMap,
            visiblePolygonIds,

            // Tracking Sets
            expandedItemUids,
            expandedCircleCoords,
            clearedCircleCoords,

            // External Components
            posterRenderer,
            debugHandler,
            controls,
            userMarker,
            stateSaver,
            gameState,

            // Helper Functions
            updateAndSaveUserPosition,
            debouncedSavePosition,
            updatePolygonVisuals,
            resetSelection,
            loadGameData
        });
    };

    // ========== renderGameElements REFACTORED ==========
    // The original 1684-line function has been moved to modules:
    // - modules/rendering/RenderInitializer.js
    // - modules/rendering/PolygonRenderer.js
    // - modules/rendering/WhiteLineRenderer.js
    // - modules/rendering/BlueCircleRenderer.js
    // - modules/rendering/GreenCircleRenderer.js
    // - modules/rendering/CirclePropagation.js
    // - modules/rendering/RenderFinalizer.js
    // - modules/rendering/index.js (orchestrator)
    // ======================================================

    // LEGACY CODE REMOVED - See modules/rendering/ for implementation
    // END OF LEGACY MARKER - The following line marks where old code was removed
    // Old code was 1684 lines (lines 629-2007), now refactored into 8 modules

    // ============ CONTINUATION OF map-logic.js ============

    // Listen for keyboard navigation requests
    let lastFacingDirection = 'left'; // Marker GIF faces left by default

    document.addEventListener('map-move-request', (e) => {
        const { lat, lon, direction } = e.detail;

        // Flip marker GIF based on direction
        if (direction) {
            const isLeft = direction.includes('LEFT');
            const isRight = direction.includes('RIGHT');
            const markerGif = document.getElementById('marker-gif');

            if (isRight && lastFacingDirection !== 'right' && markerGif) {
                // Flip to face right (mirror the left-facing GIF)
                markerGif.style.transform = 'translateY(-25%) scaleX(-1)';
                lastFacingDirection = 'right';
            } else if (isLeft && lastFacingDirection !== 'left' && markerGif) {
                // Return to normal (GIF faces left naturally)
                markerGif.style.transform = 'translateY(-25%)';
                lastFacingDirection = 'left';
            }
        }

        // Move marker
        userMarker.setLatLng([lat, lon]);
        updateAndSaveUserPosition(userMarker, lat, lon);

        // Ensure map centers on it
        map.panTo([lat, lon]);
    });

    // Debug functions moved to modules/debug/IntersectionDebug.js


    // Handle Debug Mode Toggles (via map_controls.js or top bar)
    document.addEventListener('debug-mode-change', (e) => {
        gameState.isDebugActive = e.detail.active;
        const postersBtn = document.getElementById('btn-debug-posters');
        if (gameState.isDebugActive) {
            postersBtn.style.display = 'flex';
        } else {
            postersBtn.style.display = 'none';
            gameState.isPostersDebugActive = false;
            postersBtn.classList.remove('active');
            posterRenderer.updatePostersVisibility();
        }
    });

    // REVEAL MAGIC moved to PosterRenderer.revealPolygonPart




    // Navigation / Top Bar Logic (with cache-busting)
    fetch(`/B_map_page/components/top_bar.html?v=${Date.now()}`)
        .then(response => response.text())
        .then(html => {
            document.getElementById('top-bar-container').innerHTML = html;

            // Initialize top bar with proper configuration
            initTopBarEvents({
                onDebugToggle: (isActive) => {
                    gameState.isDebugActive = isActive;
                },
                onPostersToggle: (isActive) => {
                    gameState.isPostersDebugActive = isActive;
                    posterRenderer.updatePostersVisibility();
                },
                updateDebugBoxIntersections,
                resetWhiteLineColors,
                resetSelection,
                map
            });
        })
        .catch(err => console.error('Error loading top bar:', err));

    // Initial Auto-Start

    // CRITICAL: Initialize game - check Redis for saved state first, otherwise generate fresh
    const initializeGame = async () => {
        console.log(`DEBUG: === INITIALIZING GAME ===`);

        try {
            // STEP 1: Check for saved global state in Redis
            const savedState = await loadGlobalState();

            if (savedState) {
                console.log(`DEBUG: ✅ Found saved global state - restoring without regeneration`);

                // Show loading indicator
                loadingGif.style.display = 'block';
                loadingGif.style.opacity = '1';
                mapElement.style.opacity = '0.3';
                gameState.hasRevealed = false;

                // Render from saved state
                await renderFromSavedState(savedState, {
                    gameState,
                    visiblePolygonIds,
                    userMarker,
                    map,
                    renderGameElements,
                    updateAndSaveUserPosition,
                    setPosterGrid: (grid) => {
                        if (posterRenderer) {
                            posterRenderer.setPosterGrid(grid);
                        }
                    }
                });

                // Reveal map
                revealMap();

                console.log(`DEBUG: ✅ Game restored from Redis - ${savedState.polygons.length} polygons, marker at ${gameState.currentCircleUid || 'position'}`);
                return;
            }

            // STEP 2: No saved state - generate fresh (first time or after server restart)
            console.log(`DEBUG: No saved state found - generating fresh map`);

            let initialLat = DEFAULT_LAT;
            let initialLon = DEFAULT_LON;

            console.log(`DEBUG: Starting at default location: ${initialLat}, ${initialLon}`);

            // Generate new game data
            await loadGameData(initialLat, initialLon);

        } catch (e) {
            console.error(`DEBUG: Error during game initialization:`, e);
            // Fallback: try to generate fresh
            await loadGameData(DEFAULT_LAT, DEFAULT_LON);
        }
    };

    // Start game initialization
    initializeGame();

    // Initialize event handlers
    setupMovementHandlers({
        userMarker,
        gameState,
        debouncedSave: debouncedSavePosition
    });

    setupDebugHandlers({
        gameState,
        updatePostersVisibility: () => posterRenderer.updatePostersVisibility()
    });

    // Initialize top bar events (now using module)
    initTopBarEvents({
        onDebugToggle: (isActive) => {
            gameState.isDebugActive = isActive;
        },
        onPostersToggle: (isActive) => {
            gameState.isPostersDebugActive = isActive;
            posterRenderer.updatePostersVisibility();
        },
        updateDebugBoxIntersections: () => updateDebugBoxIntersections(polygonState, lineLayerMap),
        resetWhiteLineColors: () => resetWhiteLineColors(lineLayerMap),
        resetSelection,
        map
    });
});


