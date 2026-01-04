"""
Tests for unified_state_handler.

These tests verify the unified state endpoint functionality including:
- GET: Loading saved state from Redis
- POST: Saving state to Redis
- Persistence of collected_circles, user_position, current_circle_uid
"""
import pytest
import json


class TestUnifiedStateHandler:
    """Tests for unified state handler functions."""
    
    @pytest.fixture
    def mock_game_state(self):
        """Sample game state for testing."""
        return {
            "polygons": [
                {"id": "POLYGON_test1", "coords": [[50.0, 30.0], [50.1, 30.1]]}
            ],
            "white_lines": [
                {"id": "WHITE_LINE_test1", "start": [50.0, 30.0], "end": [50.1, 30.1]}
            ],
            "green_circles": [],
            "blue_circles": [
                {"uid": "BLUE_CIRCLE_test1", "lat": 50.0, "lon": 30.0}
            ],
            "poster_grid": [],
            "groups": [],
            "last_location_key": "50.000_30.000"
        }
    
    @pytest.fixture
    def mock_location_state(self):
        """Sample location state for testing."""
        return {
            "collected_circles": ["50.000000,30.000000"],
            "visible_polygon_ids": ["POLYGON_test1"],
            "expanded_circles": [],
            "user_position": {"lat": 50.0, "lon": 30.0},
            "current_circle_uid": "BLUE_CIRCLE_test1"
        }
    
    def test_import_handler(self):
        """Test that unified_state_handler can be imported."""
        from CORE.BACKEND.handlers.unified_state_handler import handle_unified_state
        assert handle_unified_state is not None
    
    def test_import_get_handler(self):
        """Test that private GET handler can be imported."""
        from CORE.BACKEND.handlers.unified_state_handler import _handle_get_unified_state
        assert _handle_get_unified_state is not None
    
    def test_import_post_handler(self):
        """Test that private POST handler can be imported."""
        from CORE.BACKEND.handlers.unified_state_handler import _handle_post_unified_state
        assert _handle_post_unified_state is not None


class TestUnifiedStateIntegration:
    """Integration tests requiring running server."""
    
    @pytest.fixture(autouse=True)
    def check_server(self):
        """Skip if server is not running."""
        import requests
        try:
            requests.get("http://localhost:8000/api/session", timeout=1)
        except requests.exceptions.ConnectionError:
            pytest.skip("Server is not running on port 8000. Start with: python server.py")
    
    def test_unified_state_get_empty(self):
        """Test GET when no state saved returns empty but valid response."""
        import requests
        # Note: This test may return data if server has saved state
        response = requests.get("http://localhost:8000/api/unified_state")
        assert response.status_code == 200
        data = response.json()
        assert "ready_to_render" in data
        assert "polygons" in data
        assert "collected_circles" in data
    
    def test_unified_state_post_and_get(self):
        """Test full save/load cycle."""
        import requests
        
        # 1. Save state
        test_state = {
            "location_key": "99.999_99.999",
            "polygons": [{"id": "POLYGON_testX", "coords": [[99.0, 99.0]]}],
            "white_lines": [],
            "green_circles": [],
            "blue_circles": [],
            "poster_grid": [],
            "groups": [],
            "collected_circles": ["99.000000,99.000000"],
            "visible_polygon_ids": ["POLYGON_testX"],
            "expanded_circles": [],
            "user_position": {"lat": 99.0, "lon": 99.0},
            "current_circle_uid": "BLUE_CIRCLE_testX",
            "promo_gif_map": {}
        }
        
        response = requests.post(
            "http://localhost:8000/api/unified_state",
            json=test_state,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "ok"
        assert result["saved_polygons"] == 1
        
        # 2. Load state (without coords - should use last_location_key)
        response = requests.get("http://localhost:8000/api/unified_state")
        assert response.status_code == 200
        data = response.json()
        
        # Verify geometry restored
        assert data["has_saved_state"] == True
        assert len(data["polygons"]) >= 1
        
        # Verify progress restored (uses last_location_key)
        assert data["location_key"] == "99.999_99.999"
        assert "99.000000,99.000000" in data["collected_circles"]
        assert data["current_circle_uid"] == "BLUE_CIRCLE_testX"
    
    def test_unified_state_with_coords(self):
        """Test GET with explicit coordinates."""
        import requests
        
        # First save with specific location
        test_state = {
            "location_key": "88.888_88.888",
            "polygons": [{"id": "POLYGON_coordtest", "coords": [[88.0, 88.0]]}],
            "white_lines": [],
            "green_circles": [],
            "blue_circles": [],
            "poster_grid": [],
            "groups": [],
            "collected_circles": ["88.000000,88.000000"],
            "visible_polygon_ids": [],
            "expanded_circles": [],
            "user_position": {"lat": 88.0, "lon": 88.0},
            "current_circle_uid": None,
            "promo_gif_map": {}
        }
        
        requests.post(
            "http://localhost:8000/api/unified_state",
            json=test_state,
            headers={"Content-Type": "application/json"}
        )
        
        # Get with explicit coords
        response = requests.get("http://localhost:8000/api/unified_state?lat=88.888&lon=88.888")
        assert response.status_code == 200
        data = response.json()
        assert data["location_key"] == "88.888_88.888"
    
    def test_green_circle_position_persistence(self):
        """Test that GREEN_CIRCLE UID is saved and restored correctly."""
        import requests
        
        # Save state with GREEN_CIRCLE_xxx as current circle
        test_state = {
            "location_key": "77.777_77.777",
            "polygons": [{"id": "POLYGON_greentest", "coords": [[77.0, 77.0]]}],
            "white_lines": [{"id": "WHITE_LINE_green1", "start": [77.0, 77.0], "end": [77.1, 77.1]}],
            "green_circles": [{"id": "GREEN_CIRCLE_abc123", "lat": 77.05, "lon": 77.05, "line_id": "WHITE_LINE_green1"}],
            "blue_circles": [{"id": "BLUE_CIRCLE_def456", "lat": 77.0, "lon": 77.0}],
            "poster_grid": [],
            "groups": [],
            "collected_circles": ["77.000000,77.000000"],
            "visible_polygon_ids": ["POLYGON_greentest"],
            "expanded_circles": [],
            "user_position": {"lat": 77.05, "lon": 77.05},
            "current_circle_uid": "GREEN_CIRCLE_abc123",  # Player is on GREEN circle
            "promo_gif_map": {}
        }
        
        response = requests.post(
            "http://localhost:8000/api/unified_state",
            json=test_state,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        
        # Load state and verify GREEN_CIRCLE_xxx is restored
        response = requests.get("http://localhost:8000/api/unified_state")
        assert response.status_code == 200
        data = response.json()
        
        # Critical assertion: green circle UID must be preserved
        assert data["current_circle_uid"] == "GREEN_CIRCLE_abc123", \
            f"Expected GREEN_CIRCLE_abc123, got {data['current_circle_uid']}"
        
        # Verify user position is also correct
        assert data["user_position"]["lat"] == 77.05
        assert data["user_position"]["lon"] == 77.05
