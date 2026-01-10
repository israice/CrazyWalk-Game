/**
 * PosterMaskController.js
 * 
 * Manages the SVG mask used to reveal posters as polygons are completed.
 * Separated from PosterRenderer to strictly handle mask DOM manipulation and path generation.
 */

export class PosterMaskController {
    /**
     * @param {SVGElement} maskElement - The <g id="mask-paths-container"> element
     */
    constructor(maskElement) {
        this.maskElement = maskElement;
    }

    /**
     * Reveal a polygon part by adding it to the SVG mask
     * @param {Array<Array<number>>} coords - Polygon coordinates [[lat, lon], ...]
     * @param {L.LatLngBounds} svgBounds - The bounds of the SVG overlay
     */
    revealPolygonPart(coords, svgBounds) {
        console.log("REVEAL: revealPolygonPart called", { coords, maskElement: this.maskElement });

        if (!this.maskElement || !coords || !svgBounds) {
            console.warn("REVEAL: Skipping - no mask, coords or bounds", {
                hasMask: !!this.maskElement,
                hasCoords: !!coords,
                hasBounds: !!svgBounds
            });
            return;
        }

        try {
            const pathData = this._generatePathData(coords, svgBounds);

            if (!pathData) {
                console.warn("REVEAL: No valid pathData generated");
                return;
            }

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", pathData);
            this.maskElement.appendChild(path);
            console.log("REVEAL: Polygon added to mask. Total paths:", this.maskElement.children.length);
        } catch (e) {
            console.error("Failed to reveal polygon part:", e);
        }
    }

    /**
     * Rebuild all paths in the mask (used when restoring state or resizing)
     * @param {Array} polygonState - Array of polygon state objects
     * @param {L.LatLngBounds} svgBounds - The bounds of the SVG overlay
     */
    updateMaskPaths(polygonState, svgBounds) {
        if (!this.maskElement || !svgBounds || !polygonState) return;

        // Clear existing paths
        this.maskElement.innerHTML = '';

        polygonState.forEach(state => {
            if (state.current >= state.total && state.coords) {
                try {
                    const pathData = this._generatePathData(state.coords, svgBounds);
                    if (pathData) {
                        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                        path.setAttribute("d", pathData);
                        this.maskElement.appendChild(path);
                    }
                } catch (e) {
                    console.warn(`Failed to update mask for polygon ${state.id}:`, e);
                }
            }
        });
    }

    /**
     * Generate SVG path data from geographic coordinates
     * @private
     * @param {Array<Array<number>>} coords - Polygon coordinates
     * @param {L.LatLngBounds} svgBounds - SVG bounds
     * @returns {string|null} - SVG path data "M x,y ... Z" or null
     */
    _generatePathData(coords, svgBounds) {
        if (!svgBounds) return null;

        const svgMinLat = svgBounds.getSouth();
        const svgMaxLat = svgBounds.getNorth();
        const svgMinLon = svgBounds.getWest();
        const svgMaxLon = svgBounds.getEast();

        const latRange = svgMaxLat - svgMinLat;
        const lonRange = svgMaxLon - svgMinLon;

        // Avoid division by zero
        if (latRange === 0 || lonRange === 0) return null;

        const points = coords.map(p => {
            if (!Array.isArray(p) || p.length < 2) return null;
            // Scale coordinates to 0-1000 range relative to SVG bounds
            // X matches Longitude, Y matches Latitude (inverted because SVG Y moves down)
            const x = ((p[1] - svgMinLon) / lonRange) * 1000;
            const y = ((svgMaxLat - p[0]) / latRange) * 1000;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        }).filter(Boolean).join(' ');

        return points ? `M ${points} Z` : null;
    }
}
