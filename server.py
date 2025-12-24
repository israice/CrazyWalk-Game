import http.server
import socketserver
import os
import sys
import signal
import threading
import logging
import urllib.request
import urllib.parse
import json
from typing import Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

class Initializer:
    @staticmethod
    def load_env():
        """Load .env file into os.environ if it exists."""
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
        if not os.path.exists(env_path):
            return

        try:
            with open(env_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    try:
                        key, value = line.split('=', 1)
                        key = key.strip()
                        value = value.strip().strip("'").strip('"')
                        # Do not override existing environment variables
                        if key not in os.environ:
                            os.environ[key] = value
                    except ValueError:
                        pass # Ignore malformed lines
        except Exception as e:
            logger.warning(f"Failed to read .env file: {e}")

    @staticmethod
    def setup_working_directory():
        """Ensure we are serving from the correct root relative to the script."""
        script_dir = os.path.dirname(os.path.abspath(__file__))
        os.chdir(script_dir)
        
        # Verify directory exists
        if not os.path.isdir(DIRECTORY):
            logger.error(f"Directory not found: {DIRECTORY}")
            logger.info("Current working directory: " + os.getcwd())
            sys.exit(1)

# Initialize environment
Initializer.load_env()

# Configuration
PORT = int(os.environ.get("SERVER_PORT", 8000))
DIRECTORY = os.environ.get("FRONTEND_INDEX_PAGE", "CORE/FRONTEND")

if not os.environ.get("SERVER_PORT"):
    logger.warning("SERVER_PORT not found in .env, defaulting to 8000")
if not os.environ.get("FRONTEND_INDEX_PAGE"):
    logger.warning("FRONTEND_INDEX_PAGE not found in .env, defaulting to CORE/FRONTEND")

if "A_home_page" in DIRECTORY:
    logger.warning(f"Detected incorrect DIRECTORY configuration: {DIRECTORY}. Forcing to 'CORE/FRONTEND'")
    DIRECTORY = "CORE/FRONTEND"

logger.info("Server starting.")
logger.info(f"Current Working Directory: {os.getcwd()}")
logger.info(f"Serving Directory: {DIRECTORY}")
full_path = os.path.abspath(DIRECTORY)
logger.info(f"Full Serving Path: {full_path}")
if not os.path.exists(full_path):
    logger.error(f"CRITICAL: Serving directory does not exist: {full_path}")

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler to filter out known noise and improve logging."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        """Add caching headers. Always disabled for development."""
        # ⚠️ WARNING: DO NOT ENABLE BROWSER CACHING DURING DEVELOPMENT ⚠️
        # Caching causes browsers to use old file versions even after server restart
        # This led to multiple debugging issues where changes weren't visible
        # Only re-enable this for production deployment with proper versioning
        
        # Always disable cache completely
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")  # HTTP/1.0 compatibility
        self.send_header("Expires", "0")  # Proxies
        super().end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        """Override to filter specific 404s and use standard logging."""
        # Filter out Chrome DevTools 404 noise
        if hasattr(self, 'path') and "com.chrome.devtools.json" in self.path:
            return
            
        # Log everything else normally using our logger
        logger.info("%s - - [%s] %s" %
                    (self.client_address[0],
                     self.log_date_time_string(),
                     format % args))

    def do_HEAD(self):
        """Handle HEAD requests."""
        self.handle_routing()

    def do_GET(self):
        """Handle GET requests, including API proxies."""
        self.handle_routing()

    def handle_routing(self):
        """Shared routing for GET and HEAD."""
        logger.info(f"INCOMING {self.command} REQUEST: {self.path}")
        
        if self.path.startswith('/api/ip_locate'):
            self.handle_ip_locate()
            return
        if self.path.startswith('/api/locate'):
            self.handle_locate()
            return
        if self.path.startswith('/api/reverse') or self.path.startswith('/api/search'):
            self.proxy_nominatim()
            return
        if self.path.startswith('/api/game_data'):
            self.handle_game_data()
            return
        if self.path.startswith('/api/location_state'):
            self.handle_get_location_state()
            return
        if self.path.startswith('/GAME_POSTERS/'):
            logger.info(f"MATCHED Poster Route: {self.path}")
            self.handle_serve_poster()
            return

        if self.command == 'GET':
            super().do_GET()
        else:
            super().do_HEAD()

    def do_POST(self):
        """Handle POST requests."""
        if self.path.startswith('/api/location_state'):
            self.handle_save_location_state()
            return
        self.send_error(404, "Not Found")

    def handle_locate(self):
        """
        Handle /api/locate request.
        Takes lat/lon, reverse geocodes to find city, 
        then optionally searches for city center to return canonical coordinates.
        Returns: { 'city': 'City Name', 'lat': 0.0, 'lon': 0.0 }
        """
        try:
            # Parse params
            parsed_path = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed_path.query)
            lat = params.get('lat', [None])[0]
            lon = params.get('lon', [None])[0]

            if not lat or not lon:
                self.send_error(400, "Missing lat or lon parameters")
                return
            
            user_lat = float(lat)
            user_lon = float(lon)
            
            # Default fallback values
            city = "Unknown City"
            target_lat = user_lat
            target_lon = user_lon
            
            headers = {'User-Agent': 'CrazyWalk/1.0'}
            api_timeout = 3 # seconds

            # 1. Reverse Geocode to get City Name
            try:
                # zoom=18 provides city-level detail in reverse geocoding
                reverse_url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&zoom=18&accept-language=en"
                req = urllib.request.Request(reverse_url, headers=headers)
                
                with urllib.request.urlopen(req, timeout=api_timeout) as response:
                    if response.status == 200:
                        data = json.loads(response.read().decode())
                        address = data.get('address', {})
                        # Priority: city > municipality > town > suburb > village > hamlet > county > state
                        # This ensures we get the actual city name, not the region/district
                        city = address.get('city') or address.get('municipality') or address.get('town') or \
                               address.get('suburb') or address.get('village') or address.get('hamlet') or \
                               address.get('county') or address.get('state') or "Unknown City"
            except Exception as e:
                logger.warning(f"Reverse geocoding failed: {e}")
                # Continue with defaults

            # 2. (Optional) Search for City Center
            # Only try if we found a valid city name
            if city != "Unknown City":
                try:
                    encoded_q = urllib.parse.quote(city)
                    search_url = f"https://nominatim.openstreetmap.org/search?format=json&q={encoded_q}&limit=1&accept-language=en"
                    req_search = urllib.request.Request(search_url, headers=headers)
                    
                    with urllib.request.urlopen(req_search, timeout=api_timeout) as response:
                        if response.status == 200:
                            search_data = json.loads(response.read().decode())
                            if search_data:
                                target_lat = float(search_data[0]['lat'])
                                target_lon = float(search_data[0]['lon'])
                except Exception as e:
                    logger.warning(f"City search failed: {e}")
                    # Continue with user coords as target

            # Construct Response
            result = {
                "city": city.upper(),
                "lat": target_lat,
                "lon": target_lon,
                "user_lat": user_lat,
                "user_lon": user_lon
            }

            # Send Headers
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*') 
            self.end_headers()
            
            # Send Body
            self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            logger.error(f"Locate Fatal Error: {e}")
            self.send_error(500, f"Server Error: {str(e)}")

    def handle_ip_locate(self):
        """
        Handle /api/ip_locate request.
        Uses ip-api.com to get approximate location from client IP.
        Returns: { 'city': 'City Name', 'lat': 0.0, 'lon': 0.0 }
        """
        try:
            # Get client IP from request
            client_ip = self.client_address[0]
            
            # For localhost, we need to get external IP or use a fallback
            if client_ip in ('127.0.0.1', '::1', 'localhost'):
                # Use ip-api without IP param to detect server's external IP
                api_url = "http://ip-api.com/json/?fields=status,message,city,lat,lon"
            else:
                api_url = f"http://ip-api.com/json/{client_ip}?fields=status,message,city,lat,lon"
            
            headers = {'User-Agent': 'CrazyWalk/1.0'}
            req = urllib.request.Request(api_url, headers=headers)
            
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    
                    if data.get('status') == 'success':
                        city = data.get('city')
                        logger.info(f"IP Geolocation Success: City='{city}', lat={data.get('lat')}, lon={data.get('lon')}")
                        result = {
                            "city": (city or 'Unknown City').upper(),
                            "lat": data.get('lat', 0),
                            "lon": data.get('lon', 0)
                        }
                    else:
                        logger.warning(f"IP Geolocation 1st attempt failed: {data.get('message')}. Retrying as server/localhost...")
                        # RETRY: Try without IP (uses server's external IP)
                        # This handles cases where client_ip is a private LAN IP (e.g. 192.168.x.x) which ip-api rejects
                        retry_url = "http://ip-api.com/json/?fields=status,message,city,lat,lon"
                        req_retry = urllib.request.Request(retry_url, headers=headers)
                        with urllib.request.urlopen(req_retry, timeout=5) as response_retry:
                             if response_retry.status == 200:
                                data_retry = json.loads(response_retry.read().decode())
                                if data_retry.get('status') == 'success':
                                    city = data_retry.get('city')
                                    logger.info(f"IP Geolocation Retry Success: City='{city}'")
                                    result = {
                                        "city": (city or 'Unknown City').upper(),
                                        "lat": data_retry.get('lat', 0),
                                        "lon": data_retry.get('lon', 0)
                                    }
                                else:
                                    logger.error(f"IP Geolocation Retry Failed: {data_retry.get('message')}")
                                    result = {"city": "UNKNOWN CITY", "lat": 0, "lon": 0}
                             else:
                                result = {"city": "UNKNOWN CITY", "lat": 0, "lon": 0}
                else:
                    result = {"city": "UNKNOWN CITY", "lat": 0, "lon": 0}
            
            # Send Response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            logger.error(f"IP Locate Error: {e}")
            # Return fallback on error
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"city": "UNKNOWN CITY", "lat": 0, "lon": 0}).encode())

    def handle_save_location_state(self):
        """
        Handle POST /api/location_state
        Saves collected circles for a location to Redis.
        Body: { "location_key": "lat_lon", "collected_circles": ["lat,lon", ...] }
        """
        try:
            from CORE.BACKEND.redis_tools import get_redis_client
            
            # Read POST body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode())
            
            location_key = data.get('location_key')
            collected_circles = data.get('collected_circles', [])
            
            if not location_key:
                self.send_error(400, "Missing location_key")
                return
            
            # Save to Redis with 7-day TTL
            redis_key = f"location:{location_key}:collected"
            r = get_redis_client()
            
            if collected_circles:
                r.set(redis_key, json.dumps(collected_circles))
                r.expire(redis_key, 60 * 60 * 24 * 7)  # 7 days
                logger.info(f"Saved {len(collected_circles)} collected circles for location {location_key}")
            else:
                # Clear if empty
                r.delete(redis_key)
                logger.info(f"Cleared collected circles for location {location_key}")
            
            # Send response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "saved": len(collected_circles)}).encode())
            
        except Exception as e:
            logger.error(f"Save Location State Error: {e}")
            self.send_error(500, str(e))

    def handle_get_location_state(self):
        """
        Handle GET /api/location_state?location_key=lat_lon
        Returns saved collected circles for a location.
        """
        try:
            from CORE.BACKEND.redis_tools import get_redis_client
            
            # Parse query params
            parsed_path = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed_path.query)
            location_key = params.get('location_key', [None])[0]
            
            if not location_key:
                self.send_error(400, "Missing location_key parameter")
                return
            
            # Get from Redis
            redis_key = f"location:{location_key}:collected"
            r = get_redis_client()
            data = r.get(redis_key)
            
            collected_circles = json.loads(data) if data else []
            logger.info(f"Retrieved {len(collected_circles)} collected circles for location {location_key}")
            
            # Send response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                "location_key": location_key,
                "collected_circles": collected_circles
            }).encode())
            
        except Exception as e:
            logger.error(f"Get Location State Error: {e}")
            self.send_error(500, str(e))


    def handle_serve_poster(self):
        """Serve images from CORE/DATA/GAME_POSTERS."""
        try:
            # Extract filename and ensure it's safe
            filename = os.path.basename(self.path)
            poster_path = os.path.join(os.getcwd(), 'CORE', 'DATA', 'GAME_POSTERS', filename)
            
            logger.info(f"Attempting to serve poster: {poster_path}")

            if not os.path.exists(poster_path):
                logger.error(f"POSTER NOT FOUND on disk: {poster_path}")
                self.send_error(404, "Poster Not Found")
                return
                
            if not filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                logger.error(f"INVALID POSTER EXTENSION: {filename}")
                self.send_error(404, "Invalid Extension")
                return
                
            self.send_response(200)
            self.send_header('Content-Type', 'image/jpeg')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'public, max-age=86400') # Cache for 1 day
            self.end_headers()
            
            with open(poster_path, 'rb') as f:
                self.wfile.write(f.read())
        except Exception as e:
            logger.error(f"Error serving poster: {e}")
            self.send_error(500, str(e))

    def proxy_nominatim(self):
        """Proxy requests to Nominatim to avoid CORS."""
        try:
            # Parse internal request
            parsed_path = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed_path.query)
            
            # Construct target URL based on endpoint
            if self.path.startswith('/api/reverse'):
                # Extract lat/lon
                lat = params.get('lat', [None])[0]
                lon = params.get('lon', [None])[0]
                if not lat or not lon:
                    self.send_error(400, "Missing lat/lon")
                    return
                target_url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&accept-language=en"
                
            elif self.path.startswith('/api/search'):
                # Extract query
                q = params.get('q', [None])[0]
                limit = params.get('limit', ['1'])[0]
                if not q:
                    self.send_error(400, "Missing query")
                    return
                # Encode query params properly
                encoded_q = urllib.parse.quote(q)
                target_url = f"https://nominatim.openstreetmap.org/search?format=json&q={encoded_q}&limit={limit}&accept-language=en"
            
            # Make request with User-Agent (Required by OSM)
            req = urllib.request.Request(target_url, headers={'User-Agent': 'CrazyWalk/1.0'})
            
            with urllib.request.urlopen(req) as response:
                data = response.read()
                
            # Send response back to frontend
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*') 
            self.end_headers()
            self.wfile.write(data)
            
        except Exception as e:
            logger.error(f"Proxy error: {e}")
            self.send_error(500, f"Proxy error: {str(e)}")

    def handle_game_data(self):
        """
        Handle /api/game_data.
        Generates/Retrieves game elements (Lines, Polygons).
        """
        try:
            # Parse params
            parsed_path = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed_path.query)
            lat = float(params.get('lat', [0])[0])
            lon = float(params.get('lon', [0])[0])
            rebuild_param = params.get('rebuild', ['false'])[0].lower()
            # TEMP: Force rebuild to always be True for debugging polygon merging
            force_rebuild = True  # rebuild_param == 'true'
            
            if not lat or not lon:
                self.send_error(400, "Missing lat/lon")
                return

            # Import and Reload to ensure fresh code
            import importlib
            from CORE.BACKEND import LocationPolygonsGenerator
            
            # Force reload of dependencies in order
            importlib.reload(LocationPolygonsGenerator)
            
            # Generate Data
            generator = LocationPolygonsGenerator.LocationPolygonsGenerator()
            data = generator.generate_map(lat, lon, force_rebuild=force_rebuild)
            
            # Send Response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*') 
            self.end_headers()
            
            # Use a custom JSON encoder if needed, or ensure data is basic types.
            # Shapely objects (Polygon) or sets are not JSON serializable. 
            # Review Modules:
            # AA: returns list of tuples (lat, lon) -> JSON OK? No, tuple becomes list.
            # AB: returns list of dicts -> JSON OK.
            # AC: list of dicts -> JSON OK.
            # AD: list of dicts, coords is list of tuples -> JSON OK.
            # AE: list of dicts -> JSON OK.

            self.wfile.write(json.dumps(data).encode())
            
        except Exception as e:
            logger.error(f"Game Data Error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            self.send_error(500, str(e))

class ThreadedHTTPServer(socketserver.ThreadingTCPServer):
    """Multi-threaded server to handle concurrent requests."""
    allow_reuse_address = True
    daemon_threads = True

    def handle_error(self, request, client_address):
        """Override to silence disconnect errors."""
        # Get the exception info
        exc_type, exc_value, _ = sys.exc_info()
        
        # Check for known connection dropping errors
        # WinError 10053 = Connection aborted by host machine
        # BrokenPipeError = Client closed before we finished
        if exc_type is ConnectionAbortedError or exc_type is BrokenPipeError:
            return  # Ignore these common occurrences
            
        # For Windows specifically, check the errno/winerror if available
        if hasattr(exc_value, 'winerror') and exc_value.winerror == 10053:
            return

        # Log real errors normally
        super().handle_error(request, client_address)

def ensure_redis_running():
    """Checks if Redis is accessible. If not, attempts to start it via Docker."""
    from CORE.BACKEND.redis_tools import get_redis_client
    import subprocess
    import time
    
    # Try connecting with current settings (likely default 6379)
    try:
        r = get_redis_client()
        r.ping()
        logger.info("Flushing Redis database...")
        r.flushdb()
        logger.info(f"✅ Redis database FLUSHED successfully (Port {os.getenv('REDIS_PORT', 6379)})")
        return
    except Exception:
        # If default failed, try port 6500 (common dev port)
        try:
            os.environ['REDIS_PORT'] = '6500'
            r = get_redis_client()
            r.ping()
            logger.info("Flushing Redis database...")
            r.flushdb()
            logger.info("✅ Redis database FLUSHED successfully (Port 6500)")
            return
        except Exception:
            # If 6500 also failed, proceed to start Docker
            pass

    logger.warning("Redis is not running. Attempting to start via Docker Compose...")
    try:
        # Build/Start redis service
        subprocess.run(["docker-compose", "-f", "docker-compose.dev.yml", "up", "-d", "redis"], check=True)
        logger.info("Docker Compose command executed. Waiting for Redis to initialize...")
        
        # When started via dev compose, it is definitely on port 6500
        os.environ['REDIS_PORT'] = '6500'
        
        # Re-get client with new port
        r = get_redis_client()

        # Wait loop
        retries = 10
        for i in range(retries):
            try:
                r.ping()
                logger.info("Flushing Redis database...")
                r.flushdb()
                logger.info("✅ Redis database FLUSHED successfully (Port 6500)")
                return
            except Exception:
                time.sleep(2)
                logger.info(f"Waiting for Redis... ({i+1}/{retries})")
        
        logger.error("Redis failed to come online after starting container.")
    except Exception as docker_e:
        logger.error(f"Failed to start Redis via Docker: {docker_e}")
        logger.error("Please run 'docker-compose up -d redis' manually.")

def run_server():
    Initializer.setup_working_directory()
    ensure_redis_running()
    
    with ThreadedHTTPServer(("", PORT), QuietHandler) as httpd:
        logger.info(f"http://localhost:{PORT}")
        
        # Register signal handlers for graceful shutdown (Docker friendly)
        def signal_handler(sig, frame):
            logger.info("Shutting down server...")
            # shutdown() must be called from a different thread to avoid deadlock with serve_forever()
            threading.Thread(target=httpd.shutdown).start()

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass # Handled by signal handler, but just in case
        finally:
            httpd.server_close()
            logger.info("Server stopped.")

if __name__ == "__main__":
    run_server()
