/**
 * RenderDataEnricher.js
 * Handles data enrichment and relationship linking for rendering
 */

/**
 * Count blue circles per polygon
 * @param {Array} polygons 
 * @param {Array} blueCircles 
 */
export function enrichBlueCircleCounts(polygons, blueCircles) {
    if (!polygons || !blueCircles || blueCircles.length === 0) return;

    const blueCircleCoords = new Set(
        blueCircles.map(bc => `${bc.lat.toFixed(7)},${bc.lon.toFixed(7)}`)
    );

    polygons.forEach(poly => {
        let count = 0;
        if (poly.coords) {
            const uniquePolyCoords = new Set(
                poly.coords.map(c => `${c[0].toFixed(7)},${c[1].toFixed(7)}`)
            );
            uniquePolyCoords.forEach(coordKey => {
                if (blueCircleCoords.has(coordKey)) {
                    count++;
                }
            });
        }
        poly.blue_circles_count = count;
    });
}

/**
 * Enrich white lines with endpoint and green circle info
 * @param {Array} whiteLines 
 * @param {Array} blueCircles 
 * @param {Array} greenCircles 
 */
export function enrichWhiteLineRelations(whiteLines, blueCircles, greenCircles) {
    if (!whiteLines || !blueCircles || blueCircles.length === 0 || !greenCircles) return;

    // Build coord -> blue circle UID map
    const blueByCoord = new Map();
    blueCircles.forEach(bc => {
        const key = `${bc.lat.toFixed(7)},${bc.lon.toFixed(7)}`;
        blueByCoord.set(key, bc.uid);
    });

    // Build lineId -> green circles list
    const greenByLine = new Map();
    greenCircles.forEach(gc => {
        if (!greenByLine.has(gc.line_id)) greenByLine.set(gc.line_id, []);
        greenByLine.get(gc.line_id).push(gc.uid);
    });

    whiteLines.forEach(line => {
        const startKey = `${line.start[0].toFixed(7)},${line.start[1].toFixed(7)}`;
        const endKey = `${line.end[0].toFixed(7)},${line.end[1].toFixed(7)}`;

        line.endpoint_blue_circles = [];
        if (blueByCoord.has(startKey)) line.endpoint_blue_circles.push(blueByCoord.get(startKey));
        if (blueByCoord.has(endKey)) line.endpoint_blue_circles.push(blueByCoord.get(endKey));

        line.green_circles_uids = greenByLine.get(line.uid) || [];
        line.green_circles_count = line.green_circles_uids.length;
        line.total_circles = line.endpoint_blue_circles.length + line.green_circles_count;
    });
}

/**
 * Build blue circle data map for neighbor polygon calculations
 * @param {Array} blueCircles 
 * @returns {Map}
 */
export function buildBlueCircleDataMap(blueCircles) {
    const blueCircleDataMap = new Map();
    if (!blueCircles || blueCircles.length === 0) return blueCircleDataMap;

    blueCircles.forEach(bc => {
        const key = `${bc.lat.toFixed(7)},${bc.lon.toFixed(7)}`;
        blueCircleDataMap.set(key, {
            id: bc.id,
            connections: bc.connections || 0,
            connected_polygon_ids: bc.connected_polygon_ids || [],
            connected_polygons_count: bc.connected_polygons_count || 0
        });
    });

    return blueCircleDataMap;
}

/**
 * Ensure neighbor arrays exist on polygons
 * @param {Array} polygons 
 */
export function ensureNeighborArrays(polygons) {
    if (!polygons) return;
    polygons.forEach(poly => {
        if (!poly.neighbor_polygon_ids) poly.neighbor_polygon_ids = [];
    });
}
