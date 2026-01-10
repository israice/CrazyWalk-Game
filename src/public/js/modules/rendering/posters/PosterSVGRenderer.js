/**
 * PosterSVGRenderer.js
 * 
 * Handles the direct DOM manipulation for rendering posters and debug overlays onto the Leaflet SVG layer.
 */

export class PosterSVGRenderer {
    constructor() {
        // Stateless, or could hold cache if needed later
    }

    /**
     * Update poster SVG elements (DOM reconciliation)
     * @param {L.SVGOverlay} svgOverlay - The Leaflet SVG overlay instance
     * @param {Array} posters - Array of poster objects {id, bounds, imageUrl}
     * @param {boolean} isDebugActive - global debug state
     */
    updatePosterSVG(svgOverlay, posters, isDebugActive) {
        if (!svgOverlay) return;

        const svg = svgOverlay.getElement();
        if (!svg) return;

        const imagesContainer = svg.querySelector('#poster-images-container');
        const bgContainer = svg.querySelector('#debug-poster-bg');
        const overlayContainer = svg.querySelector('#debug-poster-overlay');

        if (!imagesContainer || !bgContainer || !overlayContainer) return;

        // --- DOM RECONCILIATION ---

        // Get SVG bounds (geographic coordinates)
        const svgBounds = svgOverlay.getBounds();
        const svgMinLat = svgBounds.getSouth();
        const svgMaxLat = svgBounds.getNorth();
        const svgMinLon = svgBounds.getWest();
        const svgMaxLon = svgBounds.getEast();

        const latRange = svgMaxLat - svgMinLat;
        const lonRange = svgMaxLon - svgMinLon;

        // Avoid division by zero
        if (latRange === 0 || lonRange === 0) return;

        const activePosterIds = new Set();

        posters.forEach(p => {
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
            if (isDebugActive) {
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
     * Update visibility of debug layers
     */
    updateVisibility(svgOverlay, isDebugActive) {
        if (!svgOverlay) return;
        const svg = svgOverlay.getElement();
        if (!svg) return;

        const bgContainer = svg.querySelector('#debug-poster-bg');
        const overlayContainer = svg.querySelector('#debug-poster-overlay');
        const imagesContainer = svg.querySelector('#poster-images-container');

        // Main container ALWAYS masked
        if (imagesContainer) {
            imagesContainer.setAttribute('mask', 'url(#poster-reveal-mask)');
        }

        // Toggle debug layers
        const display = isDebugActive ? 'inline' : 'none';
        if (bgContainer) bgContainer.style.display = display;
        if (overlayContainer) overlayContainer.style.display = display;
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
}
