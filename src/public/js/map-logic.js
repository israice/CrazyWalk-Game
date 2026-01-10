// ========== MODULE IMPORTS ==========
// Phase 1: Pure Utilities
import { getLocationKey, parseLocationKey, getCoordinateKey, parseCoordinateKey } from './modules/utils/CoordinateUtils.js';
import { generateUID, createUIDMaps } from './modules/utils/UIDGenerator.js';
import { euclideanDistance, isWithinDistance } from './modules/utils/GeometryUtils.js';
import { showError } from './modules/ui/ErrorDisplay.js';

// Phase 2: UI Components
import { initTopBarEvents } from './modules/ui/TopBarHandler.js';
import { resetSelection, addToSelection, getSelectedLayers, clearSelection } from './modules/ui/DebugMode.js';
import { loadVersionBadge } from './modules/ui/VersionBadge.js';

// Phase 3: State Management
import { gameState, resetGameState, getCurrentPosition, setCurrentPosition, isCircleCollected, collectCircle, isCircleExpanded, markCircleExpanded } from './modules/state/GameState.js';

// Phase 4: Rendering
import { PosterRenderer } from './modules/rendering/PosterRenderer.js';
import { renderGameElements as renderGameElementsModule } from './modules/rendering/index.js';
import { createPolygonVisualsUpdater } from './modules/rendering/PolygonVisuals.js';

// Phase 5: API & State Persistence
import { loadGlobalState, loadLocationState } from './modules/api/StateLoader.js';
import { StateSaver } from './modules/api/StateSaver.js';
import { renderFromSavedState } from './modules/api/StateRestorer.js';
import { createGameDataLoader } from './modules/api/GameDataLoader.js';

// Phase 6: Event Handlers
import { setupMovementHandlers } from './modules/events/MovementHandlers.js';
import { setupDebugHandlers } from './modules/events/DebugHandlers.js';
import { setupMarkerDirectionHandler } from './modules/events/MarkerDirectionHandler.js';
import { setupDebugModeToggle } from './modules/events/DebugModeToggle.js';

// Phase 7: Debug Tools
import { lineIntersectsRect, updateDebugBoxIntersections, resetWhiteLineColors } from './modules/debug/IntersectionDebug.js';

// Phase 8: Progress & Logic
import { setupProgressHiding, findNearestActiveCircle } from './modules/logic/ProgressManager.js';
import { DebugInteractionHandler } from './modules/ui/DebugInteractionHandler.js';

// Phase 9: Core Initialization
import { createGameInitializer } from './modules/core/GameInitializer.js';

// Load version badge
loadVersionBadge();

