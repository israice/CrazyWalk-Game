/**
 * PosterRenderer.js
 * 
 * Manages poster grid rendering, SVG overlays, and reveal masks.
 * Extracted from map-logic.js to improve code organization.
 */

export class PosterRenderer {
    constructor(map, postersLayer, gameState) {
        this.map = map;
        this.postersLayer = postersLayer;
        this.gameState = gameState;

        // Internal state
        this.posters = [];
        this.REVEAL_MASK_SVG_ID = 'poster-reveal-mask';
        this.revealMask = null;
        this.revealMaskPath = null;
        this.posterSvgOverlay = null;
        this.currentPosterGrid = null;

        // These will be set externally when needed
        this._userMarker = null;
        this._circleLayerMap = null;
        this._polygonState = null;
        this._lineLayerMap = null;
    }



    /**
     * Initialize poster grid from server data
     * @param {Object} data - Game data containing polygons
     * @param {string} mode - 'initial' or 'expand'
     */
    initPosterGrid(data, mode = 'initial') {
        const isExpanding = mode === 'expand';
        console.log(`DEBUG: Initializing Poster Grid (mode=${mode}, isExpanding=${isExpanding})...`);

        // During expansion, preserve existing overlay to prevent flicker
        if (!isExpanding) {
            if (this.posterSvgOverlay) {
                console.log("DEBUG: Removing existing poster SVG overlay");
                this.posterSvgOverlay.remove();
                this.posterSvgOverlay = null;
            }
            this.postersLayer.clearLayers();
            this.posters.length = 0;
        } else {
            console.log("DEBUG: Expansion mode - preserving existing poster overlay");
        }

        if (!this.currentPosterGrid || this.currentPosterGrid.length === 0) {
            console.log("DEBUG: No poster_grid from server");
            return;
        }

        console.log(`DEBUG: Using server poster grid with ${this.currentPosterGrid.length} posters`);

        // Find overall bounds for SVG overlay using both posters and polygons
        let minLat = Infinity, maxLat = -Infinity;
        let minLon = Infinity, maxLon = -Infinity;

        this.currentPosterGrid.forEach(poster => {
            minLat = Math.min(minLat, poster.min_lat);
            maxLat = Math.max(maxLat, poster.max_lat);
            minLon = Math.min(minLon, poster.min_lon);
            maxLon = Math.max(maxLon, poster.max_lon);
        });

        // Crucial: Expand bounds to include all polygons to prevent clipping
        if (data && data.polygons) {
            data.polygons.forEach(poly => {
                poly.coords.forEach(coord => {
                    minLat = Math.min(minLat, coord[0]);
                    maxLat = Math.max(maxLat, coord[0]);
                    minLon = Math.min(minLon, coord[1]);
                    maxLon = Math.max(maxLon, coord[1]);
                });
            });
        }

        // Add 5% buffer to prevent edge artifacts
        const latBuffer = (maxLat - minLat) * 0.05;
        const lonBuffer = (maxLon - minLon) * 0.05;
        minLat -= latBuffer; maxLat += latBuffer;
        minLon -= lonBuffer; maxLon += lonBuffer;

        console.log(`DEBUG: SVG Expanded area (with buffer): lat(${minLat.toFixed(5)}, ${maxLat.toFixed(5)}), lon(${minLon.toFixed(5)}, ${maxLon.toFixed(5)})`);

        const svgBounds = L.latLngBounds(
            [minLat, minLon],  // Southwest corner
            [maxLat, maxLon]   // Northeast corner
        );

        // EXPANSION MODE: Update existing overlay bounds instead of recreating
        if (isExpanding && this.posterSvgOverlay) {
            console.log("DEBUG: Expanding existing poster overlay bounds...");

            // Get current bounds
            const currentBounds = this.posterSvgOverlay.getBounds();

            // Extend current bounds to include new bounds
            const extendedBounds = L.latLngBounds(
                [Math.min(currentBounds.getSouth(), minLat), Math.min(currentBounds.getWest(), minLon)],
                [Math.max(currentBounds.getNorth(), maxLat), Math.max(currentBounds.getEast(), maxLon)]
            );

            console.log(`DEBUG: Extended bounds: lat(${extendedBounds.getSouth().toFixed(5)}, ${extendedBounds.getNorth().toFixed(5)}), lon(${extendedBounds.getWest().toFixed(5)}, ${extendedBounds.getEast().toFixed(5)})`);

            // Update overlay bounds (this preserves the mask!)
            this.posterSvgOverlay.setBounds(extendedBounds);

            // Posters array is already populated - just update the SVG
            this.updatePosterSVG();
            return;
        }

        // INITIAL MODE: Create new SVG overlay
        const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        svgElement.style.position = "absolute";
        svgElement.style.top = "0";
        svgElement.style.left = "0";
        svgElement.style.width = "100%";
        svgElement.style.height = "100%";
        svgElement.style.pointerEvents = "none";
        svgElement.setAttribute("viewBox", "0 0 1000 1000");
        svgElement.setAttribute("preserveAspectRatio", "none");
        svgElement.innerHTML = `
                <defs>
                    <mask id="poster-reveal-mask">
                        <rect width="1000" height="1000" fill="black"/>
                        <g id="mask-paths-container" fill="white"></g>
                    </mask>
                </defs>
                <g id="debug-poster-bg" style="display:none; opacity: 0.4; pointer-events: none;"></g>
                <g id="poster-images-container" mask="url(#poster-reveal-mask)"></g>
                <g id="debug-poster-overlay" style="display:none; pointer-events: none;"></g>
            `;

        // Add to map pane with correct bounds
        this.posterSvgOverlay = L.svgOverlay(svgElement, svgBounds, {
            interactive: false,
            pane: 'postersPane'
        }).addTo(this.map);

        this.revealMask = svgElement.querySelector('#mask-paths-container');
        const imagesContainer = svgElement.querySelector('#poster-images-container');

        // Create posters from server data
        this.currentPosterGrid.forEach(poster => {
            const bounds = [
                [poster.min_lat, poster.min_lon],
                [poster.max_lat, poster.max_lon]
            ];

            this.posters.push({
                bounds,
                id: poster.id,
                imageUrl: poster.image_url
            });

            console.log(`DEBUG: Poster ${poster.id}: lat(${poster.min_lat.toFixed(5)}, ${poster.max_lat.toFixed(5)}), lon(${poster.min_lon.toFixed(5)}, ${poster.max_lon.toFixed(5)})`);

            if (poster.position === 5 && this._userMarker) {
                const poster5CenterLat = (poster.min_lat + poster.max_lat) / 2;
                const poster5CenterLon = (poster.min_lon + poster.max_lon) / 2;
                const userPos = this._userMarker.getLatLng();
                console.log(`DEBUG: ========== POSTER #5 CENTER CHECK ==========`);
                console.log(`DEBUG: Poster #5 center: ${poster5CenterLat.toFixed(6)}, ${poster5CenterLon.toFixed(6)}`);
                console.log(`DEBUG: User marker pos:  ${userPos.lat.toFixed(6)}, ${userPos.lng.toFixed(6)}`);
                console.log(`DEBUG: Difference: lat=${Math.abs(poster5CenterLat - userPos.lat).toFixed(6)}, lon=${Math.abs(poster5CenterLon - userPos.lng).toFixed(6)}`);
                console.log(`DEBUG: =============================================`);
            }
        });

        console.log(`DEBUG: Created ${this.posters.length} poster overlays`);
        this.updatePosterSVG();
    }

