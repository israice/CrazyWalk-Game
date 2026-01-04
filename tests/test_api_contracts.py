import pytest
import urllib.request
import json
import socket

def is_port_in_use(port: int) -> bool:
    """Check if a port is currently in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

class TestAPIContracts:
    """Tests for API data contracts and schema validation."""

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

    def test_game_data_schema_validity(self):
        """Verify /api/game_data returns correct schema structure."""
        data = self.get_json("http://localhost:8000/api/game_data?lat=32.056880&lon=34.768780&mode=initial")
        
        # 1. Top Level Keys
        required_keys = ['polygons', 'white_lines', 'blue_circles', 'green_circles']
        for key in required_keys:
            assert key in data, f"Missing top-level key: {key}"
            assert isinstance(data[key], list), f"{key} should be a list"

        # 2. Polygon Schema
        if data['polygons']:
            poly = data['polygons'][0]
            assert 'uid' in poly
            assert 'center' in poly
            assert 'boundary_white_lines' in poly
            assert isinstance(poly['boundary_white_lines'], list)

        # 3. White Line Schema
        if data['white_lines']:
            line = data['white_lines'][0]
            assert 'uid' in line
            assert 'start' in line
            assert 'end' in line
            assert 'start_blue_circle_id' in line
            assert 'end_blue_circle_id' in line

    def test_graph_integrity_cross_reference(self):
        """Verify that IDs referenced in the graph actually exist."""
        data = self.get_json("http://localhost:8000/api/game_data?lat=32.056880&lon=34.768780&mode=initial")
        
        # Index all items by UID for fast lookup
        all_uids = set()
        for key in ['polygons', 'white_lines', 'blue_circles', 'green_circles']:
            for item in data.get(key, []):
                if 'uid' in item:
                    all_uids.add(item['uid'])
                if 'id' in item: # Legacy compat
                     all_uids.add(item['id'])

        # Check Polygon -> White Line references
        for poly in data.get('polygons', []):
            for line_id in poly.get('boundary_white_lines', []):
                if isinstance(line_id, str) and line_id.startswith('WHITE_LINE_'):
                    assert line_id in all_uids, f"Polygon referenced missing White Line: {line_id}"

        # Check White Line -> Blue Circle references
        for line in data.get('white_lines', []):
            start_id = line.get('start_blue_circle_id')
            end_id = line.get('end_blue_circle_id')
            
            if start_id:
                assert start_id in all_uids, f"White Line referenced missing Start Blue Circle: {start_id}"
            if end_id:
                assert end_id in all_uids, f"White Line referenced missing End Blue Circle: {end_id}"

    def test_explicit_ids_format(self):
        """Verify that UIDs follow the expected format (prefix)."""
        data = self.get_json("http://localhost:8000/api/game_data?lat=32.056880&lon=34.768780")
        
        for poly in data.get('polygons', []):
            assert poly['uid'].startswith('POLYGON_')
            
        for line in data.get('white_lines', []):
            assert line['uid'].startswith('WHITE_LINE_')
            
        for circle in data.get('blue_circles', []):
            assert circle['uid'].startswith('BLUE_CIRCLE_')
            
        for circle in data.get('green_circles', []):
            assert circle['uid'].startswith('GREEN_CIRCLE_')
