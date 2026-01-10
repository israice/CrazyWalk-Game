/**
 * Home Page Logic
 * Handles IP-based location, GPS permission request, and UI interactions
 */
document.addEventListener('DOMContentLoaded', () => {
    const cityLabel = document.getElementById('city-label');
    const mapElement = document.getElementById('map');
    const loadingGif = document.getElementById('loading-gif');
    const uiOverlay = document.getElementById('ui-overlay');
    const errorScreen = document.getElementById('error-screen');
    const errorMessage = document.getElementById('error-message');

    // Initial state: GIF visible, UI hidden
    loadingGif.style.display = 'block';
    loadingGif.style.opacity = '1';
    mapElement.style.opacity = '0';
    cityLabel.style.opacity = '0';
    uiOverlay.style.opacity = '0';

    const revealContent = () => {
        loadingGif.style.opacity = '0';
        mapElement.style.opacity = '1';
        cityLabel.style.opacity = '1';
        uiOverlay.style.opacity = '1';
        setTimeout(() => { loadingGif.style.display = 'none'; }, 600);
    };

    const showError = (msg) => {
        // On mobile, avoid the "Red Screen" overlay issues
        if (window.innerWidth <= 1024) {
            const plainMsg = msg.replace(/<br>/g, '\n').replace(/<[^>]*>/g, '');
            setTimeout(() => {
                alert(plainMsg);
            }, 100);
            revealContent();
            return;
        }

        loadingGif.style.display = 'none';
        uiOverlay.style.display = 'none';
        mapElement.style.display = 'none';
        errorScreen.style.display = 'flex';
        errorMessage.innerHTML = msg;
    };

    const map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        touchZoom: false,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        subdomains: 'abcd'
    }).addTo(map);

    // IP-based location detection (no permission needed)
    const loadIPLocation = () => {
        console.log("DEBUG: Loading city from IP address...");

        fetch('/api/ip_locate')
            .then(r => r.json())
            .then(data => {
                console.log("DEBUG: IP Location data:", data);
                const cityName = data.city || "UNKNOWN CITY";
                cityLabel.textContent = cityName;

                // If we have coordinates, show that location on map
                if (data.lat && data.lon && data.lat !== 0) {
                    map.setView([data.lat, data.lon], 12, { animate: false });
                } else {
                    // Default view (world center)
                    map.setView([0, 0], 2, { animate: false });
                }

                revealContent();
                console.log("DEBUG: [SUCCESS] IP-based location loaded!");
            })
            .catch(err => {
                console.error("DEBUG: IP lookup failed:", err);
                cityLabel.textContent = "WELCOME";
                map.setView([0, 0], 2, { animate: false });
                revealContent();
            });
    };

    // GPS geolocation (requires user permission) - called on GUEST button
    const requestGPSLocation = () => {
        console.log("DEBUG: [Step 1] Requesting GPS permission...");

        if (!("geolocation" in navigator)) {
            console.error("DEBUG: Geolocation not supported");
            // Still navigate to map, will use IP-based location there
            window.location.href = '/B_map_page/index.html';
            return;
        }

        // Show loading indicator
        loadingGif.style.display = 'block';
        loadingGif.style.opacity = '1';

        navigator.geolocation.getCurrentPosition(
            (position) => {
                console.log("DEBUG: [Step 2] GPS Permission GRANTED!");
                const userLat = position.coords.latitude;
                const userLon = position.coords.longitude;
                console.log(`DEBUG: GPS Coordinates: [${userLat}, ${userLon}]`);

                // Store GPS coords in sessionStorage for map page
                sessionStorage.setItem('gps_lat', userLat);
                sessionStorage.setItem('gps_lon', userLon);
                sessionStorage.setItem('gps_enabled', 'true');

                // Navigate to map page
                window.location.href = '/B_map_page/index.html';
            },
            (error) => {
                console.warn("DEBUG: GPS Error:", error.message);
                // GPS failed, but still allow navigation - map will use IP or default
                sessionStorage.setItem('gps_enabled', 'false');
                window.location.href = '/B_map_page/index.html';
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
    };

    // Retry button for error screen
    document.getElementById('retry-btn').addEventListener('click', loadIPLocation);

    // GUEST Button - Request GPS then navigate to map
    document.querySelector('.btn-guest').addEventListener('click', () => {
        console.log("DEBUG: GUEST button clicked. Requesting GPS permission...");
        requestGPSLocation();
    });

    // Listen for Enter key to trigger GUEST button
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            console.log("DEBUG: Enter key pressed. Triggering GUEST button click.");
            document.querySelector('.btn-guest').click();
        }
    });

    // LOGIN Button - Navigation handled by inline onclick
    document.querySelector('.btn-login').onclick = () => window.location.href = '/A_home_page/login.html';

    // Initial load - use IP-based location (no permission popup)
    setTimeout(loadIPLocation, 1000);
});