document.addEventListener('DOMContentLoaded', () => {
    const mapElement = document.getElementById('map');
    const loadingGif = document.getElementById('loading-gif');

    // Default coordinates
    const DEFAULT_LAT = 32.05688;
    const DEFAULT_LON = 34.76878;

    // Initialize StateSaver with 2 second debounce
    const stateSaver = new StateSaver(2000);

    // Initialize Map via MapControls
    const controls = new MapControls('map', [DEFAULT_LAT, DEFAULT_LON], {
        defaultZoom: 18,
        minZoom: 3,
        maxZoom: 18
    });
    const map = controls.getMap();

    // Create dedicated panes
    map.createPane('postersPane');
    map.getPane('postersPane').style.zIndex = 200;
    map.createPane('blueCirclesPane');
    map.getPane('blueCirclesPane').style.zIndex = 450;

    // Initialize Layer Groups
    const groupsLayer = L.layerGroup().addTo(map);
    const detailsLayer = L.layerGroup();
    const expandedLayer = L.layerGroup();
    let expandedItemUids = new Set();
    let expandedCircleCoords = new Set();
    let clearedCircleCoords = new Set();
    const completedPolygonsLayer = L.layerGroup().addTo(map);
    const postersLayer = L.layerGroup().addTo(map);

    // Initialize Renderers
    const posterRenderer = new PosterRenderer(map, postersLayer, gameState);
    const debugHandler = new DebugInteractionHandler(map, gameState, posterRenderer);

    // Global tracking maps
    const circleLayerMap = new Map();
    const blueCircleLayerMap = new Map();
    const lineLayerMap = new Map();
    const greenCirclesByLine = new Map();
    const polygonState = new Map();
    const circleToPolyMap = new Map();
    let visiblePolygonIds = new Set();

    // Visibility Rules
    controls.addVisibilityRule(detailsLayer, 18);
    controls.addVisibilityRule(groupsLayer, 18);
    controls.addVisibilityRule(expandedLayer, 18);

    // Custom Marker Icon
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

    const userMarker = L.marker([DEFAULT_LAT, DEFAULT_LON], {
        icon: customIcon,
        zIndexOffset: 1000
    }).addTo(map);

    // Helper Functions
    const updateAndSaveUserPosition = (marker, lat, lon) => {
        controls.updateUserPosition(marker, lat, lon);
        setCurrentPosition(lat, lon);
    };

    const debouncedSavePosition = () => {
        stateSaver.debouncedSave(async () => {
            await stateSaver.saveGlobalState({
                gameState,
                visiblePolygonIds,
                currentPosterGrid: posterRenderer ? posterRenderer.getPosterGrid() : null
            });
        });
    };

    // Load promo GIFs
    (async () => {
        try {
            const res = await fetch('/api/promos');
            if (res.ok) gameState.promoGifCache = await res.json();
        } catch (e) {
            console.warn("DEBUG: Failed to load promo GIFs", e);
        }
    })();

    // Reveal Map Logic
    const topBarContainer = document.getElementById('top-bar-container');
    const revealMap = () => {
        if (gameState.hasRevealed) return;
        gameState.hasRevealed = true;
        map.invalidateSize();
        loadingGif.style.opacity = '0';
        mapElement.style.opacity = '1';
        topBarContainer.style.opacity = '1';
        setTimeout(() => { loadingGif.style.display = 'none'; }, 600);
    };

    // Create updatePolygonVisuals from factory
    const updatePolygonVisuals = createPolygonVisualsUpdater({
        detailsLayer,
        expandedLayer,
        completedPolygonsLayer,
        circleLayerMap,
        posterRenderer,
        gameState
    });

    // Forward declaration for circular dependency
    let loadGameData;

    // Render wrapper
    const renderGameElements = async (data, mode = 'initial') => {
        await renderGameElementsModule(data, mode, {
            map,
            groupsLayer,
            detailsLayer,
            expandedLayer,
            completedPolygonsLayer,
            postersLayer,
            circleLayerMap,
            blueCircleLayerMap,
            lineLayerMap,
            greenCirclesByLine,
            polygonState,
            circleToPolyMap,
            visiblePolygonIds,
            expandedItemUids,
            expandedCircleCoords,
            clearedCircleCoords,
            posterRenderer,
            debugHandler,
            controls,
            userMarker,
            stateSaver,
            gameState,
            updateAndSaveUserPosition,
            debouncedSavePosition,
            updatePolygonVisuals,
            resetSelection,
            loadGameData
        });
    };

    // Create loadGameData from factory
    loadGameData = createGameDataLoader({
        gameState,
        stateSaver,
        posterRenderer,
        visiblePolygonIds,
        renderGameElements,
        revealMap,
        loadingGif,
        mapElement
    });

    // Create initializeGame from factory
    const initializeGame = createGameInitializer({
        gameState,
        visiblePolygonIds,
        userMarker,
        map,
        renderGameElements,
        updateAndSaveUserPosition,
        posterRenderer,
        loadGameData,
        revealMap,
        loadingGif,
        mapElement,
        DEFAULT_LAT,
        DEFAULT_LON
    });

    // Setup marker direction handler
    setupMarkerDirectionHandler({
        userMarker,
        gameState,
        updateAndSaveUserPosition,
        map,
        debouncedSavePosition
    });

    // Setup debug mode toggle handler
    setupDebugModeToggle({ gameState, posterRenderer });

    // Load Top Bar
    fetch(`/B_map_page/components/top_bar.html?v=${Date.now()}`)
        .then(response => response.text())
        .then(html => {
            document.getElementById('top-bar-container').innerHTML = html;

            initTopBarEvents({
                onDebugToggle: (isActive) => { gameState.isDebugActive = isActive; },
                onPostersToggle: (isActive) => {
                    gameState.isPostersDebugActive = isActive;
                    posterRenderer.updatePostersVisibility();
                },
                updateDebugBoxIntersections: () => updateDebugBoxIntersections(polygonState, lineLayerMap),
                resetWhiteLineColors: () => resetWhiteLineColors(lineLayerMap),
                resetSelection,
                map
            });
        })
        .catch(err => console.error('Error loading top bar:', err));

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

    // Start game
    initializeGame();
});
