import pytest
import json
import unittest.mock
from urllib.request import Request
from CORE.BACKEND.handlers import game_handlers

class TestBackendIsCompleted:
    """Tests for the is_completed logic in game_handlers."""
    
    @pytest.fixture
    def mock_redis(self):
        with unittest.mock.patch('CORE.BACKEND.redis_tools.get_redis_client') as mock:
            client = unittest.mock.MagicMock()
            mock.return_value = client
            yield client
            
    @pytest.fixture
    def mock_generator(self):
         with unittest.mock.patch('CORE.BACKEND.LocationPolygonsGenerator.LocationPolygonsGenerator') as mock,\
              unittest.mock.patch('importlib.reload'): # PREVENT RELOAD from destroying the mock
            instance = mock.return_value
            yield instance
            
    def test_is_completed_true(self, mock_redis, mock_generator):
        """Test that polygon is marked completed if all points are collected."""
        
        # 1. Setup Mock Generator Data
        generated_data = {
            "polygons": [
                {
                    "uid": "P1",
                    "coords": [[10.0, 10.0], [10.0, 10.1], [10.1, 10.1]],
                    "total_points": 3
                }
            ],
            "white_lines": [], "blue_circles": [], "green_circles": []
        }
        mock_generator.generate_map.return_value = generated_data
        
        # 2. Setup Mock Redis State (User has collected all 3 points)
        # Format: "lat.6f,lon.6f"
        collected = [
            "10.000000,10.000000",
            "10.000000,10.100000",
            "10.100000,10.100000"
        ]
        state = {"collected_circles": collected}
        mock_redis.get.return_value = json.dumps(state)
        
        # 3. Call Handler via Mock Request
        class MockHandler:
            def __init__(self):
                self.path = "/api/game_data?lat=10.0&lon=10.0"
                self.wfile = unittest.mock.MagicMock()
                self.headers = {}
            def send_response(self, code): pass
            def send_header(self, k, v): pass
            def end_headers(self): pass
            def send_error(self, code, msg): raise Exception(f"Error {code}: {msg}")
            
        handler = MockHandler()
        
        # EXECUTE
        game_handlers.handle_game_data(handler)
        
        # 4. Verify Response
        # Get the JSON written to wfile
        args, _ = handler.wfile.write.call_args
        response_body = args[0].decode()
        data = json.loads(response_body)
        
        assert data['polygons'][0]['is_completed'] is True

    def test_is_completed_false(self, mock_redis, mock_generator):
        """Test that polygon is not completed if points are missing."""
        
        # 1. Setup Data
        generated_data = {
            "polygons": [
                {
                    "uid": "P2",
                    "coords": [[20.0, 20.0], [20.1, 20.1]],
                    "total_points": 2
                }
            ],
            "white_lines": [], "blue_circles": [], "green_circles": []
        }
        mock_generator.generate_map.return_value = generated_data
        
        # 2. Setup Redis (User has collected NOTHING)
        mock_redis.get.return_value = None 
        
        handler = unittest.mock.MagicMock()
        handler.path = "/api/game_data?lat=20.0&lon=20.0"
        
        # EXECUTE
        game_handlers.handle_game_data(handler)
        
        # 3. Verify
        args, _ = handler.wfile.write.call_args
        data = json.loads(args[0].decode())
        
        assert data['polygons'][0]['is_completed'] is False

    def test_white_line_visibility(self, mock_redis, mock_generator):
        """Test white line visibility based on neighbor completion."""
        
        # 1. Setup Data
        # P1 = Completed, P2 = Incomplete
        generated_data = {
            "polygons": [
                { "uid": "P1", "coords": [[10.0, 10.0]], "total_points": 1 },
                { "uid": "P2", "coords": [[20.0, 20.0]], "total_points": 1 }
            ],
            "white_lines": [
                { "id": "L1", "connected_polygon_ids": ["P1", "P2"] }, # Visible (P2 incomplete)
                { "id": "L2", "connected_polygon_ids": ["P1"] },       # Hidden (P1 complete)
                { "id": "L3", "connected_polygon_ids": ["P2"] },       # Visible (P2 incomplete)
                { "id": "L4", "connected_polygon_ids": [] }            # Visible (orphan)
            ],
            "blue_circles": [], "green_circles": []
        }
        mock_generator.generate_map.return_value = generated_data
        
        # 2. Redis State: Only P1 is collected
        collected = ["10.000000,10.000000"]
        mock_redis.get.return_value = json.dumps({"collected_circles": collected})
        
        handler = unittest.mock.MagicMock()
        handler.path = "/api/game_data?lat=10.0&lon=10.0"
        
        # EXECUTE
        game_handlers.handle_game_data(handler)
        
        # 3. Verify
        args, _ = handler.wfile.write.call_args
        data = json.loads(args[0].decode())
        
        # Check Polygons first
        p1 = next(p for p in data['polygons'] if p['uid'] == 'P1')
        p2 = next(p for p in data['polygons'] if p['uid'] == 'P2')
        assert p1['is_completed'] is True
        assert p2['is_completed'] is False
        
        # Check Lines
        l1 = next(l for l in data['white_lines'] if l['id'] == 'L1')
        l2 = next(l for l in data['white_lines'] if l['id'] == 'L2')
        l3 = next(l for l in data['white_lines'] if l['id'] == 'L3')
        l4 = next(l for l in data['white_lines'] if l['id'] == 'L4')
        
        assert l1['is_visible'] is True, "Line connected to incomplete poly should be visible"
        assert l2['is_visible'] is False, "Line connected to ONLY completed polys should be hidden"
        assert l3['is_visible'] is True
        assert l4['is_visible'] is True
