/**
 * PolygonRenderer.js
 * Handles rendering of polygons, promo circles, and percentage labels
 */

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
 * Create promo circle with GIF
 */
function createPromoCircle(poly, centerPos, isCompleted, targetLayer, lineLayerMap, map, gameState, debugHandler) {
    const gifFile = poly.promo_gif;
    if (!gifFile || (isCompleted && !gameState.isPostersDebugActive)) {
        return null;
    }

    const pPromo = L.marker([centerPos[0], centerPos[1]], {
        icon: L.divIcon({
            className: 'poly-promo',
            html: `<div style="background:white; border-radius:50%; width:60px; height:60px; overflow:hidden; border:2px solid white; box-shadow:0 0 5px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center;">
                <img src="/GAME_PROMOS/${gifFile}" style="width:100%; height:100%; object-fit:cover;">
            </div>`,
            iconSize: [60, 60],
            iconAnchor: [30, 30]
        }),
        interactive: true
    }).addTo(targetLayer);

    // Create popup content
    const popupContent = createPromoPopupContent(poly);
    pPromo.bindPopup(popupContent, { minWidth: 300, maxWidth: 350 });

    // Line highlighting on popup
    setupPopupLineHighlighting(pPromo, poly, lineLayerMap, map);

    // Setup debug data
    const largeWhiteCircleUid = `LARGE_WHITE_CIRCLE_${poly.uid.replace('POLYGON_', '')}`;
    const promoDebugData = {
        uid: largeWhiteCircleUid,
        parent_polygon_uid: poly.uid,
        gif: gifFile,
        neighbor_polygons_count: poly.neighbor_polygons_count
    };
    window.allItems.set(promoDebugData.uid, promoDebugData);
    debugHandler.attachDebugClick(pPromo, promoDebugData, 'Promo Circle');

    return pPromo;
}

/**
 * Create popup content for promo circle
 */
function createPromoPopupContent(poly) {
    const popupContent = document.createElement('div');
    popupContent.innerHTML = `
        <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; font-size: 13px; padding: 5px;">
            <div style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                <b>Polygon ID:</b> ${poly.uid || poly.id}
            </div>
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
    return popupContent;
}

/**
 * Setup line highlighting on popup open/close
 */
function setupPopupLineHighlighting(pPromo, poly, lineLayerMap, map) {
    pPromo.on('popupopen', () => {
        if (poly.boundary_white_lines && lineLayerMap) {
            if (!pPromo._tempHighlightLines) pPromo._tempHighlightLines = [];

            poly.boundary_white_lines.forEach(lineId => {
                const composite = lineLayerMap.get(String(lineId));
                if (composite && composite.visual) {
                    const tempLine = L.polyline(composite.visual.getLatLngs(), {
                        color: '#ff0000',
                        weight: 4,
                        opacity: 1,
                        interactive: false,
                        pane: 'blueCirclesPane'
                    }).addTo(map);

                    const path = tempLine.getElement();
                    if (path) {
                        path.style.transition = "transform 0.15s ease-out";
                        requestAnimationFrame(() => {
                            path.style.transform = "translate(5px, -5px)";
                        });
                    }

                    pPromo._tempHighlightLines.push(tempLine);
                }
            });
        }
    });

    pPromo.on('popupclose', () => {
        if (pPromo._tempHighlightLines) {
            pPromo._tempHighlightLines.forEach(l => l.remove());
            pPromo._tempHighlightLines = [];
        }
    });
}

/**
 * Create percentage label circle
 */
function createPercentageLabel(poly, centerPos, offsetX, offsetY, savedCount, isCompleted, targetLayer, gameState, debugHandler, pLayer, direction) {
    if (isCompleted && !gameState.isPostersDebugActive) {
        return null;
    }

    const initialPercent = poly.total_points > 0 ? Math.floor((savedCount / poly.total_points) * 100) : 0;

    const pLabel = L.marker([centerPos[0], centerPos[1]], {
        icon: L.divIcon({
            className: 'poly-label',
            html: `<div style="background:white; border-radius:50%; width:30px; height:30px; text-align:center; line-height:30px; color:black; font-size:10px; opacity: 0.8; font-weight:bold; pointer-events: auto;">${initialPercent}%</div>`,
            iconSize: [30, 30],
            iconAnchor: [15 - offsetX, 15 - offsetY]
        }),
        interactive: true
    }).addTo(targetLayer);

    // Setup UID and debug data
    const whiteCircleUid = `WHITE_CIRCLE_${poly.uid.replace('POLYGON_', '')}`;
    pLabel.uid = whiteCircleUid;

    const labelDebugData = {
        uid: whiteCircleUid,
        parent_polygon_uid: poly.uid,
        boundary_white_lines: poly.boundary_white_lines,
        center: poly.center,
        label_direction: direction,
        label_angle_degrees: direction.angle ? (direction.angle * 180 / Math.PI) : 0,
        coords: poly.coords,
        total_points: poly.total_points,
        blue_circles_count: poly.blue_circles_count || 0,
        merge_count: poly.merge_count || 1,
        poster_ids: poly.poster_ids || [],
        neighbor_polygon_ids: poly.neighbor_polygon_ids || [],
        neighbor_polygons_count: poly.neighbor_polygons_count || 0,
        missing_polygons: poly.missing_polygons || 0
    };
    window.allItems.set(labelDebugData.uid, labelDebugData);

    pLabel.visualSibling = pLayer;

    // Add setStyle polyfill for debug highlighting
    pLabel.setStyle = function(style) {
        const icon = this.options.icon;
        let html = icon.options.html;

        if (style.color === 'red') {
            if (!html.includes('border: 3px solid red')) {
                html = html.replace('background:white;', 'background:white; border: 3px solid red;');
            }
        } else {
            html = html.replace('border: 3px solid red;', '');
        }

        if (html !== icon.options.html) {
            icon.options.html = html;
            this.setIcon(icon);
        }
    };

    debugHandler.attachDebugClick(pLabel, labelDebugData, 'Polygon Label');

    return pLabel;
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

/**
 * Handle completed polygon - move to persistent layer
 */
function handleCompletedPolygon(pState, detailsLayer, completedPolygonsLayer, posterRenderer, pLabel, pPromo, gameState) {
    console.log(`DEBUG: Restoring Completed Polygon ${pState.id} to Persistent Layer`);

    if (detailsLayer.hasLayer(pState.layer)) {
        detailsLayer.removeLayer(pState.layer);
    }
    completedPolygonsLayer.addLayer(pState.layer);

    pState.layer.setStyle({
        color: 'transparent',
        fillColor: 'transparent',
        fillOpacity: 0,
        stroke: false
    });

    if (pLabel && detailsLayer.hasLayer(pLabel)) {
        detailsLayer.removeLayer(pLabel);
    }
    if (pPromo && detailsLayer.hasLayer(pPromo)) {
        detailsLayer.removeLayer(pPromo);
    }
    pState.label = null;
    pState.promo = null;

    posterRenderer.revealPolygonPart(pState.coords);
}

/**
 * Restore poster masks for completed polygons
 */
function restorePosterMasks(polygonState, posterRenderer) {
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
}