    /**
     * Update poster SVG elements (DOM reconciliation)
     */
    updatePosterSVG() {
        if (!this.posterSvgOverlay) return;

        const svg = this.posterSvgOverlay.getElement();
        if (!svg) return;

        const imagesContainer = svg.querySelector('#poster-images-container');
        const bgContainer = svg.querySelector('#debug-poster-bg');
        const overlayContainer = svg.querySelector('#debug-poster-overlay');

        if (!imagesContainer || !bgContainer || !overlayContainer) return;

        // --- DOM RECONCILIATION ---
        // Do NOT clear innerHTML. Instead, diff and update.

        // Get SVG bounds (geographic coordinates)
        const svgBounds = this.posterSvgOverlay.getBounds();
        const svgMinLat = svgBounds.getSouth();
        const svgMaxLat = svgBounds.getNorth();
        const svgMinLon = svgBounds.getWest();
        const svgMaxLon = svgBounds.getEast();

        const latRange = svgMaxLat - svgMinLat;
        const lonRange = svgMaxLon - svgMinLon;

        const activePosterIds = new Set();

        this.posters.forEach(p => {
            activePosterIds.add(p.id);

            const posterMinLat = p.bounds[0][0];
            const posterMinLon = p.bounds[0][1];
            const posterMaxLat = p.bounds[1][0];
            const posterMaxLon = p.bounds[1][1];

            const x = ((posterMinLon - svgMinLon) / lonRange) * 1000;
            const y = ((svgMaxLat - posterMaxLat) / latRange) * 1000;
            const width = ((posterMaxLon - posterMinLon) / lonRange) * 1000;
            const height = ((posterMaxLat - posterMinLat) / latRange) * 1000;

            if (width <= 0 || height <= 0) {
                return;
            }

            // 1. Background Image (Ghost)
            const bgId = `poster-bg-${p.id}`;
            let bgImage = bgContainer.querySelector(`#${bgId}`);
            if (!bgImage) {
                bgImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
                bgImage.setAttribute("id", bgId);
                bgImage.setAttribute("preserveAspectRatio", "none");
                bgContainer.appendChild(bgImage);
            }
            // Update attributes (efficiently)
            if (bgImage.getAttributeNS("http://www.w3.org/1999/xlink", "href") !== p.imageUrl) {
                bgImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", p.imageUrl);
            }
            bgImage.setAttribute("x", x);
            bgImage.setAttribute("y", y);
            bgImage.setAttribute("width", width);
            bgImage.setAttribute("height", height);

            // 2. Main Game Image
            const imgId = `poster-img-${p.id}`;
            let mainImage = imagesContainer.querySelector(`#${imgId}`);
            if (!mainImage) {
                mainImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
                mainImage.setAttribute("id", imgId);
                mainImage.setAttribute("opacity", "1.0");
                mainImage.setAttribute("preserveAspectRatio", "none");
                imagesContainer.appendChild(mainImage);
            }
            if (mainImage.getAttributeNS("http://www.w3.org/1999/xlink", "href") !== p.imageUrl) {
                mainImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", p.imageUrl);
            }
            mainImage.setAttribute("x", x);
            mainImage.setAttribute("y", y);
            mainImage.setAttribute("width", width);
            mainImage.setAttribute("height", height);

            // 3. Debug Overlay
            if (this.gameState.isPostersDebugActive) {
                const debugGroupId = `poster-debug-${p.id}`;
                let debugGroup = overlayContainer.querySelector(`#${debugGroupId}`);

                if (!debugGroup) {
                    debugGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
                    debugGroup.setAttribute("id", debugGroupId);
                    overlayContainer.appendChild(debugGroup);

                    // Contents (created once)
                    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    rect.setAttribute("fill", "none");
                    rect.setAttribute("stroke", "red");
                    rect.setAttribute("stroke-width", "3");
                    debugGroup.appendChild(rect);

                    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.setAttribute("fill", "yellow");
                    text.setAttribute("font-size", "13");
                    text.setAttribute("font-weight", "bold");
                    text.setAttribute("text-anchor", "middle");
                    text.setAttribute("dominant-baseline", "middle");
                    text.textContent = `#${p.id}`;
                    debugGroup.appendChild(text);
                }

                // Update Group Contents
                const rect = debugGroup.querySelector('rect');
                const text = debugGroup.querySelector('text');

                rect.setAttribute("x", x);
                rect.setAttribute("y", y);
                rect.setAttribute("width", width);
                rect.setAttribute("height", height);

                text.setAttribute("x", x + width / 2);
                text.setAttribute("y", y + height / 2);
            }
        });

        // Cleanup Stale Nodes
        this.#cleanupContainer(bgContainer, 'poster-bg-', activePosterIds);
        this.#cleanupContainer(imagesContainer, 'poster-img-', activePosterIds);
        this.#cleanupContainer(overlayContainer, 'poster-debug-', activePosterIds);

        console.log(`DEBUG: Updated poster layers (Diff Update)`);
    }

