"""
Authentication handlers for CrazyWalk-Game server.
Handles user registration and login via CSV-based user storage.
"""
import os
import csv
import json
import logging

logger = logging.getLogger(__name__)


def handle_register(handler):
    """
    Handle POST /api/register
    Body: { "username": "...", "password": "..." }
    """
    try:
        content_length = int(handler.headers.get('Content-Length', 0))
        body = handler.rfile.read(content_length)
        data = json.loads(body.decode())
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            handler.send_error(400, "Missing username or password")
            return

        users_file = os.path.join(os.getcwd(), 'CORE', 'DATA', 'users.csv')
        
        # Read existing users to check duplicate
        existing_users = []
        if os.path.exists(users_file):
            with open(users_file, 'r', newline='') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Handle 'usename' typo in csv header gracefully
                    u = row.get('usename') or row.get('username')
                    if u:
                        existing_users.append(u)
        
        if username in existing_users:
            handler.send_response(200)
            handler.send_header('Content-Type', 'application/json')
            handler.send_header('Access-Control-Allow-Origin', '*')
            handler.end_headers()
            handler.wfile.write(json.dumps({"status": "error", "message": "Username taken"}).encode())
            return

        # Append new user
        with open(users_file, 'a', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([username, password, 'user'])

        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()
        handler.wfile.write(json.dumps({"status": "ok", "message": "User registered"}).encode())

    except Exception as e:
        logger.error(f"Register Error: {e}")
        handler.send_error(500, str(e))


def handle_login(handler):
    """
    Handle POST /api/login
    Body: { "username": "...", "password": "..." }
    """
    try:
        content_length = int(handler.headers.get('Content-Length', 0))
        body = handler.rfile.read(content_length)
        data = json.loads(body.decode())
        username = data.get('username')
        password = data.get('password')
        
        users_file = os.path.join(os.getcwd(), 'CORE', 'DATA', 'users.csv')
        user_found = None
        
        if os.path.exists(users_file):
            with open(users_file, 'r', newline='') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    u = row.get('usename') or row.get('username')
                    p = row.get('password')
                    if u == username and p == password:
                        user_found = row
                        break
        
        if user_found:
            handler.send_response(200)
            handler.send_header('Content-Type', 'application/json')
            handler.send_header('Access-Control-Allow-Origin', '*')
            handler.end_headers()
            handler.wfile.write(json.dumps({"status": "ok", "user": {"username": username, "type": user_found.get('type')}}).encode())
        else:
            handler.send_response(200)
            handler.send_header('Content-Type', 'application/json')
            handler.send_header('Access-Control-Allow-Origin', '*')
            handler.end_headers()
            handler.wfile.write(json.dumps({"status": "error", "message": "Invalid credentials"}).encode())

    except Exception as e:
        logger.error(f"Login Error: {e}")
        handler.send_error(500, str(e))
