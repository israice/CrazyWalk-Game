import pytest
import urllib.request
import json
import socket

def is_port_in_use(port: int) -> bool:
    """Check if a port is currently in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

class TestGameLogicBackend:
    """Tests for game logic consistency on the backend."""

    @pytest.fixture(autouse=True)
    def check_server(self):
        """Skip tests if server is not running."""
        if not is_port_in_use(8000):
            pytest.skip("Server is not running on port 8000. Start with: python server.py")

    def get_json(self, url):
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as response:
            assert response.status == 200
            return json.loads(response.read().decode())

    def test_saturation_data_consistency(self):
        """Test that data required for saturation calculation is consistent."""
        data = self.get_json("http://localhost:8000/api/game_data?lat=32.056880&lon=34.768780&mode=initial")
        
        # Check Blue Circles for connection data
        for circle in data.get('blue_circles', []):
            if 'connections' in circle:
                # 'connections' should reflect the total expected lines
                assert isinstance(circle['connections'], int)
                assert circle['connections'] >= 0
            
            if 'connected_polygon_ids' in circle:
                # Should be a list of UIDs
                assert isinstance(circle['connected_polygon_ids'], list)

    def test_coordinates_for_snapping(self):
        """Verify that all interactable elements have valid coordinates for snapping."""
        data = self.get_json("http://localhost:8000/api/game_data?lat=32.056880&lon=34.768780&mode=initial")
        
        # 1. Blue Circles
        for circle in data.get('blue_circles', []):
            assert 'lat' in circle
            assert 'lon' in circle
            assert isinstance(circle['lat'], (int, float))
            assert isinstance(circle['lon'], (int, float))
            assert -90 <= circle['lat'] <= 90
            assert -180 <= circle['lon'] <= 180

        # 2. Green Circles
        for circle in data.get('green_circles', []):
            assert 'lat' in circle
            assert 'lon' in circle
            
    def test_white_line_completeness(self):
        """Verify white lines have start/end coordinates for rendering."""
        data = self.get_json("http://localhost:8000/api/game_data?lat=32.056880&lon=34.768780&mode=initial")
        
        for line in data.get('white_lines', []):
            assert 'start' in line
            assert 'end' in line
            assert len(line['start']) == 2
            assert len(line['end']) == 2
