import http.server
import socketserver
import os
import hmac
import hashlib
import subprocess
import threading

PORT = 9000
SECRET = os.environ.get("AUTOUPDATE_WEBHOOK_FROM_GITHUB", "").encode("utf-8")
UpdateLock = threading.Lock()

class WebhookHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/push_and_update_server":
            self.send_error(404, "Not Found")
            return

        # Get headers
        content_length = int(self.headers.get("Content-Length", 0))
        hub_signature = self.headers.get("X-Hub-Signature")

        # Read payload
        payload = self.rfile.read(content_length)

        # Verify signature
        if SECRET:
            if not hub_signature:
                self.send_error(403, "Forbidden: Missing Signature")
                return
            
            sha_name, signature = hub_signature.split('=')
            if sha_name != 'sha1':
                self.send_error(501, "Not Implemented: Only SHA1 supported")
                return

            mac = hmac.new(SECRET, msg=payload, digestmod=hashlib.sha1)
            if not hmac.compare_digest(str(mac.hexdigest()), str(signature)):
                self.send_error(403, "Forbidden: Invalid Signature")
                return

        # Process payload (optional: check for specific branch)
        # For now, we just trigger the update for any push event
        
        # Respond immediately to avoid GitHub timeout
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Update triggered successfully")
        
        if not UpdateLock.locked():
             threading.Thread(target=self.run_update).start()
        else:
             print("Update already in progress. Skipping.", flush=True)

    def run_update(self):
        # Double check lock or just use it as context if we were blocking, 
        # but here we just want to skip if locked.
        if not UpdateLock.acquire(blocking=False):
             return
        
        try:
            print("Received valid webhook. Starting update process...", flush=True)
            
            # Execute git pull
            print("Running: git pull", flush=True)
            subprocess.check_call(["git", "pull"], cwd="/app", stderr=subprocess.STDOUT)
            
            # Execute docker compose up
            # Using modern Docker Compose V2 plugin (docker compose instead of docker-compose)
            # We assume docker-compose.prod.yml is the target, but we might need to be flexible.
            # Given the plan, we will use the prod file.
            # IMPORTANT: We must specify project name '-p crazywalk-game' because inside the container
            # the directory is /app, so default project name would be 'app', causing conflict with host's 'crazywalk-game'.
            print("Running: docker compose -p crazywalk-game -f docker-compose.prod.yml up -d --build app", flush=True)
            subprocess.check_call(
                ["docker", "compose", "-p", "crazywalk-game", "-f", "docker-compose.prod.yml", "up", "-d", "--build", "app"],
                cwd="/app",
                stderr=subprocess.STDOUT
            )
            
            print("Update completed successfully.", flush=True)
            
        except subprocess.CalledProcessError as e:
            print(f"Error during update: {e}", flush=True)
        except Exception as e:
            print(f"Unexpected error: {e}", flush=True)
        finally:
            UpdateLock.release()

if __name__ == "__main__":
    # Ensure we are in the right directory (though Docker workdir should handle this)
    # os.chdir("/app") 
    
    with socketserver.TCPServer(("", PORT), WebhookHandler) as httpd:
        print(f"Webhook listener serving at port {PORT}", flush=True)
        httpd.serve_forever()
