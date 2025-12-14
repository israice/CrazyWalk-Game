import http.server
import socketserver
import os
import sys
import signal
import threading
import logging
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
DIRECTORY = os.environ.get("FRONTEND_INDEX_PAGE", "CORE/FRONTEND/A_home_page")

if not os.environ.get("SERVER_PORT"):
    logger.warning("SERVER_PORT not found in .env, defaulting to 8000")
if not os.environ.get("FRONTEND_INDEX_PAGE"):
    logger.warning("FRONTEND_INDEX_PAGE not found in .env, defaulting to CORE/FRONTEND/A_home_page")

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler to filter out known noise and improve logging."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

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

class ThreadedHTTPServer(socketserver.ThreadingTCPServer):
    """Multi-threaded server to handle concurrent requests."""
    allow_reuse_address = True
    daemon_threads = True

def run_server():
    Initializer.setup_working_directory()
    
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
