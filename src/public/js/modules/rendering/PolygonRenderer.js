/**
 * PolygonRenderer.js
 * Handles rendering of polygons, promo circles, and percentage labels
 */

import { createPromoCircle } from './polygons/PolygonPromo.js';
import { createPercentageLabel } from './polygons/PolygonLabel.js';
import { handleCompletedPolygon, restorePosterMasks } from './polygons/PolygonCompletion.js';

/**
 * Render all polygons with their associated elements
 * @param {Array} localPolys - Polygon data array
 * @param {string} mode - 'initial' or 'expand'
 * @param {Object} deps - Dependencies object
 */
export function renderPolygons(localPolys, mode, deps) {
    const {
        map,
        detailsLayer,
        expandedLayer,
        completedPolygonsLayer,
        polygonState,
        visiblePolygonIds,
        lineLayerMap,
        gameState,
        debugHandler,
        posterRenderer
    } = deps;

    if (!localPolys || localPolys.length === 0) return;

    const targetLayer = (mode === 'expand') ? expandedLayer : detailsLayer;
    console.log(`DEBUG: Using ${mode === 'expand' ? 'expandedLayer' : 'detailsLayer'} for rendering`);

    localPolys.forEach(poly => {
        // Track this polygon as visible
        if (poly.backendId) {
            visiblePolygonIds.add(poly.backendId);
        } else {
            console.warn(`WARNING: Polygon ${poly.id} has no backendId, using frontend UID`);
            visiblePolygonIds.add(poly.id);
        }

        // Skip if polygon already rendered
        if (polygonState.has(poly.id)) {
            console.log(`DEBUG: Polygon ${poly.id} already exists, skipping rendering`);
            return;
        }

        // Create polygon layer
        const pLayer = L.polygon(poly.coords, {
            color: 'transparent',
            fillColor: 'transparent',
            fillOpacity: 0,
            weight: 0
        }).addTo(targetLayer);

        // Calculate positions
        const centerPos = poly.center;
        const direction = poly.label_direction || { angle: 0 };
        const radius_px = 45;
        const angle = direction.angle || 0;
        const offsetX = Math.cos(angle) * radius_px;
        const offsetY = -Math.sin(angle) * radius_px;

        // Calculate saved progress
        let savedCount = 0;
        if (poly.coords && poly.coords.length > 0) {
            savedCount = poly.coords.filter(c => {
                const key = `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
                return gameState.collectedCircles.has(key);
            }).length;
        }
        const isCompleted = savedCount >= poly.total_points;

        // Create promo circle
        const pPromo = createPromoCircle(poly, centerPos, isCompleted, targetLayer, lineLayerMap, map, gameState, debugHandler);

        // Create percentage label
        const pLabel = createPercentageLabel(poly, centerPos, offsetX, offsetY, savedCount, isCompleted, targetLayer, gameState, debugHandler, pLayer, direction);

        // Create debug bounding box
        const pDebugBox = createDebugBox(centerPos, offsetX, offsetY, targetLayer);

        // Create polygon state
        const pState = {
            id: poly.id,
            uid: poly.uid,
            coords: poly.coords,
            current: savedCount,
            total: poly.total_points,
            layer: pLayer,
            label: pLabel,
            promo: pPromo,
            debugBox: pDebugBox,
            lines: poly.boundary_white_lines
        };

        polygonState.set(poly.id, pState);

        // Handle completed polygons
        if (pState.current >= pState.total) {
            handleCompletedPolygon(pState, detailsLayer, completedPolygonsLayer, posterRenderer, pLabel, pPromo, gameState);
        } else if (pLabel) {
            // Update label for partial progress
            const pct = Math.floor((pState.current / pState.total) * 100);
            const icon = pLabel.options.icon;
            icon.options.html = icon.options.html.replace(/>\d+%</, `>${pct}%<`);
            pLabel.setIcon(icon);
        }
    });

    // Restore poster masks for completed polygons
    restorePosterMasks(polygonState, posterRenderer);
}

/**
 * Create debug bounding box
 */
function createDebugBox(centerPos, offsetX, offsetY, targetLayer) {
    const smallCenterX = offsetX;
    const smallCenterY = offsetY;

    const maxX = Math.max(30, smallCenterX + 15);
    const minX = Math.min(-30, smallCenterX - 15);
    const maxY = Math.max(30, smallCenterY + 15);
    const minY = Math.min(-30, smallCenterY - 15);

    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;
    const anchorX = -minX;
    const anchorY = -minY;

    return L.marker([centerPos[0], centerPos[1]], {
        icon: L.divIcon({
            className: 'debug-boundary-box',
            html: '',
            iconSize: [boxWidth, boxHeight],
            iconAnchor: [anchorX, anchorY]
        }),
        interactive: false
    }).addTo(targetLayer);
}
