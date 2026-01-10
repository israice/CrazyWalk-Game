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
    const maps = {
        lineIdMap: new Map(), // Old ID (number) -> New UID (string)
        polyIdMap: new Map()  // Old ID (poly_X) -> New UID (POLYGON_xxx)
    };

    if (data.white_lines) {
        processWhiteLines(data.white_lines, existingItems, maps.lineIdMap);
    }

    if (data.green_circles) {
        processGreenCircles(data.green_circles, existingItems, maps.lineIdMap);
    }

    if (data.polygons) {
        processPolygons(data.polygons, existingItems, maps.lineIdMap, maps.polyIdMap);
    }

    if (data.blue_circles) {
        processBlueCircles(data.blue_circles, existingItems, maps.polyIdMap);
    }

    if (data.white_lines) {
        updateLinePolygonReferences(data.white_lines, maps.polyIdMap);
    }

    return maps;
}

/**
 * Process white lines: generate UIDs and populate lineIdMap
 */
function processWhiteLines(lines, existingItems, lineIdMap) {
    lines.forEach(line => {
        const originalId = line.id;
        const lineKey = getLineKey(line);
        let existingLine = findExistingItem(existingItems, 'WHITE_LINE_', item => getLineKey(item) === lineKey);

        if (existingLine) {
            line.uid = existingLine.uid;
            line.id = existingLine.uid;
        } else {
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

/**
 * Process green circles: generate UIDs and update line references
 */
function processGreenCircles(circles, existingItems, lineIdMap) {
    circles.forEach(circle => {
        const coordKey = getCoordKey(circle);
        let existingCircle = findExistingItem(existingItems, 'GREEN_CIRCLE_', item => getCoordKey(item) === coordKey);

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

/**
 * Process polygons: generate UIDs, populate polyIdMap, update boundary lines
 */
function processPolygons(polygons, existingItems, lineIdMap, polyIdMap) {
    polygons.forEach(poly => {
        const originalId = poly.id;
        const centerKey = getCenterKey(poly);
        let existingPoly = findExistingItem(existingItems, 'POLYGON_', item => getCenterKey(item) === centerKey);

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

/**
 * Process blue circles: generate UIDs and update connected polygon IDs
 */
function processBlueCircles(circles, existingItems, polyIdMap) {
    circles.forEach(circle => {
        const coordKey = getCoordKey(circle);
        let existingCircle = findExistingItem(existingItems, 'BLUE_CIRCLE_', item => getCoordKey(item) === coordKey);

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

/**
 * Update white lines connected polygon IDs
 */
function updateLinePolygonReferences(lines, polyIdMap) {
    lines.forEach(line => {
        if (line.connected_polygon_ids) {
            line.connected_polygon_ids = line.connected_polygon_ids.map(oldId => {
                const newId = polyIdMap.get(String(oldId));
                return newId || oldId;
            });
        }
    });
}

// --- Helpers ---

function findExistingItem(existingItems, prefix, predicate) {
    for (const [uid, item] of existingItems.entries()) {
        if (uid.startsWith(prefix) && predicate(item)) {
            return { uid, item };
        }
    }
    return null;
}

function getLineKey(item) {
    if (item.start && item.end && item.start.length === 2 && item.end.length === 2) {
        return `${item.start[0].toFixed(7)},${item.start[1].toFixed(7)}_${item.end[0].toFixed(7)},${item.end[1].toFixed(7)}`;
    }
    return null;
}

function getCoordKey(item) {
    if (item.lat !== undefined && item.lon !== undefined) {
        return `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
    }
    return null;
}

function getCenterKey(item) {
    if (item.center && item.center.length === 2) {
        return `${item.center[0].toFixed(7)},${item.center[1].toFixed(7)}`;
    }
    return null;
}
