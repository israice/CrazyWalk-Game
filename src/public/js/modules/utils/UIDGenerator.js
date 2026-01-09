/**
 * UIDGenerator.js
 * 
 * UID generation and mapping utilities for game elements.
 * Extracted from map-logic.js (lines 1098-1306)
 */

/**
 * Generate a unique identifier with a given prefix
 * @param {string} prefix - Prefix for the UID (e.g., 'POLYGON', 'BLUE_CIRCLE')
 * @returns {string} Unique identifier
 */
export function generateUID(prefix) {
    return `${prefix}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create UID maps for all game elements (lines, circles, polygons)
 * This function handles UID generation and reuse for expansion mode
 * 
 * @param {Object} data - Game data from server
 * @param {Object} existingItems - window.allItems map (for UID reuse in expand mode)
 * @param {string} mode - 'initial' or 'expand'
 * @returns {Object} Object containing all UID maps
 */
export function createUIDMaps(data, existingItems = new Map(), mode = 'initial') {
    const lineIdMap = new Map(); // Old ID (number) -> New UID (string)
    const polyIdMap = new Map(); // Old ID (poly_X) -> New UID (POLYGON_xxx)

    // A. Process White Lines (Dependencies for Polygons/Circles)
    if (data.white_lines) {
        data.white_lines.forEach(line => {
            const originalId = line.id;

            // Check if line already exists by start/end coordinates (reuse UID in expand mode)
            let existingLine = null;
            if (line.start && line.end && line.start.length === 2 && line.end.length === 2) {
                const lineKey = `${line.start[0].toFixed(7)},${line.start[1].toFixed(7)}_${line.end[0].toFixed(7)},${line.end[1].toFixed(7)}`;

                // Search for existing line with same coordinates
                for (const [uid, item] of existingItems.entries()) {
                    if (item.start && item.end && item.start.length === 2 && item.end.length === 2) {
                        const itemLineKey = `${item.start[0].toFixed(7)},${item.start[1].toFixed(7)}_${item.end[0].toFixed(7)},${item.end[1].toFixed(7)}`;
                        if (itemLineKey === lineKey && uid.startsWith('WHITE_LINE_')) {
                            existingLine = { uid, item };
                            break;
                        }
                    }
                }
            }

            if (existingLine) {
                // Reuse existing UID
                line.uid = existingLine.uid;
                line.id = existingLine.uid;
            } else {
                // Generate new UID
                line.uid = generateUID('WHITE_LINE');
                line.id = line.uid;
            }

            line.original_id = originalId;

            if (originalId !== undefined) {
                lineIdMap.set(Number(originalId), line.uid);
                lineIdMap.set(String(originalId), line.uid);
            }
        });
    }

    // B. Process Green Circles (Depend on Lines)
    if (data.green_circles) {
        data.green_circles.forEach(circle => {
            const coordKey = `${circle.lat.toFixed(6)},${circle.lon.toFixed(6)}`;
            let existingCircle = null;

            // Search for existing circle
            for (const [uid, item] of existingItems.entries()) {
                if (item.lat !== undefined && item.lon !== undefined) {
                    const itemKey = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
                    if (itemKey === coordKey && uid.startsWith('GREEN_CIRCLE_')) {
                        existingCircle = { uid, item };
                        break;
                    }
                }
            }

            if (existingCircle) {
                circle.uid = existingCircle.uid;
                circle.id = existingCircle.uid;
            } else {
                circle.uid = generateUID('GREEN_CIRCLE');
                circle.id = circle.uid;
            }

            // Update Reference (Foreign Key)
            if (circle.line_id !== undefined) {
                const newRef = lineIdMap.get(circle.line_id);
                if (newRef) {
                    circle.line_id = newRef;
                }
            }
        });
    }

    // C. Process Polygons (Depend on Lines)
    if (data.polygons) {
        data.polygons.forEach(poly => {
            const originalId = poly.id;
            let existingPoly = null;

            if (poly.center && poly.center.length === 2) {
                const centerKey = `${poly.center[0].toFixed(7)},${poly.center[1].toFixed(7)}`;

                for (const [uid, item] of existingItems.entries()) {
                    if (item.center && item.center.length === 2) {
                        const itemCenterKey = `${item.center[0].toFixed(7)},${item.center[1].toFixed(7)}`;
                        if (itemCenterKey === centerKey && uid.startsWith('POLYGON_')) {
                            existingPoly = { uid, item };
                            break;
                        }
                    }
                }
            }

            if (existingPoly) {
                poly.uid = existingPoly.uid;
                poly.id = existingPoly.uid;
                poly.backendId = existingPoly.item.backendId || originalId;
            } else {
                poly.uid = generateUID('POLYGON');
                poly.id = poly.uid;
                poly.backendId = originalId;
            }

            if (originalId !== undefined) {
                polyIdMap.set(String(originalId), poly.uid);
            }

            // Update boundary references
            if (poly.boundary_white_lines) {
                poly.boundary_white_lines = poly.boundary_white_lines.map(oldId => {
                    const newId = lineIdMap.get(oldId);
                    return newId || oldId;
                });
            }
        });
    }

    // D. Process Blue Circles
    if (data.blue_circles) {
        data.blue_circles.forEach(circle => {
            const coordKey = `${circle.lat.toFixed(6)},${circle.lon.toFixed(6)}`;
            let existingCircle = null;

            for (const [uid, item] of existingItems.entries()) {
                if (item.lat !== undefined && item.lon !== undefined) {
                    const itemKey = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
                    if (itemKey === coordKey && uid.startsWith('BLUE_CIRCLE_')) {
                        existingCircle = { uid, item };
                        break;
                    }
                }
            }

            if (existingCircle) {
                circle.uid = existingCircle.uid;
                circle.id = existingCircle.uid;
            } else {
                circle.uid = generateUID('BLUE_CIRCLE');
                circle.id = circle.uid;
            }

            // Update connected_polygon_ids
            if (circle.connected_polygon_ids) {
                circle.connected_polygon_ids = circle.connected_polygon_ids.map(oldId => {
                    const newId = polyIdMap.get(String(oldId));
                    return newId || oldId;
                });
            }
        });
    }

    // D2. Update White Lines connected_polygon_ids
    if (data.white_lines) {
        data.white_lines.forEach(line => {
            if (line.connected_polygon_ids) {
                line.connected_polygon_ids = line.connected_polygon_ids.map(oldId => {
                    const newId = polyIdMap.get(String(oldId));
                    return newId || oldId;
                });
            }
        });
    }

    return {
        lineIdMap,
        polyIdMap
    };
}
