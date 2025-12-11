import http.server
import socketserver
import os
import hmac
import hashlib
import subprocess
import urllib.parse

PORT = 9000
SECRET = os.environ.get("AUTOUPDATE_WEBHOOK_FROM_GITHUB", "").encode("utf-8")

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
        
        try:
            print("Received valid webhook. Starting update process...")
            
            # Execute git pull
            print("Running: git pull")
            subprocess.check_call(["git", "pull"], cwd="/app")
            
            # Execute docker compose up
            # We assume docker-compose.prod.yml is the target, but we might need to be flexible.
            # Given the plan, we will use the prod file.
            print("Running: docker-compose -f docker-compose.prod.yml up -d --build crazywalk-game")
            subprocess.check_call(
                ["docker-compose", "-f", "docker-compose.prod.yml", "up", "-d", "--build", "crazywalk-game"],
                cwd="/app"
            )
            
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Update triggered successfully")
            print("Update completed successfully.")
            
        except subprocess.CalledProcessError as e:
            print(f"Error during update: {e}")
            self.send_error(500, f"Internal Server Error: Update failed - {e}")
        except Exception as e:
            print(f"Unexpected error: {e}")
            self.send_error(500, f"Internal Server Error: {e}")

if __name__ == "__main__":
    # Ensure we are in the right directory (though Docker workdir should handle this)
    # os.chdir("/app") 
    
    with socketserver.TCPServer(("", PORT), WebhookHandler) as httpd:
        print(f"Webhook listener serving at port {PORT}")
        httpd.serve_forever()
