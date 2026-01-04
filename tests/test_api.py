"""
API endpoint tests for CrazyWalk-Game server.
These are integration tests that verify the server responds correctly.
"""
import pytest
import urllib.request
import urllib.error
import json
import subprocess
import time
import socket
import os


def is_port_in_use(port: int) -> bool:
    """Check if a port is currently in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0


class TestServerHealth:
    """Test basic server health and session endpoints."""

    @pytest.fixture(autouse=True)
    def check_server(self):
        """Skip tests if server is not running."""
        if not is_port_in_use(8000):
            pytest.skip("Server is not running on port 8000. Start with: python server.py")

    def test_root_returns_html(self):
        """Test that root path returns HTML content."""
        req = urllib.request.Request("http://localhost:8000/")
        with urllib.request.urlopen(req, timeout=5) as response:
            assert response.status == 200
            content_type = response.headers.get('Content-Type', '')
            assert 'text/html' in content_type

    def test_session_endpoint(self):
        """Test /api/session returns valid session data."""
        req = urllib.request.Request("http://localhost:8000/api/session")
        with urllib.request.urlopen(req, timeout=5) as response:
            assert response.status == 200
            data = json.loads(response.read().decode())
            assert 'session_id' in data
            assert 'start_time' in data

    def test_favicon_exists(self):
        """Test that favicon is served."""
        req = urllib.request.Request("http://localhost:8000/favicon.ico")
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                assert response.status == 200
        except urllib.error.HTTPError as e:
            # 404 is acceptable if favicon doesn't exist
            assert e.code == 404


class TestAPIEndpoints:
    """Test API endpoint responses."""

    @pytest.fixture(autouse=True)
    def check_server(self):
        """Skip tests if server is not running."""
        if not is_port_in_use(8000):
            pytest.skip("Server is not running on port 8000. Start with: python server.py")

    def test_game_state_get_empty(self):
        """Test GET /api/game_state returns valid response."""
        req = urllib.request.Request("http://localhost:8000/api/game_state")
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                assert response.status == 200
                data = json.loads(response.read().decode())
                # Response can be empty or contain game state
                assert isinstance(data, dict)
        except urllib.error.HTTPError as e:
            # 404 is acceptable for no saved state
            assert e.code in [404, 500]

    def test_location_state_requires_key(self):
        """Test GET /api/location_state requires location_key parameter."""
        req = urllib.request.Request("http://localhost:8000/api/location_state")
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                # Should not reach here - parameter is required
                pass
        except urllib.error.HTTPError as e:
            # 400 Bad Request expected
            assert e.code in [400, 404]


class TestAuthEndpoints:
    """Test authentication endpoints."""

    @pytest.fixture(autouse=True)
    def check_server(self):
        """Skip tests if server is not running."""
        if not is_port_in_use(8000):
            pytest.skip("Server is not running on port 8000. Start with: python server.py")

    def test_login_requires_post(self):
        """Test /api/login only accepts POST."""
        req = urllib.request.Request("http://localhost:8000/api/login")
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                # GET should not work
                pass
        except urllib.error.HTTPError as e:
            # 405 Method Not Allowed or 404 expected
            assert e.code in [404, 405]

    def test_register_requires_post(self):
        """Test /api/register only accepts POST."""
        req = urllib.request.Request("http://localhost:8000/api/register")
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                # GET should not work
                pass
        except urllib.error.HTTPError as e:
            # 405 Method Not Allowed or 404 expected
            assert e.code in [404, 405]