    /**
     * Helper to remove stale children from container
     * @private
     */
    #cleanupContainer(container, prefix, activePosterIds) {
        Array.from(container.children).forEach(child => {
            const id = child.getAttribute("id");
            if (id && id.startsWith(prefix)) {
                const posterId = id.replace(prefix, '');
                if (!activePosterIds.has(posterId)) {
                    child.remove();
                }
            }
        });
    }

    /**
     * Update poster visibility based on debug mode
     */
    updatePostersVisibility() {
        if (this.posterSvgOverlay) {
            const svg = this.posterSvgOverlay.getElement();
            if (svg) {
                const bgContainer = svg.querySelector('#debug-poster-bg');
                const overlayContainer = svg.querySelector('#debug-poster-overlay');
                const imagesContainer = svg.querySelector('#poster-images-container');

                // Main container ALWAYS masked
                if (imagesContainer) {
                    imagesContainer.setAttribute('mask', 'url(#poster-reveal-mask)');
                }

                // Toggle debug layers
                const display = this.gameState.isPostersDebugActive ? 'inline' : 'none';
                if (bgContainer) bgContainer.style.display = display;
                if (overlayContainer) overlayContainer.style.display = display;
            }
        }
        this.updatePosterSVG();
        this.toggleHiddenDebug(this.gameState.isPostersDebugActive);
    }

    /**
     * Toggle visibility of hidden/collected elements in debug mode
     * @param {boolean} show - Whether to show hidden elements
     */
    toggleHiddenDebug(show) {
        if (!this._circleLayerMap || !this._polygonState || !this._lineLayerMap) return;

        console.log(`DEBUG: Toggling hidden elements: ${show ? 'SHOW ALL' : 'RESTORE HIDDEN'}`);

        // 1. Handle Collected Circles
        this.gameState.collectedCircles.forEach(key => {
            const layer = this._circleLayerMap.get(key);
            if (layer) {
                if (show) {
                    // Reveal
                    const isBlue = layer.options.color === 'blue' || (layer.options.fillColor === '#00ccff');
                    layer.setStyle({
                        opacity: 1,
                        fillOpacity: isBlue ? 0.8 : 1
                    });

                    // Restore Blue Circle Tooltip (Number)
                    if (layer.connections !== undefined && !layer.getTooltip()) {
                        layer.bindTooltip(String(layer.connections), {
                            permanent: true,
                            direction: 'center',
                            className: 'circle-label'
                        });
                    }
                } else {
                    // Re-hide
                    layer.setStyle({ opacity: 0, fillOpacity: 0 });

                    // Remove tooltip again if it was restored
                    if (layer.getTooltip()) {
                        layer.unbindTooltip();
                    }
                }
            }
        });

        // 2. Handle Lines from Completed Polygons
        this._polygonState.forEach(state => {
            if (state.current >= state.total && state.lines) {
                state.lines.forEach(lid => {
                    const lineLayer = this._lineLayerMap.get(String(lid));
                    if (lineLayer) {
                        if (show) {
                            lineLayer.setStyle({ opacity: 1, fillOpacity: 1 });
                        } else {
                            lineLayer.setStyle({ opacity: 0, fillOpacity: 0 });
                        }
                    }
                });
            }
        });
    }

    /**
     * Reveal a polygon part by adding it to the SVG mask
     * @param {Array<Array<number>>} coords - Polygon coordinates [[lat, lon], ...]
     */
    revealPolygonPart(coords) {
        console.log("REVEAL: revealPolygonPart called", { coords, revealMask: this.revealMask });
        if (!this.revealMask || !coords || !this.posterSvgOverlay) {
            console.warn("REVEAL: Skipping - no mask, coords or overlay", { revealMask: this.revealMask, coords });
            return;
        }

        try {
            const svgBounds = this.posterSvgOverlay.getBounds();
            const svgMinLat = svgBounds.getSouth();
            const svgMaxLat = svgBounds.getNorth();
            const svgMinLon = svgBounds.getWest();
            const svgMaxLon = svgBounds.getEast();
            const latRange = svgMaxLat - svgMinLat;
            const lonRange = svgMaxLon - svgMinLon;

            const points = coords.map(p => {
                if (!Array.isArray(p) || p.length < 2) return null;
                // Scale coordinates to 0-1000 range relative to SVG bounds
                const x = ((p[1] - svgMinLon) / lonRange) * 1000;
                const y = ((svgMaxLat - p[0]) / latRange) * 1000;
                return `${x.toFixed(2)},${y.toFixed(2)}`;
            }).filter(Boolean).join(' ');

            const pathData = points ? `M ${points} Z` : '';

            if (!pathData) {
                console.warn("REVEAL: No valid pathData generated");
                return;
            }

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", pathData);
            this.revealMask.appendChild(path);
            console.log("REVEAL: Polygon added to mask. Total paths:", this.revealMask.children.length);
        } catch (e) {
            console.error("Failed to reveal polygon part:", e);
        }
    }

    /**
     * Rebuild all paths in the mask (used when restoring state)
     */
    updateMaskPaths() {
        if (!this.revealMask || !this.posterSvgOverlay || !this._polygonState) return;

        const svgBounds = this.posterSvgOverlay.getBounds();
        const svgMinLat = svgBounds.getSouth();
        const svgMaxLat = svgBounds.getNorth();
        const svgMinLon = svgBounds.getWest();
        const svgMaxLon = svgBounds.getEast();
        const latRange = svgMaxLat - svgMinLat;
        const lonRange = svgMaxLon - svgMinLon;

        // Rebuild all paths in the mask
        this.revealMask.innerHTML = '';
        this._polygonState.forEach(state => {
            if (state.current >= state.total && state.coords) {
                try {
                    const points = state.coords.map(p => {
                        if (!Array.isArray(p) || p.length < 2) return null;
                        // Scale coordinates to 0-1000 range relative to SVG bounds
                        const x = ((p[1] - svgMinLon) / lonRange) * 1000;
                        const y = ((svgMaxLat - p[0]) / latRange) * 1000;
                        return `${x.toFixed(2)},${y.toFixed(2)}`;
                    }).filter(Boolean).join(' ');

                    const pathData = points ? `M ${points} Z` : '';
                    if (pathData) {
                        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                        path.setAttribute("d", pathData);
                        this.revealMask.appendChild(path);
                    }
                } catch (e) {
                    console.warn(`Failed to update mask for polygon ${state.id}:`, e);
                }
            }
        });
    }

    /**
     * Set current poster grid data from server
     * @param {Array} posterGrid - Poster grid data from server
     */
    setPosterGrid(posterGrid) {
        this.currentPosterGrid = posterGrid;
    }

    /**
     * Get current poster grid
     * @returns {Array} Current poster grid
     */
    getPosterGrid() {
        return this.currentPosterGrid;
    }


}
