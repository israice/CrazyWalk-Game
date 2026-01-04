"""
CrazyWalk-Game Server
Main entry point with routing logic. Handlers are delegated to separate modules.
"""
import http.server
import socketserver
import os
import sys
import signal
import threading
import logging
import uuid
import time
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
                        if key not in os.environ:
                            os.environ[key] = value
                    except ValueError:
                        pass
        except Exception as e:
            logger.warning(f"Failed to read .env file: {e}")

    @staticmethod
    def setup_working_directory():
        """Ensure we are serving from the correct root relative to the script."""
        script_dir = os.path.dirname(os.path.abspath(__file__))
        os.chdir(script_dir)
        
        if not os.path.isdir(DIRECTORY):
            logger.error(f"Directory not found: {DIRECTORY}")
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
full_path = os.path.abspath(DIRECTORY)
if not os.path.exists(full_path):
    logger.error(f"CRITICAL: Serving directory does not exist: {full_path}")

# Generate unique session ID on server startup
SERVER_SESSION_ID = str(uuid.uuid4())
SERVER_START_TIME = int(time.time())
logger.info(f"Server Session ID: {SERVER_SESSION_ID}")
logger.info(f"Server Start Time: {SERVER_START_TIME}")

# Import handlers
from CORE.BACKEND.handlers import (
    handle_register, handle_login,
    handle_get_session,
    handle_locate, handle_ip_locate,
    handle_save_location_state, handle_get_location_state,
    handle_get_game_state, handle_save_game_state,
    handle_serve_poster, handle_serve_promo,
    handle_get_promos, handle_serve_readme,
    proxy_nominatim,
    handle_game_data,
    handle_unified_state
)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler to filter out known noise and improve logging."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        """Add caching headers. Always disabled for development."""
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        """Override to filter specific 404s and use standard logging."""
        if hasattr(self, 'path') and "com.chrome.devtools.json" in self.path:
            return
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
        if self.path.startswith('/api/session'):
            handle_get_session(self, SERVER_SESSION_ID, SERVER_START_TIME)
            return
        if self.path.startswith('/api/ip_locate'):
            handle_ip_locate(self)
            return
        if self.path.startswith('/api/locate'):
            handle_locate(self)
            return
        if self.path.startswith('/api/reverse') or self.path.startswith('/api/search'):
            proxy_nominatim(self)
            return
        if self.path.startswith('/api/unified_state'):
            handle_unified_state(self, 'GET')
            return
        if self.path.startswith('/api/game_state'):
            handle_get_game_state(self)
            return
        if self.path.startswith('/api/game_data'):
            handle_game_data(self)
            return
        if self.path.startswith('/api/location_state'):
            handle_get_location_state(self)
            return
        if self.path.startswith('/GAME_POSTERS/'):
            logger.info(f"MATCHED Poster Route: {self.path}")
            handle_serve_poster(self)
            return
        if self.path.startswith('/GAME_PROMOS/'):
            logger.info(f"MATCHED Promo Route: {self.path}")
            handle_serve_promo(self)
            return
        if self.path.startswith('/api/promos'):
            handle_get_promos(self)
            return
        if self.path.startswith('/README.md'):
            handle_serve_readme(self)
            return

        if self.command == 'GET':
            super().do_GET()
        else:
            super().do_HEAD()

    def do_POST(self):
        """Handle POST requests."""
        if self.path.startswith('/api/unified_state'):
            handle_unified_state(self, 'POST')
            return
        if self.path.startswith('/api/game_state'):
            handle_save_game_state(self)
            return
        if self.path.startswith('/api/location_state'):
            handle_save_location_state(self)
            return
        if self.path.startswith('/api/register'):
            handle_register(self)
            return
        if self.path.startswith('/api/login'):
            handle_login(self)
            return
        self.send_error(404, "Not Found")


class ThreadedHTTPServer(socketserver.ThreadingTCPServer):
    """Multi-threaded server to handle concurrent requests."""
    allow_reuse_address = True
    daemon_threads = True

    def handle_error(self, request, client_address):
        """Override to silence disconnect errors."""
        exc_type, exc_value, _ = sys.exc_info()
        
        if exc_type is ConnectionAbortedError or exc_type is BrokenPipeError:
            return
            
        if hasattr(exc_value, 'winerror') and exc_value.winerror == 10053:
            return

        super().handle_error(request, client_address)


def ensure_redis_running():
    """Checks if Redis is accessible. If not, attempts to start it via Docker."""
    from CORE.BACKEND.redis_tools import get_redis_client
    import subprocess
    import time as time_module
    
    try:
        r = get_redis_client()
        r.ping()
        logger.info("Flushing Redis database...")
        r.flushdb()
        logger.info(f"✅ Redis database FLUSHED successfully (Port {os.getenv('REDIS_PORT', 6379)})")
        return
    except Exception:
        try:
            os.environ['REDIS_PORT'] = '6500'
            r = get_redis_client()
            r.ping()
            logger.info("Flushing Redis database...")
            r.flushdb()
            logger.info("✅ Redis database FLUSHED successfully (Port 6500)")
            return
        except Exception:
            pass

    logger.warning("Redis is not running. Attempting to start via Docker Compose...")
    try:
        subprocess.run(["docker", "compose", "-f", "docker-compose.dev.yml", "up", "-d", "redis"], check=True)
        logger.info("Docker Compose command executed. Waiting for Redis to initialize...")
        
        os.environ['REDIS_PORT'] = '6500'
        r = get_redis_client()

        retries = 10
        for i in range(retries):
            try:
                r.ping()
                logger.info("Flushing Redis database...")
                r.flushdb()
                logger.info("✅ Redis database FLUSHED successfully (Port 6500)")
                return
            except Exception:
                time_module.sleep(2)
                logger.info(f"Waiting for Redis... ({i+1}/{retries})")
        
        logger.error("Redis failed to come online after starting container.")
    except Exception as docker_e:
        logger.error(f"Failed to start Redis via Docker: {docker_e}")
        logger.error("Please run 'docker compose up -d redis' manually.")


def run_server():
    Initializer.setup_working_directory()
    ensure_redis_running()
    
    with ThreadedHTTPServer(("", PORT), QuietHandler) as httpd:
        logger.info(f"http://localhost:{PORT}")
        
        def signal_handler(sig, frame):
            logger.info("Shutting down server...")
            threading.Thread(target=httpd.shutdown).start()

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            httpd.server_close()
            logger.info("Server stopped.")


if __name__ == "__main__":
    run_server()
