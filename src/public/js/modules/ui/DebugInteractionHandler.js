import { resetSelection, addToSelection, getSelectedLayers } from './DebugMode.js';

/**
 * Handles debug interactions: selecting elements, highlighting connections,
 * and generating detailed HTML popups with statistics.
 */
export class DebugInteractionHandler {
    constructor(map, gameState, posterRenderer) {
        this.map = map;
        this.gameState = gameState;
        this.posterRenderer = posterRenderer;

        // Lazy references to layer maps (set via setLayerMaps)
        this.lineLayerMap = null;
        this.circleLayerMap = null;
        this.blueCircleLayerMap = null;
        this.greenCirclesByLine = null;
        this.polygonState = null;

        // Persistent tracking for highlighting styles inside this handler logic
        // (Delegates actual storage to DebugMode.js)
    }

    /**
     * Updates references to the vital data maps used for lookups
     */
    setLayerMaps({ lineMap, circleMap, blueMap, greenByLine, polyState }) {
        this.lineLayerMap = lineMap;
        this.circleLayerMap = circleMap;
        this.blueCircleLayerMap = blueMap;
        this.greenCirclesByLine = greenByLine;
        this.polygonState = polyState;
    }

    /**
     * Attaches click handler to a layer for Debug Mode
     * @param {Object} layer - Leaflet layer
     * @param {Object} data - Data object associated with the layer
     * @param {String} type - Human readable type (e.g. "Polygon", "Blue Circle")
     */
    attachDebugClick(layer, data, type) {
        layer.on('click', (e) => {
            if (!this.gameState.isDebugActive) return;
            L.DomEvent.stopPropagation(e);

            // Highlight Logic (Safely)
            resetSelection();
            const selectedLayers = getSelectedLayers(); // Reference to check inclusion

            // Redirect to visual proxy if available (for Hit Layers)
            const targetLayer = layer.visualSibling || layer;

            // POLYGON LABEL SPECIAL HANDLING
            if (type === 'Polygon Label' && data.boundary_white_lines) {
                // 1. Highlight Polygon Perimeter (border only, no fill change)
                if (typeof targetLayer.setStyle === 'function') {
                    addToSelection(targetLayer, {
                        color: targetLayer.options.color,
                        weight: targetLayer.options.weight
                    });
                    targetLayer.setStyle({ color: 'red', weight: 3 });
                }

                // 2. Highlight White Lines
                if (this.lineLayerMap) {
                    data.boundary_white_lines.forEach(lineId => {
                        // lines keys are strings
                        const lineLayers = this.lineLayerMap.get(String(lineId));
                        if (lineLayers && lineLayers.visual) {
                            addToSelection(lineLayers.visual, {
                                color: lineLayers.visual.options.color,
                                weight: lineLayers.visual.options.weight,
                                dashArray: lineLayers.visual.options.dashArray,
                                opacity: lineLayers.visual.options.opacity
                            });
                            lineLayers.visual.setStyle({ color: 'red', weight: 3, dashArray: null, opacity: 1 });
                        }
                    });
                }

                // 3. Highlight Green Circles on these lines
                if (this.greenCirclesByLine) {
                    data.boundary_white_lines.forEach(lineId => {
                        const circles = this.greenCirclesByLine.get(String(lineId));
                        if (circles) {
                            circles.forEach(circleLayer => {
                                if (typeof circleLayer.setStyle === 'function') {
                                    addToSelection(circleLayer, {
                                        color: circleLayer.options.color,
                                        weight: circleLayer.options.weight || 1,
                                        fillColor: circleLayer.options.fillColor,
                                        fillOpacity: circleLayer.options.fillOpacity
                                    });
                                    circleLayer.setStyle({ color: 'red', weight: 3 });
                                }
                            });
                        }
                    });
                }

                // 4. Highlight Blue Circles (vertices) on polygon coords
                // Use fuzzy matching since coords may differ in precision
                if (this.blueCircleLayerMap && data.coords) {
                    data.coords.forEach(coord => {
                        const targetLat = coord[0];
                        const targetLon = coord[1];

                        // Fuzzy search: find blue circle within ~5m
                        for (const [key, blueCircle] of this.blueCircleLayerMap) {
                            const [lat, lon] = key.split(',').map(Number);
                            const distance = Math.sqrt(
                                Math.pow(lat - targetLat, 2) + Math.pow(lon - targetLon, 2)
                            );
                            // ~0.00005 degrees ≈ 5 meters
                            // check if already selected to identify duplicates
                            // (getSelectedLayers returns array of layers references)
                            if (distance < 0.00005 && !selectedLayers.includes(blueCircle)) {
                                if (typeof blueCircle.setStyle === 'function') {
                                    addToSelection(blueCircle, {
                                        color: blueCircle.options.color,
                                        weight: blueCircle.options.weight,
                                        fillColor: blueCircle.options.fillColor,
                                        fillOpacity: blueCircle.options.fillOpacity
                                    });
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
                    addToSelection(layer, { color: 'original' }); // Mock style for restore
                    layer.setStyle({ color: 'red', weight: 3 });
                }
            }
            // WHITE LINE SPECIAL HANDLING
            else if (type === 'White Line' && data.uid) {
                // 1. Highlight the Line itself
                if (this.lineLayerMap) {
                    const lineComposite = this.lineLayerMap.get(String(data.uid));
                    if (lineComposite && lineComposite.visual) {
                        addToSelection(lineComposite.visual, {
                            color: lineComposite.visual.options.color,
                            weight: lineComposite.visual.options.weight,
                            dashArray: lineComposite.visual.options.dashArray,
                            opacity: lineComposite.visual.options.opacity
                        });
                        lineComposite.visual.setStyle({ color: 'red', weight: 4, dashArray: null, opacity: 1 });
                    }
                }

                // 2. Highlight Blue Circles at endpoints
                if (this.blueCircleLayerMap && data.start && data.end) {
                    const startKey = `${data.start[0].toFixed(6)},${data.start[1].toFixed(6)}`;
                    const endKey = `${data.end[0].toFixed(6)},${data.end[1].toFixed(6)}`;

                    [startKey, endKey].forEach(key => {
                        const blueCircle = this.blueCircleLayerMap.get(key);
                        if (blueCircle && typeof blueCircle.setStyle === 'function') {
                            if (!selectedLayers.includes(blueCircle)) {
                                addToSelection(blueCircle, {
                                    color: blueCircle.options.color,
                                    weight: blueCircle.options.weight,
                                    fillColor: blueCircle.options.fillColor,
                                    fillOpacity: blueCircle.options.fillOpacity
                                });
                                blueCircle.setStyle({ color: 'red', weight: 4 });
                            }
                        }
                    });
                }

                // 3. Highlight Green Circles on this line
                if (this.greenCirclesByLine) {
                    const greenCircles = this.greenCirclesByLine.get(String(data.uid));
                    if (greenCircles) {
                        greenCircles.forEach(circleLayer => {
                            if (typeof circleLayer.setStyle === 'function' && !selectedLayers.includes(circleLayer)) {
                                addToSelection(circleLayer, {
                                    color: circleLayer.options.color,
                                    weight: circleLayer.options.weight || 1,
                                    fillColor: circleLayer.options.fillColor,
                                    fillOpacity: circleLayer.options.fillOpacity
                                });
                                circleLayer.setStyle({ color: 'red', weight: 3 });
                            }
                        });
                    }
                }
            }
            // STANDARD HANDLING for other types
            else if (typeof targetLayer.setStyle === 'function') {
                if (type.includes('Circle')) {
                    addToSelection(targetLayer, {
                        color: targetLayer.options.color,
                        weight: targetLayer.options.weight,
                        fillColor: targetLayer.options.fillColor,
                        fillOpacity: targetLayer.options.fillOpacity
                    });
                    targetLayer.setStyle({ color: 'red', weight: 4, opacity: 1 });
                } else if (type.includes('Line')) {
                    addToSelection(targetLayer, {
                        color: targetLayer.options.color,
                        dashArray: targetLayer.options.dashArray,
                        weight: targetLayer.options.weight,
                        opacity: targetLayer.options.opacity
                    });
                    targetLayer.setStyle({ color: 'red', dashArray: null, weight: 4, opacity: 1 });
                } else if (type.includes('Polygon')) {
                    addToSelection(targetLayer, {
                        color: targetLayer.options.color,
                        weight: targetLayer.options.weight,
                        fillOpacity: targetLayer.options.fillOpacity
                    });
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
            let status = 'Visible';

            if (type.includes('Green Circle') || type.includes('Blue Circle')) {
                // Check if this circle's coordinates are in gameState.collectedCircles
                const lat = data.lat || (data.center && data.center[0]);
                const lon = data.lon || (data.center && data.center[1]);
                if (lat !== undefined && lon !== undefined) {
                    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
                    if (this.gameState.collectedCircles && this.gameState.collectedCircles.has(key)) {
                        status = 'Collected';
                    }
                }
            } else if (type === 'Polygon Label' || type === 'Polygon') {
                // Check if polygon is completed
                const polyId = data.parent_polygon_uid || data.uid || data.id;
                const pState = this.polygonState ? this.polygonState.get(polyId) : null;
                if (pState && pState.current >= pState.total) {
                    status = 'Completed';
                }
            } else if (type === 'White Line') {
                // White lines are hidden when ALL connected polygons are completed
                const connectedPolys = data.connected_polygon_ids || [];
                let allCompleted = connectedPolys.length > 0;
                if (this.polygonState) {
                    for (const polyId of connectedPolys) {
                        const pState = this.polygonState.get(polyId);
                        if (!pState || pState.current < pState.total) {
                            allCompleted = false;
                            break;
                        }
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
                const grid = this.posterRenderer.getPosterGrid();
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
                const connectedLines = data.stats_connected_lines || 0;
                const missingLines = data.stats_missing_lines || 0;

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
                .openOn(this.map);
        });
    }
}
