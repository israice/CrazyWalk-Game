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

    const renderGameElements = async (data, mode = 'initial') => {

        console.log("DEBUG: Starting Render with Progress Tracking...");

        // --- 0. INITIALIZE POSTERS & MASK EARLY ---
        // Store poster grid from server if present
        // --- 0. INITIALIZE POSTERS & MASK EARLY ---
        // Store poster grid from server if present
        if (data.poster_grid && data.poster_grid.length > 0) {
            posterRenderer.setPosterGrid(data.poster_grid);
            console.log(`DEBUG: Stored ${data.poster_grid.length} posters from server`);
        } else {
            console.log("DEBUG: No poster_grid data received from server");
            posterRenderer.setPosterGrid(null);
        }

        // Initialize poster grid UI and revealMask object
        posterRenderer.initPosterGrid(data, mode);

        // Clear layers based on mode
        if (mode !== 'expand') {
            // Initial mode: clear everything EXCEPT visiblePolygonIds (they were restored from Redis)
            groupsLayer.clearLayers();
            detailsLayer.clearLayers();
            expandedLayer.clearLayers();
            expandedItemUids.clear();
            expandedCircleCoords.clear();
            clearedCircleCoords.clear();
            // DON'T clear visiblePolygonIds - we just restored them from Redis!
            // visiblePolygonIds.clear(); ← REMOVED to preserve restored state
        } else {
            // Expand mode: DON'T clear expandedLayer - accumulate polygons!
            // We only need to clear the tracking sets for the NEW expansion

            // Note: We keep expandedItemUids and expandedCircleCoords for tracking
            // They will accumulate all expanded items across multiple expansions
            console.log(`DEBUG: Expand mode - accumulating new polygons to existing ${expandedItemUids.size} expanded items`);
        }

        // STRICT VALIDATION
        if (!data || !data.polygons || data.polygons.length === 0) {
            console.error("CRITICAL: No polygons found in game data.");
            showError("CRITICAL ERROR:<br>No polygons found.<br>Map cannot be generated.");
            return;
        }

        // --- 0. DEEP ID INTEGRATION & GLOBAL STORAGE ---
        // Only reset allItems if NOT expanding (expand mode merges with existing)
        if (mode !== 'expand') {
            window.allItems = new Map();
        } else if (!window.allItems) {
            window.allItems = new Map();
        }

        // --- 0.5 PREPARE DATA ARRAYS EARLY ---
        // Merge restored blue circles with backend data BEFORE processing
        let localBlueCircles = data.blue_circles || [];
        if (mode === 'initial' && gameState.restoredBlueCircles.length > 0) {
            // Create a map of existing blue circles from backend by coordinates
            const backendBlueCoords = new Set(
                localBlueCircles.map(bc => `${bc.lat.toFixed(7)},${bc.lon.toFixed(7)}`)
            );

            // Add restored blue circles that are NOT in backend response
            gameState.restoredBlueCircles.forEach(restoredCircle => {
                const coordKey = `${restoredCircle.lat.toFixed(7)},${restoredCircle.lon.toFixed(7)}`;
                if (!backendBlueCoords.has(coordKey)) {
                    localBlueCircles.push(restoredCircle);
                }
            });

            console.log(`DEBUG: Merged blue circles - Backend: ${data.blue_circles?.length || 0}, Restored: ${gameState.restoredBlueCircles.length}, Total: ${localBlueCircles.length}`);
        }

        // Helper to update mask paths moved to PosterRenderer
        // Access via posterRenderer.updateMaskPaths()

        // --- 1. UID/ID MAPPING (Foreign Key Normalization) ---
        // Note: generateUID and createUIDMaps now imported from modules/utils/UIDGenerator.js

        // Create UID maps using the extracted module
        const { lineIdMap, polyIdMap } = createUIDMaps(data, window.allItems, mode);

        // Update window.allItems with processed data
        if (data.white_lines) {
            data.white_lines.forEach(line => {
                window.allItems.set(line.uid, line);
                if (mode === 'expand' && !expandedItemUids.has(line.uid)) {
                    expandedItemUids.add(line.uid);
                }
            });
        }

        if (data.green_circles) {
            data.green_circles.forEach(circle => {
                window.allItems.set(circle.uid, circle);
                if (mode === 'expand' && !expandedItemUids.has(circle.uid)) {
                    expandedItemUids.add(circle.uid);
                }
            });
        }

        if (data.polygons) {
            data.polygons.forEach(poly => {
                window.allItems.set(poly.uid, poly);
                if (mode === 'expand' && !expandedItemUids.has(poly.uid)) {
                    expandedItemUids.add(poly.uid);
                }
            });
        }


        // E. Count Blue Circles per Polygon (match coords)
        if (data.polygons && localBlueCircles && localBlueCircles.length > 0) {
            // Build a Set of blue circle coordinates for fast lookup
            const blueCircleCoords = new Set(
                localBlueCircles.map(bc => `${bc.lat.toFixed(7)},${bc.lon.toFixed(7)}`)
            );

            data.polygons.forEach(poly => {
                let count = 0;
                if (poly.coords) {
                    // DEDUPLICATE polygon coords first (closing vertex = first vertex)
                    const uniquePolyCoords = new Set(
                        poly.coords.map(c => `${c[0].toFixed(7)},${c[1].toFixed(7)}`)
                    );
                    // Count how many unique polygon vertices have a blue circle
                    uniquePolyCoords.forEach(coordKey => {
                        if (blueCircleCoords.has(coordKey)) {
                            count++;
                        }
                    });
                }
                poly.blue_circles_count = count;
            });
        }

        // F. Enrich White Lines with related elements
        if (data.white_lines && localBlueCircles && localBlueCircles.length > 0 && data.green_circles) {
            // Build coord -> blue circle UID map
            const blueByCoord = new Map();
            localBlueCircles.forEach(bc => {
                const key = `${bc.lat.toFixed(7)},${bc.lon.toFixed(7)}`;
                blueByCoord.set(key, bc.uid);
            });

            // Build lineId -> green circles list
            const greenByLine = new Map();
            data.green_circles.forEach(gc => {
                if (!greenByLine.has(gc.line_id)) greenByLine.set(gc.line_id, []);
                greenByLine.get(gc.line_id).push(gc.uid);
            });

            data.white_lines.forEach(line => {
                // Find endpoint blue circles
                const startKey = `${line.start[0].toFixed(7)},${line.start[1].toFixed(7)}`;
                const endKey = `${line.end[0].toFixed(7)},${line.end[1].toFixed(7)}`;

                line.endpoint_blue_circles = [];
                if (blueByCoord.has(startKey)) line.endpoint_blue_circles.push(blueByCoord.get(startKey));
                if (blueByCoord.has(endKey)) line.endpoint_blue_circles.push(blueByCoord.get(endKey));

                // Find green circles on this line
                line.green_circles_uids = greenByLine.get(line.uid) || [];
                line.green_circles_count = line.green_circles_uids.length;
                line.total_circles = line.endpoint_blue_circles.length + line.green_circles_count;
            });
        }

        // G. Build blue circle data map for neighbor polygon calculations
        const blueCircleDataMap = new Map(); // coord key -> { connections, connected_polygon_ids }
        if (localBlueCircles && localBlueCircles.length > 0) {
            localBlueCircles.forEach(bc => {
                const key = `${bc.lat.toFixed(7)},${bc.lon.toFixed(7)}`;
                blueCircleDataMap.set(key, {
                    id: bc.id,
                    connections: bc.connections || 0,
                    connected_polygon_ids: bc.connected_polygon_ids || [],
                    connected_polygons_count: bc.connected_polygons_count || 0
                });
            });
        }

        // H. Calculate neighbor polygons for each polygon - MOVED TO SERVER
        // White Line Data Map is no longer strictly needed for this, but might be useful for other lookups if kept.

        // (Client-side calculation removed to use server-provided data)
        if (data.polygons) {
            // Ensure arrays exist if server didn't send them (backwards compat)
            data.polygons.forEach(poly => {
                if (!poly.neighbor_polygon_ids) poly.neighbor_polygon_ids = [];
                // We trust server values for counts
            });
        }

        // STATE STORAGE - Now global (defined at top)
        // polygonState, circleToPolyMap, lineLayerMap are now global and persist across renders

        // Helper to map a circle coord to polygons
        const mapCircleToPolys = (lat, lon, polyList, whiteLineId = -1) => {
            const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;

            if (!circleToPolyMap.has(key)) circleToPolyMap.set(key, []);
            const list = circleToPolyMap.get(key);

            polyList.forEach(poly => {
                let isRelevant = false;
                // Check Green Stickiness (Line ID)
                // Note: poly.boundary_white_lines and whiteLineId are now UIDs (Strings)
                if (whiteLineId !== -1 && poly.boundary_white_lines && poly.boundary_white_lines.includes(whiteLineId)) {
                    isRelevant = true;
                }
                // Check Blue Stickiness (Vertex Match)
                else if (whiteLineId === -1) {
                    // This is a blue circle. Check if it matches a vertex of the polygon.
                    const isVertex = poly.coords.some(c => Math.abs(c[0] - lat) < 0.00001 && Math.abs(c[1] - lon) < 0.00001);
                    if (isVertex) isRelevant = true;
                }

                if (isRelevant) {
                    if (!list.includes(poly.id)) list.push(poly.id);
                }
            });
        };

        // 1. Groups (REMOVED: Technical polygons no longer added to map)
        /*
        if (data.groups) {
        */

        // SHARED DEBUG LOGIC
        // resetSelection is now defined in parent scope

        // Lazy references for maps (filled after circles/lines created)
        // Variables moved to parent scope (DOMContentLoaded)

        const attachDebugClick = (layer, data, type) => {
            layer.on('click', (e) => {
                if (!gameState.isDebugActive) return;
                L.DomEvent.stopPropagation(e);

                // Highlight Logic (Safely)
                resetSelection();

                // Redirect to visual proxy if available (for Hit Layers)
                const targetLayer = layer.visualSibling || layer;

                // POLYGON LABEL SPECIAL HANDLING
                if (type === 'Polygon Label' && data.boundary_white_lines) {
                    // 1. Highlight Polygon Perimeter (border only, no fill change)
                    if (typeof targetLayer.setStyle === 'function') {
                        originalStyles.push({
                            color: targetLayer.options.color,
                            weight: targetLayer.options.weight
                        });
                        selectedLayers.push(targetLayer);
                        targetLayer.setStyle({ color: 'red', weight: 3 });
                    }

                    // 2. Highlight White Lines
                    if (_lineLayerMap) {
                        data.boundary_white_lines.forEach(lineId => {
                            const lineLayers = _lineLayerMap.get(String(lineId));
                            if (lineLayers && lineLayers.visual) {
                                originalStyles.push({
                                    color: lineLayers.visual.options.color,
                                    weight: lineLayers.visual.options.weight,
                                    dashArray: lineLayers.visual.options.dashArray,
                                    opacity: lineLayers.visual.options.opacity
                                });
                                selectedLayers.push(lineLayers.visual);
                                lineLayers.visual.setStyle({ color: 'red', weight: 3, dashArray: null, opacity: 1 });
                            }
                        });
                    }

                    // 3. Highlight Green Circles on these lines
                    if (_greenCirclesByLine) {
                        data.boundary_white_lines.forEach(lineId => {
                            const circles = _greenCirclesByLine.get(String(lineId)); // use String ID
                            if (circles) {
                                circles.forEach(circleLayer => {
                                    if (typeof circleLayer.setStyle === 'function') {
                                        originalStyles.push({
                                            color: circleLayer.options.color,
                                            weight: circleLayer.options.weight || 1,
                                            fillColor: circleLayer.options.fillColor,
                                            fillOpacity: circleLayer.options.fillOpacity
                                        });
                                        selectedLayers.push(circleLayer);
                                        circleLayer.setStyle({ color: 'red', weight: 3 });
                                    }
                                });
                            }
                        });
                    }

                    // 4. Highlight Blue Circles (vertices) on polygon coords
                    // Use fuzzy matching since coords may differ in precision
                    if (_blueCircleLayerMap && data.coords) {
                        data.coords.forEach(coord => {
                            const targetLat = coord[0];
                            const targetLon = coord[1];

                            // Fuzzy search: find blue circle within ~5m
                            for (const [key, blueCircle] of _blueCircleLayerMap) {
                                const [lat, lon] = key.split(',').map(Number);
                                const distance = Math.sqrt(
                                    Math.pow(lat - targetLat, 2) + Math.pow(lon - targetLon, 2)
                                );
                                // ~0.00005 degrees ≈ 5 meters
                                if (distance < 0.00005 && !selectedLayers.includes(blueCircle)) {
                                    if (typeof blueCircle.setStyle === 'function') {
                                        originalStyles.push({
                                            color: blueCircle.options.color,
                                            weight: blueCircle.options.weight,
                                            fillColor: blueCircle.options.fillColor,
                                            fillOpacity: blueCircle.options.fillOpacity
                                        });
                                        selectedLayers.push(blueCircle);
                                        blueCircle.setStyle({ color: 'red', weight: 4 });
                                    }
                                    break; // Found match, stop searching
                                }
                            }
                        });
                    }

                    // 5. Highlight the Label Itself (The clicked element)
                    // Note: We polyfilled setStyle on the label marker.
                    if (layer && typeof layer.setStyle === 'function' && !selectedLayers.includes(layer)) {
                        originalStyles.push({ color: 'original' }); // Mock style for restore
                        selectedLayers.push(layer);
                        layer.setStyle({ color: 'red', weight: 3 });
                    }
                }
                // WHITE LINE SPECIAL HANDLING
                else if (type === 'White Line' && data.uid) {
                    // 1. Highlight the Line itself
                    if (_lineLayerMap) {
                        const lineComposite = _lineLayerMap.get(String(data.uid));
                        if (lineComposite && lineComposite.visual) {
                            originalStyles.push({
                                color: lineComposite.visual.options.color,
                                weight: lineComposite.visual.options.weight,
                                dashArray: lineComposite.visual.options.dashArray,
                                opacity: lineComposite.visual.options.opacity
                            });
                            selectedLayers.push(lineComposite.visual);
                            lineComposite.visual.setStyle({ color: 'red', weight: 4, dashArray: null, opacity: 1 });
                        }
                    }

                    // 2. Highlight Blue Circles at endpoints
                    if (_blueCircleLayerMap && data.start && data.end) {
                        const startKey = `${data.start[0].toFixed(6)},${data.start[1].toFixed(6)}`;
                        const endKey = `${data.end[0].toFixed(6)},${data.end[1].toFixed(6)}`;

                        [startKey, endKey].forEach(key => {
                            const blueCircle = _blueCircleLayerMap.get(key);
                            if (blueCircle && typeof blueCircle.setStyle === 'function') {
                                if (!selectedLayers.includes(blueCircle)) {
                                    originalStyles.push({
                                        color: blueCircle.options.color,
                                        weight: blueCircle.options.weight,
                                        fillColor: blueCircle.options.fillColor,
                                        fillOpacity: blueCircle.options.fillOpacity
                                    });
                                    selectedLayers.push(blueCircle);
                                    blueCircle.setStyle({ color: 'red', weight: 4 });
                                }
                            }
                        });
                    }

                    // 3. Highlight Green Circles on this line
                    if (_greenCirclesByLine) {
                        const greenCircles = _greenCirclesByLine.get(String(data.uid));
                        if (greenCircles) {
                            greenCircles.forEach(circleLayer => {
                                if (typeof circleLayer.setStyle === 'function' && !selectedLayers.includes(circleLayer)) {
                                    originalStyles.push({
                                        color: circleLayer.options.color,
                                        weight: circleLayer.options.weight || 1,
                                        fillColor: circleLayer.options.fillColor,
                                        fillOpacity: circleLayer.options.fillOpacity
                                    });
                                    selectedLayers.push(circleLayer);
                                    circleLayer.setStyle({ color: 'red', weight: 3 });
                                }
                            });
                        }
                    }
                }
                // STANDARD HANDLING for other types
                else if (typeof targetLayer.setStyle === 'function') {
                    if (type.includes('Circle')) {
                        originalStyles.push({
                            color: targetLayer.options.color,
                            weight: targetLayer.options.weight,
                            fillColor: targetLayer.options.fillColor,
                            fillOpacity: targetLayer.options.fillOpacity
                        });
                        selectedLayers.push(targetLayer);
                        targetLayer.setStyle({ color: 'red', weight: 4, opacity: 1 });
                    } else if (type.includes('Line')) {
                        originalStyles.push({
                            color: targetLayer.options.color,
                            dashArray: targetLayer.options.dashArray,
                            weight: targetLayer.options.weight,
                            opacity: targetLayer.options.opacity
                        });
                        selectedLayers.push(targetLayer);
                        targetLayer.setStyle({ color: 'red', dashArray: null, weight: 4, opacity: 1 });
                    } else if (type.includes('Polygon')) {
                        originalStyles.push({
                            color: targetLayer.options.color,
                            weight: targetLayer.options.weight,
                            fillOpacity: targetLayer.options.fillOpacity
                        });
                        selectedLayers.push(targetLayer);
                        targetLayer.setStyle({ color: 'red', weight: 3 });
                    }
                }

                // PREPARE DISPLAY DATA
                // Fix for circular ref if any, and ensure UID is top
                const debugData = { ...data };
                const contentObj = { ...data };
                // Remove large arrays for display if needed, but user wants info.
                // Ensure UID is visible if property name is different
                if (data.uid) debugData.uid = data.uid;

                // prettyJSON will be finalized after stats calculations (for polygons, we add neighbor data)
                let prettyJSON = JSON.stringify(contentObj, null, 2);
                const idDisplay = contentObj.uid ? `<b>ID:</b> ${contentObj.uid}<br>` : (contentObj.id ? `<b>ID:</b> ${contentObj.id}<br>` : '');

                // CHECK TRUE VISIBILITY STATUS FROM GAME STATE (not current opacity)
                // This accounts for debug mode making hidden elements visible temporarily
                let status = 'Visible';

                if (type.includes('Green Circle') || type.includes('Blue Circle')) {
                    // Check if this circle's coordinates are in gameState.collectedCircles
                    const lat = data.lat || (data.center && data.center[0]);
                    const lon = data.lon || (data.center && data.center[1]);
                    if (lat !== undefined && lon !== undefined) {
                        const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
                        if (gameState.collectedCircles && gameState.collectedCircles.has(key)) {
                            status = 'Collected';
                        }
                    }
                } else if (type === 'Polygon Label' || type === 'Polygon') {
                    // Check if polygon is completed
                    const polyId = data.parent_polygon_uid || data.uid || data.id;
                    const pState = polygonState.get(polyId);
                    if (pState && pState.current >= pState.total) {
                        status = 'Completed';
                    }
                } else if (type === 'White Line') {
                    // White lines are hidden when ALL connected polygons are completed
                    const connectedPolys = data.connected_polygon_ids || [];
                    let allCompleted = connectedPolys.length > 0;
                    for (const polyId of connectedPolys) {
                        const pState = polygonState.get(polyId);
                        if (!pState || pState.current < pState.total) {
                            allCompleted = false;
                            break;
                        }
                    }
                    if (allCompleted && connectedPolys.length > 0) {
                        status = 'Hidden (all polys completed)';
                    }
                }

                const statusColor = status === 'Visible' ? 'green' : 'orange';
                const statusHtml = `<br>Status: <b style="color:${statusColor}">${status}</b>`;

                // CALCULATE STATS FOR POLYGONS
                let statsHtml = '';
                if (type === 'Polygon Label' || type === 'Polygon') {
                    // Use actual blue_circles_count (matched from data)
                    const blueCount = data.blue_circles_count || 0;
                    const whiteLinesCount = data.boundary_white_lines ? data.boundary_white_lines.length : 0;
                    const totalPoints = data.total_points || 0;
                    const greenCount = Math.max(0, totalPoints - blueCount); // Green = Total - Blue
                    const mergeCount = data.merge_count || 1;
                    const mergeInfo = mergeCount > 1 ? `🔗 Merged From: <b>${mergeCount}</b> polygons<br>` : '';

                    // Calculate which posters intersect with this polygon
                    const intersectingPosters = [];
                    const grid = posterRenderer.getPosterGrid();
                    if (grid && data.coords && data.coords.length > 0) {
                        // Get polygon bounds
                        let polyMinLat = Infinity, polyMaxLat = -Infinity;
                        let polyMinLon = Infinity, polyMaxLon = -Infinity;
                        data.coords.forEach(coord => {
                            polyMinLat = Math.min(polyMinLat, coord[0]);
                            polyMaxLat = Math.max(polyMaxLat, coord[0]);
                            polyMinLon = Math.min(polyMinLon, coord[1]);
                            polyMaxLon = Math.max(polyMaxLon, coord[1]);
                        });

                        // Check intersection with each poster
                        grid.forEach(poster => {
                            const intersects = !(polyMaxLat < poster.min_lat ||
                                polyMinLat > poster.max_lat ||
                                polyMaxLon < poster.min_lon ||
                                polyMinLon > poster.max_lon);
                            if (intersects) {
                                intersectingPosters.push(poster.id);
                            }
                        });
                    }

                    const posterInfo = intersectingPosters.length > 0
                        ? `🖼️ Posters: <b>${intersectingPosters.length}</b> <br>`
                        : '';

                    // Neighbor polygon info
                    // Use server-provided line-based stats
                    const connectedLines = data.stats_connected_lines || 0;
                    const missingLines = data.stats_missing_lines || 0; // "Missing Polygons" as per user def

                    const neighborInfo = (connectedLines > 0 || missingLines > 0)
                        ? `<div style="margin-top:4px; padding:4px; background:#fff3e6; border-radius:4px; border:1px solid #ffd591;">
                                    <b>🏘️ Neighbors:</b><br>
                                    ✅ Connected Polygons: <b>${connectedLines}</b><br>
                                    ⚠️ Missing Polygons: <b style="color:${missingLines > 0 ? '#ff4d4f' : '#52c41a'}">${missingLines}</b>
                                   </div>`
                        : '';

                    // Add neighbor IDs to contentObj for JSON copy
                    if (data.neighbor_polygon_ids && data.neighbor_polygon_ids.length > 0) {
                        contentObj.neighbor_polygon_ids = data.neighbor_polygon_ids;
                    }
                    // Keep raw counts for JSON view if needed
                    contentObj.stats_connected_lines = connectedLines;
                    contentObj.stats_missing_lines = missingLines;

                    // Regenerate prettyJSON with new fields
                    prettyJSON = JSON.stringify(contentObj, null, 2);

                    statsHtml = `
                                <div style="margin-bottom:8px; padding:4px; background:#e6f7ff; border-radius:4px; border:1px solid #91d5ff;">
                                    <b>Polygon Stats:</b><br>
                                    ${mergeInfo}
                                    🔵 Blue Circles: <b>${blueCount}</b><br>
                                    ⚪ White Lines: <b>${whiteLinesCount}</b><br>
                                    🟢 Green Circles: <b>${greenCount}</b><br>
                                    ${posterInfo}
                                    --------------------------<br>
                                    ∑ Total Circles: <b>${totalPoints}</b>
                                    ${statusHtml}
                                </div>
                                ${neighborInfo}
                            `;
                }
                // STATS FOR WHITE LINES
                else if (type === 'White Line') {
                    const blueEndpoints = data.endpoint_blue_circles ? data.endpoint_blue_circles.length : 0;
                    const greenCount = data.green_circles_count || 0;
                    const totalCircles = data.total_circles || (blueEndpoints + greenCount);
                    const lineLength = data.length ? data.length.toFixed(2) : '?';
                    const connectedPolyCount = data.connected_polygons_count || 0;
                    const connectedPolyIds = data.connected_polygon_ids ? data.connected_polygon_ids.join(', ') : 'None';

                    const notConnVal = data.stats_not_connected_polygons !== undefined ? data.stats_not_connected_polygons : (2 - connectedPolyCount);
                    const notConnHtml = notConnVal !== undefined ? `Not Connected Polygons: <b>${notConnVal}</b><br>` : '';

                    statsHtml = `
                                <div style="margin-bottom:8px; padding:4px; background:#fff7e6; border-radius:4px; border:1px solid #ffd591;">
                                    <b>Line Stats:</b><br>
                                    📏 Length: <b>${lineLength}m</b><br>
                                    🔵 Blue Endpoints: <b>${blueEndpoints}</b><br>
                                    🟢 Green Circles: <b>${greenCount}</b><br>
                                    Connected Polygons: <b>${data.stats_connected_polygons || connectedPolyCount}</b><br>
                                    ${notConnHtml}
                                    --------------------------<br>
                                    ∑ Total Circles: <b>${totalCircles}</b>
                                    ${statusHtml}
                                </div>
                            `;
                }
                // STATS FOR BLUE CIRCLES
                else if (type.includes('Blue Circle') || (type === 'Start/End Node')) {
                    const connectedCount = data.connected_polygons_count || 0;
                    const connectedIds = data.connected_polygon_ids ? data.connected_polygon_ids.join(', ') : 'None';

                    // 2. BLUE CIRCLE
                    // Check if detailed stats are available (server-side calc)
                    if (data.stats_connected_lines !== undefined) {
                        const notConnPolys = data.stats_not_connected_polygons;
                        const notConnPolysHtml = notConnPolys !== undefined ? `Not Connected Polygons: <b>${notConnPolys}</b><br>` : '';

                        statsHtml = `
                                <div style="margin-bottom:8px; padding:4px; background:#e6f7ff; border-radius:4px; border:1px solid #91d5ff;">
                                    <b>Blue Circle Stats:</b><br>
                                    Connected lines: <b>${data.stats_connected_lines}</b><br>
                                    Not Connected lines: <b>${data.stats_not_connected_lines}</b><br>
                                    Connected Polygons: <b>${data.stats_connected_polygons}</b><br>
                                    ${notConnPolysHtml}
                                    ${statusHtml}
                                </div>
                                `;
                    } else {
                        // Fallback
                        statsHtml = `
                                <div style="margin-bottom:8px; padding:4px; background:#e6f7ff; border-radius:4px; border:1px solid #91d5ff;">
                                    <b>Blue Circle Stats:</b><br>
                                    Connections: <b>${data.connections || '?'}</b><br>
                                    🔗 Polygons: <b>${connectedCount}</b>
                                    ${statusHtml}
                                </div>
                                `;
                    }
                }
                // STATS FOR GREEN CIRCLES
                else if (type.includes('Green Circle')) {
                    const connectedCount = data.connected_polygons_count || 0;
                    const lineId = data.line_id || '?';

                    const notConnVal = data.stats_not_connected_polygons !== undefined ? data.stats_not_connected_polygons : (2 - connectedCount);
                    const notConnHtml = notConnVal !== undefined ? `Not Connected Polygons: <b>${notConnVal}</b>` : '';

                    statsHtml = `
                                <div style="margin-bottom:8px; padding:4px; background:#e6ffe6; border-radius:4px; border:1px solid #91ff91;">
                                    <b>Green Circle Stats:</b><br>
                                    📍 Line ID: <b style="font-size:10px;">${lineId}</b><br>
                                    Connected Polygons: <b>${data.stats_connected_polygons || connectedCount}</b><br>
                                    ${notConnHtml}
                                    ${statusHtml}
                                </div>
                            `;
                }

                const container = document.createElement('div');
                container.innerHTML = `
                            <div style="font-size: 11px; line-height: 1.2; color: #333;">
                                ${idDisplay}
                                <b>Type:</b> ${type}<br>
                                ${statsHtml}
                                <details>
                                    <summary style="cursor:pointer; color:#0066cc; margin:4px 0;">Show Raw Data</summary>
                                    <pre style="background:#f0f0f0; padding:4px; border-radius:4px; max-height:150px; overflow:auto; margin:4px 0;">${prettyJSON}</pre>
                                </details>
                                <button style="width:100%; cursor:pointer; padding:4px;">Copy Data</button>
                            </div>
                        `;

                const btn = container.querySelector('button');
                btn.onclick = () => {
                    navigator.clipboard.writeText(prettyJSON).then(() => {
                        btn.innerText = "Copied!";
                        setTimeout(() => btn.innerText = "Copy Data", 2000);
                    });
                };

                L.popup({ minWidth: 200 })
                    .setLatLng(e.latlng)
                    .setContent(container)
                    .openOn(map);
            });
        };

        // Helper to set lazy references after maps are created
        const setDebugMaps = (lineMap, circleMap, blueMap, greenByLine, polyState) => {
            _lineLayerMap = lineMap;
            _circleLayerMap = circleMap;
            _blueCircleLayerMap = blueMap;
            _greenCirclesByLine = greenByLine;
            _polygonState = polyState;
        };

        // Map click to clear selection
        map.on('click', () => {
            if (gameState.isDebugActive) {
                resetSelection();
                map.closePopup();
            }
        });

        // PROMO: Fetch list of GIFS
        // PROMO: Fetch list of GIFS (Removed: Now using global promoGifCache)
        // 2. Polygons (Init State)
        // Backend now filters data for initial mode, so we can use it directly
        let localPolys = data.polygons || [];
        let localGreenCircles = data.green_circles || [];
        let localWhiteLines = data.white_lines || [];

        console.log(`DEBUG: Received from backend - Polygons: ${localPolys.length}, White Lines: ${localWhiteLines.length}, Green Circles: ${localGreenCircles.length}, Blue Circles: ${localBlueCircles.length}`);

        // Choose target layer based on mode
        const targetLayer = (mode === 'expand') ? expandedLayer : detailsLayer;
        console.log(`DEBUG: Using ${mode === 'expand' ? 'expandedLayer' : 'detailsLayer'} for rendering`);

        localPolys.forEach(poly => {
            // Track this polygon as visible (use backend ID for server matching)
            if (poly.backendId) {
                visiblePolygonIds.add(poly.backendId);
            } else {
                console.warn(`WARNING: Polygon ${poly.id} has no backendId, using frontend UID`);
                visiblePolygonIds.add(poly.id);
            }

            // Skip if polygon already rendered (expand mode reuses existing polygons)
            if (polygonState.has(poly.id)) {
                console.log(`DEBUG: Polygon ${poly.id} already exists, skipping rendering`);
                return; // Don't re-render, keep existing state
            }

            // Create Visual
            const pLayer = L.polygon(poly.coords, {
                color: 'transparent', fillColor: 'transparent', fillOpacity: 0, weight: 0
            }).addTo(targetLayer);

            // attachDebugClick(pLayer, poly, 'Polygon'); // Removed per user request

            // Calculate positions for both circles
            // Large circle stays at polygon center
            // Small circle is positioned on the circumference of large circle, towards longest edge

            const centerPos = poly.center;
            const direction = poly.label_direction || { angle: 0 };

            // Large circle radius in pixels = 30px
            // Small circle should be positioned at distance = 30px + 15px = 45px from center
            // Using iconAnchor offset to position small circle relative to large circle's center

            // Calculate pixel offset for small circle based on angle
            // radius = 45px (30px large radius + 15px small radius)
            const radius_px = 45;
            const angle = direction.angle || 0;

            // Calculate offset in pixels
            // Note: In screen coordinates, Y increases downward
            const offsetX = Math.cos(angle) * radius_px;
            const offsetY = -Math.sin(angle) * radius_px; // Negative because screen Y is inverted

            // Check if polygon is already completed (all circles collected)
            // DYNAMIC CALCULATION: Count how many poly coordinates are in gameState.collectedCircles
            let savedCount = 0;
            if (poly.coords && poly.coords.length > 0) {
                savedCount = poly.coords.filter(c => {
                    const key = `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
                    return gameState.collectedCircles.has(key);
                }).length;
            }
            const isCompleted = savedCount >= poly.total_points;

            // Create Large Promo Circle at polygon center (ONLY if not completed OR in debug mode)
            // Create Large Promo Circle at polygon center (ONLY if not completed OR in debug mode)
            const gifFile = poly.promo_gif;
            let pPromo = null;
            if (gifFile && (!isCompleted || gameState.isPostersDebugActive)) {
                pPromo = L.marker([centerPos[0], centerPos[1]], {
                    icon: L.divIcon({
                        className: 'poly-promo',
                        html: `<div style="background:white; border-radius:50%; width:60px; height:60px; overflow:hidden; border:2px solid white; box-shadow:0 0 5px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center;">
                                        <img src="/GAME_PROMOS/${gifFile}" style="width:100%; height:100%; object-fit:cover;">
                                      </div>`,
                        iconSize: [60, 60],
                        iconAnchor: [30, 30] // Centered at polygon center
                    }),
                    interactive: true
                }).addTo(targetLayer);

                // --- PROMO POPUP LOGIC ---
                const popupContent = document.createElement('div');
                popupContent.innerHTML = `
                            <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; font-size: 13px; padding: 5px;">
                                <div style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                                    <b>Polygon ID:</b> ${poly.uid || poly.id}
                                </div>

                                <!-- Local Sponsor -->
                                <div style="margin-bottom: 15px;">
                                    <div style="font-weight: bold; color: #0078d4; margin-bottom: 5px;">Local Sponsor:</div>
                                    <div style="display: flex; gap: 10px; align-items: flex-start;">
                                        <div style="width: 50px; height: 50px; background: #f0f0f0; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #888;">GIF</div>
                                        <div>
                                            Next Start: <b>20.01.2026 - 18:00</b><br>
                                            Next End: <b>20.02.2026 - 18:00</b><br>
                                            Price: <b>2 USD</b>
                                        </div>
                                    </div>
                                </div>

                                <!-- Global Sponsor -->
                                <div style="margin-bottom: 15px;">
                                    <div style="font-weight: bold; color: #d13438; margin-bottom: 5px;">Global Sponsor:</div>
                                    <div style="display: flex; gap: 10px; align-items: flex-start;">
                                        <div style="width: 50px; height: 50px; background: #f0f0f0; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #888;">GIF</div>
                                        <div>
                                            Next Start: <b>16.01.2026 - 4:00</b><br>
                                            Next End: <b>16.02.2026 - 4:00</b><br>
                                            Price: <b>150 USD</b>
                                        </div>
                                    </div>
                                </div>

                                <!-- History -->
                                <div>
                                    <div style="font-weight: bold; margin-bottom: 5px;">Local Sponsor History:</div>
                                    <table style="width:100%; border-collapse: collapse; font-size: 11px; text-align: left;">
                                        <tr style="border-bottom: 1px solid #ccc; background: #f9f9f9;">
                                            <th style="padding: 4px;">GIF</th>
                                            <th style="padding: 4px;">Company</th>
                                            <th style="padding: 4px;">Start</th>
                                            <th style="padding: 4px;">End</th>
                                            <th style="padding: 4px;">Price</th>
                                        </tr>
                                        <tr>
                                            <td style="padding: 4px;">GIF</td>
                                            <td style="padding: 4px;">Some Company</td>
                                            <td style="padding: 4px;">20.01.2026<br>18:00</td>
                                            <td style="padding: 4px;">20.01.2026<br>18:00</td>
                                            <td style="padding: 4px;">1 USD</td>
                                        </tr>
                                    </table>
                                </div>
                            </div>
                        `;

                pPromo.bindPopup(popupContent, { minWidth: 300, maxWidth: 350 });

                // Highlight Lines on Popup Open
                pPromo.on('popupopen', () => {
                    if (poly.boundary_white_lines && lineLayerMap) {
                        // Initialize temp array if needed
                        if (!pPromo._tempHighlightLines) pPromo._tempHighlightLines = [];

                        poly.boundary_white_lines.forEach(lineId => {
                            const composite = lineLayerMap.get(String(lineId));
                            if (composite && composite.visual) {
                                // Create Overlay Clone (Red)
                                // Draw ON TOP of existing lines
                                const tempLine = L.polyline(composite.visual.getLatLngs(), {
                                    color: '#ff0000', // Bright Red
                                    weight: 4,
                                    opacity: 1,
                                    interactive: false,
                                    pane: 'blueCirclesPane' // Ensures correct z-index sorting
                                }).addTo(map);

                                // Apply CSS Offset to the SVG Path Element
                                // This creates the "floating" effect relative to the original white line (shadow)
                                const path = tempLine.getElement();
                                if (path) {
                                    // Ensure transition for smooth effect
                                    path.style.transition = "transform 0.15s ease-out";
                                    // Force reflow or next frame to animate? 
                                    // Usually setting it immediately renders fine, but RAF is safer for animation start.
                                    requestAnimationFrame(() => {
                                        path.style.transform = "translate(5px, -5px)"; // Up and Right
                                    });
                                }

                                pPromo._tempHighlightLines.push(tempLine);
                            }
                        });
                    }
                });

                // Restore Lines on Popup Close
                pPromo.on('popupclose', () => {
                    if (pPromo._tempHighlightLines) {
                        pPromo._tempHighlightLines.forEach(l => l.remove());
                        pPromo._tempHighlightLines = [];
                    }
                });
            }

            // Create Small Percentage Circle on circumference of large circle (ONLY if not completed OR in debug mode)
            let pLabel = null;
            if (!isCompleted || gameState.isPostersDebugActive) {
                // Calculate initial percentage from saved progress
                const initialPercent = poly.total_points > 0 ? Math.floor((savedCount / poly.total_points) * 100) : 0;
                pLabel = L.marker([centerPos[0], centerPos[1]], {
                    icon: L.divIcon({
                        className: 'poly-label',
                        html: `<div style="background:white; border-radius:50%; width:30px; height:30px; text-align:center; line-height:30px; color:black; font-size:10px; opacity: 0.8; font-weight:bold; pointer-events: auto;">${initialPercent}%</div>`,
                        iconSize: [30, 30],
                        iconAnchor: [15 - offsetX, 15 - offsetY] // Offset to position on circle edge
                    }),
                    interactive: true
                }).addTo(targetLayer);
            }

            // LABEL UID Creation and setup (ONLY if label was created - i.e., not completed)
            if (pLabel) {
                // Use polygon UID to create deterministic white circle UID (prevents duplication on expand)
                const whiteCircleUid = `WHITE_CIRCLE_${poly.uid.replace('POLYGON_', '')}`;
                pLabel.uid = whiteCircleUid; // EXPLICITLY TRACK UID ON MARKER

                const labelDebugData = {
                    uid: whiteCircleUid,
                    parent_polygon_uid: poly.uid,
                    boundary_white_lines: poly.boundary_white_lines,
                    center: poly.center,
                    label_direction: direction,  // Direction info
                    label_angle_degrees: direction.angle ? (direction.angle * 180 / Math.PI) : 0,
                    coords: poly.coords,
                    total_points: poly.total_points,
                    blue_circles_count: poly.blue_circles_count || 0,
                    merge_count: poly.merge_count || 1,
                    poster_ids: poly.poster_ids || [],
                    // Neighbor polygon data
                    neighbor_polygon_ids: poly.neighbor_polygon_ids || [],
                    neighbor_polygons_count: poly.neighbor_polygons_count || 0,
                    missing_polygons: poly.missing_polygons || 0
                };
                window.allItems.set(labelDebugData.uid, labelDebugData);

                // Link Label to Polygon for Debug Highlighting
                pLabel.visualSibling = pLayer;

                // POLYFILL: Add setStyle to Marker (DivIcon) to support Debug Highlighting
                pLabel.setStyle = function (style) {
                    const icon = this.options.icon;
                    let html = icon.options.html;

                    // Parse Style request
                    if (style.color === 'red') {
                        // Add Border
                        if (!html.includes('border: 3px solid red')) {
                            // Add border to the inner div.
                            // Note: The inner div has existing style. We append.
                            // Box-sizing is border-box, so adding border won't break layout.
                            html = html.replace('background:white;', 'background:white; border: 3px solid red;');
                        }
                    } else {
                        // Restore / Remove Border
                        html = html.replace('border: 3px solid red;', '');
                    }

                    // Update Icon
                    if (html !== icon.options.html) {
                        icon.options.html = html;
                        this.setIcon(icon);
                    }
                };

                // Attach debug click to the Label as well (shows Label + Polygon Data)
                attachDebugClick(pLabel, labelDebugData, 'Polygon Label');
            }

            // Setup Promo Debug Data if exists
            if (pPromo) {
                // Use polygon UID to create deterministic large white circle UID
                const largeWhiteCircleUid = `LARGE_WHITE_CIRCLE_${poly.uid.replace('POLYGON_', '')}`;
                const promoDebugData = {
                    uid: largeWhiteCircleUid,
                    parent_polygon_uid: poly.uid,
                    gif: gifFile,
                    // Inherit polygon stats for context
                    neighbor_polygons_count: poly.neighbor_polygons_count
                };
                window.allItems.set(promoDebugData.uid, promoDebugData);
                attachDebugClick(pPromo, promoDebugData, 'Promo Circle');
            }

            // Debug Bounding Box - must tightly wrap both circles
            // Calculate bounding box that touches the extremes of both circles
            // Large circle: center at (0,0), radius 30px
            // Small circle: center at (offsetX, offsetY), radius 15px

            // Find the extremes in all 4 directions from the large circle's center
            const smallCenterX = offsetX;
            const smallCenterY = offsetY;

            // Calculate bounds
            const maxX = Math.max(30, smallCenterX + 15); // Right edge
            const minX = Math.min(-30, smallCenterX - 15); // Left edge
            const maxY = Math.max(30, smallCenterY + 15); // Bottom edge
            const minY = Math.min(-30, smallCenterY - 15); // Top edge

            const boxWidth = maxX - minX;
            const boxHeight = maxY - minY;

            // iconAnchor should be offset from top-left corner to reach the large circle center
            const anchorX = -minX;
            const anchorY = -minY;

            const pDebugBox = L.marker([centerPos[0], centerPos[1]], {
                icon: L.divIcon({
                    className: 'debug-boundary-box',
                    html: '',
                    iconSize: [boxWidth, boxHeight],
                    iconAnchor: [anchorX, anchorY]
                }),
                interactive: false
            }).addTo(targetLayer);

            // savedCount already computed above (line ~2112)

            const pState = {
                id: poly.id, // Now uses RANDOM UID
                uid: poly.uid,
                coords: poly.coords, // Save coords for masking
                current: savedCount, // Will usually be 0 unless random check luck
                total: poly.total_points,
                layer: pLayer,
                label: pLabel,
                promo: pPromo, // Track promo for removal
                debugBox: pDebugBox, // NEW: Track debug box
                lines: poly.boundary_white_lines // New UIDs
            };


            polygonState.set(poly.id, pState);

            // Immediate Completion Check (Restoration)
            // Immediate Completion Check (Restoration)
            if (pState.current >= pState.total) {
                console.log(`DEBUG: Restoring Completed Polygon ${poly.id} to Persistent Layer`);
                // Move to Persistent Layer immediately
                if (detailsLayer.hasLayer(pLayer)) detailsLayer.removeLayer(pLayer);
                completedPolygonsLayer.addLayer(pLayer);

                pLayer.setStyle({
                    color: 'transparent',
                    fillColor: 'transparent',
                    fillOpacity: 0,
                    stroke: false
                });
                // Remove label from detailsLayer explicitly
                if (pLabel && detailsLayer.hasLayer(pLabel)) {
                    detailsLayer.removeLayer(pLabel);
                }
                // Remove promo from detailsLayer explicitly
                if (pPromo && detailsLayer.hasLayer(pPromo)) {
                    detailsLayer.removeLayer(pPromo);
                }
                pState.label = null;
                pState.promo = null;
                pState.label = null;

                // Reveal poster part
                posterRenderer.revealPolygonPart(pState.coords);

                // Hide lines (Deferred until lines are created? No, lines created later. 
                // Wait, lines are created AFTER polygons in this loop order?
                // No, Polygons are step 2, White Lines are Step 3.
                // We need to handle line hiding in Step 3 or a post-init check.)
            }
            else {
                // Update Label Text if partially complete
                const pct = Math.floor((pState.current / pState.total) * 100);
                const icon = pLabel.options.icon;
                icon.options.html = icon.options.html.replace(/>\d+%</, `>${pct}%<`);
                pLabel.setIcon(icon);
            }
        });

        // Restore poster masks for completed polygons (after all polygons initialized)
        // This ensures that when loading from cache, completed polygons show their posters
        console.log("DEBUG: Checking for completed polygons to restore poster masks...");
        let restoredMasksCount = 0;
        polygonState.forEach(state => {
            if (state.current >= state.total && state.coords) {
                console.log(`DEBUG: Restoring poster mask for completed polygon ${state.id}`);
                posterRenderer.revealPolygonPart(state.coords);
                restoredMasksCount++;
            }
        });
        console.log(`DEBUG: Restored ${restoredMasksCount} poster masks for completed polygons`);

        // 3. White Lines (Index)
        if (localWhiteLines && localWhiteLines.length > 0) {
            controls.setSnapLines(localWhiteLines);
            localWhiteLines.forEach(line => {
                // Skip if line already exists (prevent duplication in expand mode)
                if (lineLayerMap.has(String(line.id))) {
                    console.log(`DEBUG: White line ${line.id} already exists, skipping creation`);
                    return;
                }

                // Visual Layer (Thin, Dashed, Non-Interactive)
                const visual = L.polyline(line.path, {
                    color: 'white', weight: 2, dashArray: '5, 5', interactive: false,
                    pane: 'blueCirclesPane'
                }).addTo(targetLayer);

                // Hit Layer (Thick, Solid, Transparent, Interactive)
                const hit = L.polyline(line.path, {
                    color: 'white', weight: 15, opacity: 0, interactive: true,
                    pane: 'blueCirclesPane'
                }).addTo(targetLayer);

                attachDebugClick(hit, line, 'White Line');

                // Composite Proxy for Logic Handling
                const composite = {
                    visual: visual,
                    hit: hit,
                    setStyle: function (style) {
                        this.visual.setStyle(style);
                        // If hiding, disable hit layer interaction
                        if (style.opacity === 0) {
                            this.hit.setStyle({ interactive: false });
                        } else {
                            // Restore if showing
                            this.hit.setStyle({ interactive: true });
                        }
                    }
                };

                if (line.id !== undefined) {
                    lineLayerMap.set(String(line.id), composite);
                }
            });
            const currentPos = userMarker.getLatLng();
            updateAndSaveUserPosition(userMarker, currentPos.lat, currentPos.lng, gameState.isGpsActive);

            // POST-INIT: Hide lines for restored completed polygons
            // DISABLE HIDING per user request (Keep white lines visible)
            /*
            polygonState.forEach(state => {
                if (state.current >= state.total && state.lines) {
                    state.lines.forEach(lid => {
                        const lineLayer = lineLayerMap.get(String(lid));
                        if (lineLayer) {
                            lineLayer.setStyle({ opacity: 0, fillOpacity: 0 });
                        }
                    });
                }
            });
            */
        }

        // 4. Circles (Rendering + Mapping)
        // Track Layers for Hiding Logic
        // Note: circleLayerMap, blueCircleLayerMap, lineLayerMap, greenCirclesByLine are now global (defined at top)

        const addToMap = (lat, lon, layer, type, lineId = -1) => {
            const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
            circleLayerMap.set(key, layer);

            // Map to Polygons
            mapCircleToPolys(lat, lon, localPolys, lineId);
        };

        // Shared Debug Click Handler (Removed from here, moved to top)


        if (localBlueCircles && localBlueCircles.length > 0) {
            localBlueCircles.forEach(circle => {
                // Check immediate collection state to prevent flicker
                const key = `${circle.lat.toFixed(6)},${circle.lon.toFixed(6)}`;

                // Skip if already rendered (expand mode reuses existing circles)
                if (circleLayerMap.has(key)) {
                    // Circle already exists, update its data in window.allItems
                    for (const [uid, item] of window.allItems.entries()) {
                        if (item.lat !== undefined && item.lon !== undefined) {
                            const itemKey = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
                            if (itemKey === key && uid.startsWith('BLUE_CIRCLE_')) {
                                // Merge new polygon IDs with existing ones (don't duplicate)
                                const existingIds = new Set(item.connected_polygon_ids || []);
                                (circle.connected_polygon_ids || []).forEach(pid => existingIds.add(pid));
                                item.connected_polygon_ids = Array.from(existingIds);
                                item.connected_polygons_count = item.connected_polygon_ids.length;

                                // UPDATE STATS: Start by overwriting with new stats from backend
                                // The backend sends fresh stats for this node in the expansion response.
                                item.stats_connected_lines = circle.stats_connected_lines;
                                item.stats_not_connected_lines = circle.stats_not_connected_lines;
                                item.active_connections = circle.active_connections; // Ensure this is updated too
                                item.is_saturated = circle.is_saturated; // Crucial for visuals

                                // RECALCULATE Polygon Stats based on Merged Data (Global View)
                                // Backend only sees local polygons in the expansion region.
                                // Frontend has the full history.
                                item.stats_connected_polygons = item.connected_polygon_ids.length;

                                // Precise Logic: Missing = Connected Lines (Total/Expected) - Found Polygons
                                // This allows mismatch (e.g. Lines=3, Found=2, Missing=1)
                                const expectedPolygons = item.stats_connected_lines;
                                item.stats_not_connected_polygons = Math.max(0, expectedPolygons - item.stats_connected_polygons);

                                // Update visual marker state if needed (e.g. saturation color)
                                // Strict Saturation: Must have 0 Missing Polygons AND 0 Missing Lines.
                                const isNowSaturated = (item.stats_not_connected_polygons === 0) && (item.stats_not_connected_lines === 0) && (item.stats_connected_lines > 0);
                                item.is_saturated = isNowSaturated;

                                const existingMarker = circleLayerMap.get(key);
                                if (existingMarker) {
                                    existingMarker.isSaturated = isNowSaturated;
                                    if (isNowSaturated) {
                                        existingMarker.setStyle({ color: '#ff7b00', fillColor: '#ffa600' });
                                    } else {
                                        // REVERT TO BLUE if no longer saturated!
                                        existingMarker.setStyle({ color: 'blue', fillColor: '#00ccff' });
                                    }
                                }
                                break;
                            }
                        }
                    }
                    // Update polygon mapping
                    mapCircleToPolys(circle.lat, circle.lon, localPolys, -1);
                    return; // Skip rendering
                }

                // Saturated (Orange) vs Normal (Blue)
                const isSaturated = circle.is_saturated || false;
                const mainColor = isSaturated ? '#ff7b00' : 'blue';       // Orange vs Blue
                const fillColor = isSaturated ? '#ffa600' : '#00ccff';    // Light Orange vs Light Blue

                const isCollected = gameState.collectedCircles.has(key);

                // Track expanded circle coordinates
                if (mode === 'expand') {
                    expandedCircleCoords.add(key);
                }

                const marker = L.circleMarker([circle.lat, circle.lon], {
                    radius: 8,
                    color: mainColor,
                    fillColor: fillColor,
                    fillOpacity: isCollected && !gameState.isPostersDebugActive ? 0 : 0.8,
                    opacity: isCollected && !gameState.isPostersDebugActive ? 0 : 1, // Start hidden if collected!
                    interactive: !isCollected, // Disable interaction if collected
                    pane: 'blueCirclesPane' // Render in dedicated pane above white lines
                }).addTo(targetLayer);

                // If collected but debug active, style accordingly
                if (isCollected && gameState.isPostersDebugActive) {
                    marker.setStyle({ color: '#555', opacity: 0.5 });
                }

                // Save connection count for debug restoration
                marker.connections = circle.connections;
                marker.isSaturated = isSaturated; // EXPOSE FOR LOGIC

                // UID Logic & Persistence
                const blueUid = circle.id || `BLUE_CIRCLE_${circle.lat.toFixed(6)}_${circle.lon.toFixed(6)}`;
                marker.uid = blueUid;

                // Ensure data is in window.allItems for persistence (Critical for saveGlobalState)
                if (window.allItems) {
                    window.allItems.set(blueUid, {
                        ...circle,
                        id: blueUid,
                        uid: blueUid // Unified key
                    });
                }

                if (!isCollected) {
                    marker.bindTooltip(String(circle.connections), { permanent: true, direction: 'center', className: 'circle-label' });
                }

                // Blue circles are large enough, no composite needed yet unless requested
                addToMap(circle.lat, circle.lon, marker, 'blue');
                attachDebugClick(marker, circle, 'Blue Circle');

                // Track for polygon debug highlighting
                const coordKey = `${circle.lat.toFixed(6)},${circle.lon.toFixed(6)}`;
                blueCircleLayerMap.set(coordKey, marker);
            });
        }

        // --- NEIGHBOR PROPAGATION: Update relevant Blue Circles even if not in response ---
        // Expansion sends New Polygons and their "Focus" Blue Circles. All neighboring Blue Circles sharing a White Line
        // with the new Polygon must also be updated to know about the new Polygon.
        if (localPolys && localPolys.length > 0) {
            localPolys.forEach(poly => {
                const polyId = poly.id;
                (poly.boundary_white_lines || []).forEach(lineId => {
                    // Find the white line to get its endpoints
                    // We don't have a direct map of Line ID -> Objects easily accessible in scope unless we search.
                    // But we can search localWhiteLines first, then global active lines?
                    // Optimization: Iterate window.allItems to find lines? No, too slow.

                    // Better: In backend, 'white_lines' response includes ALL lines of the new polygons?
                    // Yes, 'expand' usually sends the white lines of the new polygons.
                    // Let's assume the line is in 'localWhiteLines'.

                    let whiteLine = null;
                    if (localWhiteLines) whiteLine = localWhiteLines.find(l => l.id === lineId);

                    // Optimization: Check global items directly by ID (Keys are UIDs)
                    if (!whiteLine && window.allItems) {
                        whiteLine = window.allItems.get(lineId);
                    }

                    if (whiteLine && whiteLine.endpoint_blue_circles) {
                        whiteLine.endpoint_blue_circles.forEach(bcUid => {
                            // Find this Blue Circle in global items to update it
                            if (window.allItems && window.allItems.has(bcUid)) {
                                const bcItem = window.allItems.get(bcUid);

                                // Update Connected Polygons
                                const existingIds = new Set(bcItem.connected_polygon_ids || []);
                                existingIds.add(polyId);
                                bcItem.connected_polygon_ids = Array.from(existingIds);
                                bcItem.connected_polygons_count = bcItem.connected_polygon_ids.length;

                                // RECALCULATE Stats (Local Calculation)
                                // 1. Recalculate Connected Lines (Visible)
                                // We must ensure the 'Total Lines' count increases if a new line became visible.
                                if (bcItem.connected_white_lines) {
                                    let visibleLinesCount = 0;
                                    bcItem.connected_white_lines.forEach(lid => {
                                        // Check if line is visible (in global items or local new items)
                                        let isVisible = false;
                                        if (window.allItems && window.allItems.has(lid)) isVisible = true;
                                        if (!isVisible && localWhiteLines) {
                                            if (localWhiteLines.find(l => l.id === lid)) isVisible = true;
                                        }
                                        if (isVisible) visibleLinesCount++;
                                    });
                                    bcItem.stats_connected_lines = visibleLinesCount;
                                }

                                // 2. Recalculate Connected Polygons (Visible)
                                // Precise Logic: Missing = Connected Lines - Found Polygons
                                bcItem.stats_connected_polygons = bcItem.connected_polygon_ids.length;

                                const expectedPolygons = bcItem.stats_connected_lines || bcItem.connections || 0;
                                bcItem.stats_not_connected_polygons = Math.max(0, expectedPolygons - bcItem.stats_connected_polygons);

                                // Update Saturation
                                // Strict Saturation: Must have 0 Missing Polygons AND 0 Missing Lines.
                                const isNowSaturated = (bcItem.stats_not_connected_polygons === 0) && (bcItem.stats_not_connected_lines === 0) && (bcItem.stats_connected_lines > 0);
                                bcItem.is_saturated = isNowSaturated;

                                // Update Visuals
                                const key = `${bcItem.lat.toFixed(6)},${bcItem.lon.toFixed(6)}`;
                                const marker = circleLayerMap.get(key);
                                if (marker) {
                                    marker.isSaturated = isNowSaturated;
                                    if (isNowSaturated) {
                                        marker.setStyle({ color: '#ff7b00', fillColor: '#ffa600' });
                                    } else {
                                        // REVERT TO BLUE if no longer saturated!
                                        marker.setStyle({ color: 'blue', fillColor: '#00ccff' });
                                    }
                                }
                            }
                        });
                    }
                });
            });
        }



        // --- FINAL SAFETY CHECK: Verification of ALL Blue Circles ---
        // "Is there another method to check?" -> Yes, checking EVERYTHING.
        // RECONSTRUCTION MODE: We don't just validate, we REBUILD the Blue Circle data from the White Lines.
        // This ensures that the Blue Circle's view of the world matches the Graph's reality.
        if (mode === 'expand' && window.allItems) {

            // 1. Prepare: Clear/Init stats for reconstruction?
            // Actually, safer to just Accumulate correct data, then Deduplicate.
            // We need to map [WhiteLine -> Polygons] and [WhiteLine -> BlueCircles]

            // Let's iterate ALL White Lines (Global + Local if merged)
            const relevantBlueCircles = new Set();

            window.allItems.forEach(item => {
                // Identify White Lines
                if (item.id && item.id.startsWith('WHITE_LINE_')) {
                    // Valid White Line.
                    const lineUid = item.id;
                    const linePolys = item.connected_polygon_ids || [];

                    // Propagate to Blue Circle Endpoints
                    if (item.endpoint_blue_circles) {
                        item.endpoint_blue_circles.forEach(bcUid => {
                            if (window.allItems.has(bcUid)) {
                                const bcItem = window.allItems.get(bcUid);
                                relevantBlueCircles.add(bcItem);

                                // A. Ensure this White Line UID is in the Blue Circle's list
                                // (Handling the Raw ID mismatch issue automatically by pushing UID)
                                if (!bcItem.connected_white_lines_uids) bcItem.connected_white_lines_uids = new Set();
                                bcItem.connected_white_lines_uids.add(lineUid);

                                // B. Ensure all Polygons of this Line are in the Blue Circle's list
                                if (!bcItem.connected_polygon_ids_set) bcItem.connected_polygon_ids_set = new Set(bcItem.connected_polygon_ids || []);
                                linePolys.forEach(pid => {
                                    if (window.allItems.has(pid)) { // Only add if Polygon actually exists
                                        bcItem.connected_polygon_ids_set.add(pid);
                                    }
                                });
                            }
                        });
                    }
                }
            });

            // 2. Finalize & Recalculate for all touched Blue Circles
            // (Or just all Blue Circles to be safe? Let's do all items that look like Blue Circles)
            window.allItems.forEach(item => {
                if (item.id && item.id.startsWith('BLUE_CIRCLE_')) {
                    // Flush Sets to Lists if we used them, or validate existing if we didn't touch them
                    if (item.connected_white_lines_uids) {
                        // We have reconstructed UIDs! Use them for count.
                        item.stats_connected_lines = item.connected_white_lines_uids.size;
                        // Optional: sync back to array if needed for debugging
                        // item.connected_white_lines = Array.from(item.connected_white_lines_uids); 
                    } else {
                        // Fallback: If we didn't find any white lines connecting to it via traversal,
                        // maybe it's isolated or data is weird.
                        // But we should verify validity of what it holds.
                        if (item.connected_white_lines) {
                            let visibleCount = 0;
                            item.connected_white_lines.forEach(lid => {
                                if (window.allItems.has(lid)) visibleCount++;
                            });
                            item.stats_connected_lines = visibleCount;
                        }
                    }

                    if (item.connected_polygon_ids_set) {
                        item.connected_polygon_ids = Array.from(item.connected_polygon_ids_set);
                    } else if (item.connected_polygon_ids) {
                        // Filter ghosts
                        item.connected_polygon_ids = item.connected_polygon_ids.filter(pid => window.allItems.has(pid));
                    }
                    item.stats_connected_polygons = item.connected_polygon_ids ? item.connected_polygon_ids.length : 0;

                    // 3. Recalculate Stats & Saturation
                    const expectedPolygons = item.stats_connected_lines || item.connections || 0;
                    item.stats_not_connected_polygons = Math.max(0, expectedPolygons - item.stats_connected_polygons);
                    item.stats_not_connected_lines = Math.max(0, (item.connections || 0) - (item.stats_connected_lines || 0));

                    // Strict Saturation Check
                    const isNowSaturated = (item.stats_not_connected_polygons === 0) && (item.stats_not_connected_lines === 0) && (item.stats_connected_lines > 0);
                    item.is_saturated = isNowSaturated;

                    // 4. Update Visuals
                    const key = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
                    const marker = circleLayerMap.get(key);
                    if (marker) {
                        marker.isSaturated = isNowSaturated;
                        if (marker.isSaturated) {
                            marker.setStyle({ color: '#ff7b00', fillColor: '#ffa600' });
                        } else {
                            marker.setStyle({ color: 'blue', fillColor: '#00ccff' });
                        }
                    }
                }
            });
        }

        if (localGreenCircles && localGreenCircles.length > 0) {
            localGreenCircles.forEach(circle => {
                // Check immediate collection state
                const coordKey = `${circle.lat.toFixed(6)},${circle.lon.toFixed(6)}`;

                // Skip if already rendered (expand mode reuses existing circles)
                if (circleLayerMap.has(coordKey)) {
                    // Circle already exists, just update polygon mapping
                    mapCircleToPolys(circle.lat, circle.lon, localPolys, circle.line_id || -1);

                    // Also ensure it's in greenCirclesByLine map (for hide on completion)
                    if (circle.line_id !== undefined) {
                        const existingLayer = circleLayerMap.get(coordKey);
                        if (existingLayer && existingLayer.visual) {
                            if (!greenCirclesByLine.has(circle.line_id)) {
                                greenCirclesByLine.set(circle.line_id, []);
                            }
                            // Check if not already in array to avoid duplicates
                            const circles = greenCirclesByLine.get(circle.line_id);
                            if (!circles.includes(existingLayer.visual)) {
                                circles.push(existingLayer.visual);
                            }
                        }
                    }
                    return; // Skip rendering
                }

                const isCollected = gameState.collectedCircles.has(coordKey);

                // Track expanded circle coordinates
                if (mode === 'expand') {
                    expandedCircleCoords.add(coordKey);
                }

                // Visual (Small)
                const visual = L.circleMarker([circle.lat, circle.lon], {
                    radius: 4,
                    color: 'green',
                    fillColor: '#00ff00',
                    fillOpacity: isCollected && !gameState.isPostersDebugActive ? 0 : 1,
                    opacity: isCollected && !gameState.isPostersDebugActive ? 0 : 1,
                    interactive: false,
                    pane: 'blueCirclesPane'
                }).addTo(targetLayer);

                // If collected but debug, style
                if (isCollected && gameState.isPostersDebugActive) {
                    visual.setStyle({ color: '#555', opacity: 0.5 });
                }

                // Hit (Large)
                const hit = L.circleMarker([circle.lat, circle.lon], {
                    radius: 12, stroke: false, fillOpacity: 0,
                    interactive: !isCollected, // Disable hit if collected
                    pane: 'blueCirclesPane'
                }).addTo(targetLayer);

                hit.visualSibling = visual; // Helper for Debug Highlighting

                attachDebugClick(hit, circle, 'Green Circle');

                // Composite Proxy
                const composite = {
                    visual: visual,
                    hit: hit,
                    get options() { return this.visual.options; }, // Dynamic Getter to ensure live state Check
                    setStyle: function (style) {
                        this.visual.setStyle(style);
                        // If hiding, disable hit layer
                        if (style.opacity === 0) {
                            this.hit.setStyle({ interactive: false });
                        } else {
                            this.hit.setStyle({ interactive: true });
                        }
                    },
                    getTooltip: function () { return this.visual.getTooltip(); }, // Pass through (Fix Context)
                    unbindTooltip: function () { return this.visual.unbindTooltip(); }
                };

                addToMap(circle.lat, circle.lon, composite, 'green', circle.line_id);

                // Track for polygon debug highlighting (by line_id)
                if (circle.line_id !== undefined) {
                    if (!greenCirclesByLine.has(circle.line_id)) {
                        greenCirclesByLine.set(circle.line_id, []);
                    }
                    greenCirclesByLine.get(circle.line_id).push(visual);
                }
            });
        }

        // STEP 1: Update connected_polygon_ids for ALL existing blue circles with new polygon UIDs
        if (mode === 'expand') {
            // Create a map of white line endpoints to polygon UIDs from localPolys
            const endpointToPolyIds = new Map();
            localPolys.forEach(poly => {
                const whiteLines = poly.whiteLines || [];
                whiteLines.forEach(line => {
                    // Add start point
                    const startKey = `${line.start[0].toFixed(6)},${line.start[1].toFixed(6)}`;
                    if (!endpointToPolyIds.has(startKey)) {
                        endpointToPolyIds.set(startKey, new Set());
                    }
                    endpointToPolyIds.get(startKey).add(poly.id);

                    // Add end point
                    const endKey = `${line.end[0].toFixed(6)},${line.end[1].toFixed(6)}`;
                    if (!endpointToPolyIds.has(endKey)) {
                        endpointToPolyIds.set(endKey, new Set());
                    }
                    endpointToPolyIds.get(endKey).add(poly.id);
                });
            });

            // Update ALL blue circles with new polygon IDs
            blueCircleLayerMap.forEach((layer, coordKey) => {
                // Get circle data from window.allItems
                let circleData = null;
                for (const [uid, item] of window.allItems.entries()) {
                    if (item.lat !== undefined && item.lon !== undefined) {
                        const itemKey = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
                        if (itemKey === coordKey && uid.startsWith('BLUE_CIRCLE_')) {
                            circleData = item;
                            break;
                        }
                    }
                }

                if (circleData) {
                    // Check if this circle is an endpoint of any new polygons
                    const newPolyIds = endpointToPolyIds.get(coordKey);
                    if (newPolyIds && newPolyIds.size > 0) {
                        // Merge new polygon IDs with existing ones
                        const existingIds = new Set(circleData.connected_polygon_ids || []);
                        newPolyIds.forEach(pid => existingIds.add(pid));
                        circleData.connected_polygon_ids = Array.from(existingIds);

                        console.log(`DEBUG: Updated circle ${coordKey}: added ${newPolyIds.size} new polygon IDs, total now: ${circleData.connected_polygon_ids.length}`);
                    }
                }
            });
        }

        // STEP 2: Recalculate is_saturated for ALL blue circles based on updated connected_polygon_ids
        if (mode === 'expand') {
            // Iterate through ALL circles in blueCircleLayerMap (not just new ones from data.blue_circles)
            blueCircleLayerMap.forEach((layer, coordKey) => {
                // Get circle data from window.allItems
                let circleData = null;
                for (const [uid, item] of window.allItems.entries()) {
                    if (item.lat !== undefined && item.lon !== undefined) {
                        const itemKey = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
                        if (itemKey === coordKey && uid.startsWith('BLUE_CIRCLE_')) {
                            circleData = item;
                            break;
                        }
                    }
                }

                if (circleData && circleData.connected_polygon_ids) {
                    // Count how many of this circle's polygons are currently visible
                    const visiblePolyCount = circleData.connected_polygon_ids.filter(pid => visiblePolygonIds.has(pid)).length;
                    const totalConnections = circleData.connections || 0;

                    // Circle is saturated (orange) if ALL its connections are to visible polygons
                    const shouldBeSaturated = (totalConnections === visiblePolyCount && totalConnections > 0);

                    // Update visual if saturation state changed
                    if (shouldBeSaturated !== circleData.is_saturated) {
                        circleData.is_saturated = shouldBeSaturated;
                        layer.isSaturated = shouldBeSaturated;

                        const newMainColor = shouldBeSaturated ? '#ff7b00' : 'blue';
                        const newFillColor = shouldBeSaturated ? '#ffa600' : '#00ccff';
                        layer.setStyle({ color: newMainColor, fillColor: newFillColor });

                        console.log(`DEBUG: Updated circle at ${coordKey}: connections=${totalConnections}, visible_polys=${visiblePolyCount}, is_saturated=${shouldBeSaturated}`);
                    }
                }
            });
        }

        // Set debug maps for polygon highlighting feature
        setDebugMaps(lineLayerMap, circleLayerMap, blueCircleLayerMap, greenCirclesByLine, polygonState);

        // Red Lines / Street Names removed. 
        // We now use the Google Text Overlay in map_controls.js

        // Setup Hiding Logic with Progress Tracking
        controls.checkVisibility();
        const currentZoom = map.getZoom();
        console.log(`GPS: Visibility check complete. Current zoom: ${currentZoom}. detailsLayer has ${detailsLayer.getLayers().length} layers.`);
        console.log(`GPS: Polygons visible at zoom >= 18. Current: ${currentZoom >= 18 ? 'YES' : 'NO'}`);

        // Snap logic is now imported from ProgressManager.js


        // INITIAL SNAP CHECK
        // If we have a saved user position, restore it directly (even if circle not visible)
        // Otherwise, snap to nearest active circle
        if (gameState.currentUserPosition && gameState.currentUserPosition.lat !== undefined && mode === 'initial') {
            console.log(`DEBUG: Restoring saved user position: ${gameState.currentUserPosition.lat}, ${gameState.currentUserPosition.lon}`);
            userMarker.setLatLng([gameState.currentUserPosition.lat, gameState.currentUserPosition.lon]);
            updateAndSaveUserPosition(userMarker, gameState.currentUserPosition.lat, gameState.currentUserPosition.lon, false);
        }

        // ALWAYS snap to nearest active circle on initial load (force centering)
        // This ensures the "collection" logic triggers correctly
        if (mode === 'initial') {
            console.log(`DEBUG: Mode is 'initial' - SNAP logic will execute`);
            const currentPos = userMarker.getLatLng();
            const initialSnap = findNearestActiveCircle(currentPos.lat, currentPos.lng, circleLayerMap);
            if (initialSnap) {
                console.log(`DEBUG: Initial Snap triggered! Moving from ${currentPos.lat},${currentPos.lng} to ${initialSnap.lat},${initialSnap.lon}`);
                // Move marker directly
                userMarker.setLatLng([initialSnap.lat, initialSnap.lon]);
                updateAndSaveUserPosition(userMarker, initialSnap.lat, initialSnap.lon, (gameState.isGpsActive && window.loadedQuality !== 'NONE'));
            }
        } else if (mode === 'restore') {
            // Debug logging to confirm SNAP is skipped during restoration
            console.log(`DEBUG: Mode is 'restore' - SNAP logic SKIPPED (marker should be at saved position)`);
            const currentPos = userMarker.getLatLng();
            console.log(`DEBUG: Current marker position after restore: ${currentPos.lat}, ${currentPos.lng}`);
        }

        controls.updateGraph(localGreenCircles, localBlueCircles, localWhiteLines);
        // setupProgressHiding moved to after state application

        // --- STATE APPLICATION LOGIC ---
        // Helper to apply a set of collected keys to the map state
        const applyCollectedState = (keysToApply) => {
            if (!keysToApply || keysToApply.size === 0) return;

            console.log(`DEBUG: Applying ${keysToApply.size} collected circles to state...`);
            let appliedCount = 0;

            keysToApply.forEach(key => {
                const target = circleLayerMap.get(key);

                // Ensure it's in our memory tracking
                gameState.collectedCircles.add(key);

                if (target) {
                    // Check visibility rules
                    const shouldHide = !gameState.isPostersDebugActive;
                    if (shouldHide && target.options.opacity !== 0) {
                        target.setStyle({ opacity: 0, fillOpacity: 0 });
                    }
                    if (typeof target.getTooltip === 'function' && target.getTooltip()) {
                        target.unbindTooltip();
                    }
                    // Update visual for hit box too if composite
                    if (target.visualSibling) {
                        if (shouldHide) target.visualSibling.setStyle({ opacity: 0, fillOpacity: 0 });
                    }

                    // Update visual progress maps
                    const relevantPolys = circleToPolyMap.get(key);
                    if (relevantPolys) {
                        relevantPolys.forEach(pid => {
                            const state = polygonState.get(pid);
                            if (state) state.current++; // Increment local count
                        });
                    }
                    appliedCount++;
                }
            });

            // Recalculate Polygon Completion & Visuals
            let completedAndMasked = 0;
            polygonState.forEach(state => {
                updatePolygonVisuals(state, lineLayerMap);
                if (state.current >= state.total && state.coords) {
                    completedAndMasked++;
                }
            });

            console.log(`DEBUG: Applied state. Completed polygons: ${completedAndMasked}`);

            // FORCE MASK UPDATE NOW (Synchronous)
            posterRenderer.updateMaskPaths();
        };

        // 1. SYNC APPLY: Apply what we already have in memory (Important for Expansion!)
        // Reset polygon counts first (globally for this render)
        // We'll recalculate from scratch based on gameState.collectedCircles
        polygonState.forEach(state => state.current = 0);

        if (gameState.collectedCircles.size > 0) {
            console.log(`DEBUG: Sync applying ${gameState.collectedCircles.size} memory-cached circles...`);
            applyCollectedState(gameState.collectedCircles);
        } else {
            // Even if empty, update mask (it might be empty)
            posterRenderer.updateMaskPaths();
        }

        // MOVED FROM ABOVE: Setup hiding logic (and run initial check)
        // We do this AFTER state application so that the initial check (which might collect a new circle)
        // adds to the already-restored count, rather than being wiped by the reset loop.
        setupProgressHiding({
            layerMap: circleLayerMap,
            circleMap: circleToPolyMap,
            polyState: polygonState,
            lineMap: lineLayerMap,
            blueMap: blueCircleLayerMap,
            userMarker,
            stateSaver,
            posterRenderer,
            onExpand: (lat, lon) => loadGameData(lat, lon, false, 'expand'),
            debouncedSavePosition,
            updatePolygonVisuals
        });

        // 2. ASYNC FETCH: Fetch from server/localstorage to catch up anything missing
        console.log("DEBUG: Async restoration skipped (Legacy logic removed).");

        map.on('viewreset move zoom', () => posterRenderer.updateMaskPaths());

        // Initial mask update (Important for expansion mode when bounds change!)
        posterRenderer.updateMaskPaths();

        // Update debug box intersections if debug mode is active
        if (gameState.isDebugActive) {
            console.log('DEBUG: renderGameElements complete - updating debug box intersections');
            updateDebugBoxIntersections();
        }

        // Save state after rendering (especially important for expand mode)
        if (mode === 'expand') {
            console.log('DEBUG: Expand complete - saving state...');
            await stateSaver.saveGlobalState({
                gameState,
                visiblePolygonIds,
                currentPosterGrid: posterRenderer ? posterRenderer.getPosterGrid() : null
            });
        }

        // Add layers to map AFTER all elements are loaded (synchronous rendering)
        if (!map.hasLayer(detailsLayer)) {
            detailsLayer.addTo(map);
            console.log('DEBUG: detailsLayer added to map - all elements rendered synchronously');
        }
        if (!map.hasLayer(expandedLayer)) {
            expandedLayer.addTo(map);
            console.log('DEBUG: expandedLayer added to map');
        }

        // Removed: initPosterGrid() call at end (already done at start)

        // Clear restoration flag - state is now fully restored
        if (gameState.isRestoringState) {
            gameState.isRestoringState = false;
            console.log(`DEBUG: 🔓 Setting gameState.isRestoringState = false (restoration complete, saves now allowed)`);
        }
    };




    // Restore previously collected circles from server AND LocalStorage
    // REFACTORED: Now accepts pure data or fetches if needed



    // setupProgressHiding moved to modules/logic/ProgressManager.js


    const updatePolygonVisuals = (state, lineMap) => {
        const pct = Math.floor((state.current / state.total) * 100);

        // Update Label
        if (state.label) {
            const icon = state.label.options.icon;
            // Safe update of HTML
            icon.options.html = icon.options.html.replace(/>\d+%</, `>${pct}%<`);
            state.label.setIcon(icon);
        }

        // Progress is tracked via visiblePolygonIds and persisted to Redis via saveLocationState()


        // Check Completion
        if (state.current >= state.total) {
            console.log("DEBUG: Polygon Completed! Moving to Persistent Layer.");

            // 1. Turn Green & Move to Persistent Layer
            // Remove from detailsLayer (which hides on zoom out)
            // Ensure it is explicitly removed from the hiding detailsLayer
            if (detailsLayer.hasLayer(state.layer)) {
                detailsLayer.removeLayer(state.layer);
            } else {
                state.layer.remove();
            }

            // Add to completedLayer (visible everywhere)
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
            console.log(`DEBUG: Calling revealPolygonPart for polygon ${state.id}`);
            console.log(`DEBUG: Polygon coords:`, state.coords);
            posterRenderer.revealPolygonPart(state.coords);
            console.log(`DEBUG: Polygon part revealed.`);


            // 2. Remove/Hide Label from map (could be in detailsLayer or expandedLayer)
            // In debug mode, keep label visible but update it to show 100%
            if (state.label) {
                if (!gameState.isPostersDebugActive) {
                    // Normal mode: remove label
                    if (detailsLayer.hasLayer(state.label)) {
                        detailsLayer.removeLayer(state.label);
                    } else if (expandedLayer.hasLayer(state.label)) {
                        expandedLayer.removeLayer(state.label);
                    } else {
                        state.label.remove(); // Remove from any layer
                    }
                    state.label = null;
                }
                // In debug mode: label stays visible with 100%
            }
            if (state.promo) {
                if (!gameState.isPostersDebugActive) {
                    // Normal mode: remove promo
                    if (detailsLayer.hasLayer(state.promo)) {
                        detailsLayer.removeLayer(state.promo);
                    } else if (expandedLayer.hasLayer(state.promo)) {
                        expandedLayer.removeLayer(state.promo);
                    } else {
                        state.promo.remove(); // Remove from any layer
                    }
                    state.promo = null;
                }
                // In debug mode: promo stays visible
            }
            if (state.debugBox) {
                // debugBox always kept for debug functionality
                // (already only created in debug mode)
            }
            console.log("DEBUG: Polygon Completed! Moving to Persistent Layer.");

            // 3. Hide White Lines and Green Circles on those lines
            // DISABLE HIDING per user request (Keep white lines visible)
            /*
            if (state.lines) {
                state.lines.forEach(lid => {
                    const lineLayer = lineMap.get(String(lid));
                    if (lineLayer) {
                        lineLayer.setStyle({ opacity: 0, fillOpacity: 0 });
                        // Note: This might hide a line shared with an INCOMPLETE polygon.
                        // User requested: "when in perimeter of polygon no visible circles left... disappear white lines in this perimeter"
                        // This implies strict removal.
                    }
    
                    // Hide green circles on this line
                    const greenCircles = greenCirclesByLine.get(String(lid));
                    if (greenCircles && !gameState.isPostersDebugActive) {
                        greenCircles.forEach(circleLayer => {
                            if (typeof circleLayer.setStyle === 'function') {
                                circleLayer.setStyle({ opacity: 0, fillOpacity: 0 });
                            }
                        });
                    }
                });
            }
            */

            // 4. Hide ALL circles at polygon vertices (blue/white circles on boundary)
            if (state.coords && circleLayerMap) {
                state.coords.forEach(coord => {
                    const key = `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
                    const circleLayer = circleLayerMap.get(key);
                    if (circleLayer && !gameState.isPostersDebugActive) {
                        // Hide the circle completely
                        if (typeof circleLayer.setStyle === 'function') {
                            circleLayer.setStyle({ opacity: 0, fillOpacity: 0 });
                        }
                    }
                });
            }
        }
    };

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


