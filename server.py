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

logger.info(f"Server starting.")
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
        """Add caching headers to static files."""
        # Default: Cache assets (images, css) for 1 hour
        cache_ctrl = "public, max-age=3600"
        
        # Don't cache HTML files so users always get the latest code/fixes
        if hasattr(self, 'path') and (self.path.endswith('.html') or self.path == '/' or self.path == ''):
             cache_ctrl = "no-cache, no-store, must-revalidate"

        self.send_header("Cache-Control", cache_ctrl)
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

    def do_GET(self):
        """Handle GET requests, including API proxies."""
        if self.path.startswith('/api/locate'):
            self.handle_locate()
            return
        # Debugging request path
        # logger.info(f"Checking Path: {self.path}") 
        if self.path.startswith('/api/reverse') or self.path.startswith('/api/search'):
            self.proxy_nominatim()
            return
        if self.path.startswith('/api/game_data'):
            logger.info(f"Route Matched: /api/game_data")
            self.handle_game_data()
            return
        super().do_GET()

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
                reverse_url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&accept-language=en"
                req = urllib.request.Request(reverse_url, headers=headers)
                
                with urllib.request.urlopen(req, timeout=api_timeout) as response:
                    if response.status == 200:
                        data = json.loads(response.read().decode())
                        address = data.get('address', {})
                        city = address.get('city') or address.get('town') or address.get('village') or \
                               address.get('hamlet') or address.get('state') or "Unknown City"
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
            force_rebuild = rebuild_param == 'true'
            
            if not lat or not lon:
                self.send_error(400, "Missing lat/lon")
                return

            # Import and Reload to ensure fresh code
            import importlib
            from CORE.BACKEND import GameMapGenerator
            
            # Force reload of dependencies in order
            importlib.reload(GameMapGenerator)
            
            # Generate Data
            generator = GameMapGenerator.GameMapGenerator()
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
    from CORE.redis_client import get_redis_client
    import subprocess
    import time
    
    r = get_redis_client()
    try:
        # PING
        r.ping()
        logger.info("Redis is running and accessible.")
    except Exception as e:
        logger.warning(f"Redis is not running ({e}). Attempting to start via Docker Compose...")
        try:
            # Try to start redis service
            # Assumes docker-compose is in path and file is in current directory
            subprocess.run(["docker-compose", "-f", "docker-compose.dev.yml", "up", "-d", "redis"], check=True)
            logger.info("Docker Compose command executed. Waiting for Redis to initialize...")
            
            # Wait loop
            retries = 5
            for i in range(retries):
                time.sleep(2)
                try:
                    r.ping()
                    logger.info("Redis started successfully.")
                    return
                except Exception:
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
