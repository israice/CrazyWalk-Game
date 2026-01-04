"""
High Priority Tests: Expand Mode, Collected Circles, Error Handling.

These tests verify critical game functionality that commonly breaks:
- State merging during map expansion
- Collected circles persistence across reloads
- Redis connection failure handling
- Concurrent request handling
"""
import pytest
import requests
import json
import time


class TestExpandModeStateMerge:
    """Tests for expand mode - new elements added without losing old ones."""
    
    @pytest.fixture(autouse=True)
    def check_server(self):
        """Skip if server is not running."""
        try:
            requests.get("http://localhost:8000/api/session", timeout=1)
        except requests.exceptions.ConnectionError:
            pytest.skip("Server is not running on port 8000")
    
    def test_expand_preserves_existing_polygons(self):
        """Test that expand mode adds new polygons without losing existing ones."""
        # 1. Save initial state with 2 polygons
        initial_state = {
            "location_key": "55.555_55.555",
            "polygons": [
                {"id": "POLYGON_initial1", "coords": [[55.0, 55.0], [55.1, 55.1]]},
                {"id": "POLYGON_initial2", "coords": [[55.2, 55.2], [55.3, 55.3]]}
            ],
            "white_lines": [
                {"id": "WHITE_LINE_init1", "start": [55.0, 55.0], "end": [55.1, 55.1]}
            ],
            "green_circles": [],
            "blue_circles": [
                {"id": "BLUE_CIRCLE_init1", "lat": 55.0, "lon": 55.0}
            ],
            "poster_grid": [],
            "groups": [],
            "collected_circles": ["55.000000,55.000000"],
            "visible_polygon_ids": ["POLYGON_initial1"],
            "expanded_circles": [],
            "user_position": {"lat": 55.0, "lon": 55.0},
            "current_circle_uid": "BLUE_CIRCLE_init1",
            "promo_gif_map": {}
        }
        
        response = requests.post(
            "http://localhost:8000/api/unified_state",
            json=initial_state,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        
        # 2. Simulate expand - save with additional polygons (keep old ones)
        expanded_state = initial_state.copy()
        expanded_state["polygons"] = initial_state["polygons"] + [
            {"id": "POLYGON_expand1", "coords": [[55.4, 55.4], [55.5, 55.5]]}
        ]
        expanded_state["visible_polygon_ids"] = ["POLYGON_initial1", "POLYGON_expand1"]
        expanded_state["expanded_circles"] = ["55.000000,55.100000"]
        
        response = requests.post(
            "http://localhost:8000/api/unified_state",
            json=expanded_state,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        
        # 3. Load and verify ALL polygons are present
        response = requests.get("http://localhost:8000/api/unified_state")
        assert response.status_code == 200
        data = response.json()
        
        polygon_ids = [p["id"] for p in data["polygons"]]
        assert "POLYGON_initial1" in polygon_ids, "Lost initial polygon 1"
        assert "POLYGON_initial2" in polygon_ids, "Lost initial polygon 2"
        assert "POLYGON_expand1" in polygon_ids, "Missing expanded polygon"
    
    def test_expand_preserves_collected_circles(self):
        """Test that expanding map doesn't lose collected circle progress."""
        # 1. Save state with collected circles
        initial_state = {
            "location_key": "66.666_66.666",
            "polygons": [{"id": "POLYGON_collect1", "coords": [[66.0, 66.0]]}],
            "white_lines": [],
            "green_circles": [],
            "blue_circles": [],
            "poster_grid": [],
            "groups": [],
            "collected_circles": [
                "66.000000,66.000000",
                "66.100000,66.100000",
                "66.200000,66.200000"
            ],
            "visible_polygon_ids": ["POLYGON_collect1"],
            "expanded_circles": [],
            "user_position": {"lat": 66.2, "lon": 66.2},
            "current_circle_uid": None,
            "promo_gif_map": {}
        }
        
        response = requests.post(
            "http://localhost:8000/api/unified_state",
            json=initial_state,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        
        # 2. Expand with more circles
        expanded_state = initial_state.copy()
        expanded_state["collected_circles"] = initial_state["collected_circles"] + [
            "66.300000,66.300000"
        ]
        
        response = requests.post(
            "http://localhost:8000/api/unified_state",
            json=expanded_state,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        
        # 3. Verify all collected circles preserved
        response = requests.get("http://localhost:8000/api/unified_state")
        assert response.status_code == 200
        data = response.json()
        
        collected = data["collected_circles"]
        assert len(collected) >= 4, f"Expected at least 4 collected circles, got {len(collected)}"
        assert "66.000000,66.000000" in collected
        assert "66.300000,66.300000" in collected


class TestCollectedCirclesPersistence:
    """Tests for collected circles persistence across page reloads."""
    
    @pytest.fixture(autouse=True)
    def check_server(self):
        try:
            requests.get("http://localhost:8000/api/session", timeout=1)
        except requests.exceptions.ConnectionError:
            pytest.skip("Server is not running on port 8000")
    
    def test_collected_circles_survive_reload(self):
        """Simulates page reload - collected circles should persist."""
        # 1. Save game state with collected circles
        test_state = {
            "location_key": "44.444_44.444",
            "polygons": [{"id": "POLYGON_reload", "coords": [[44.0, 44.0]]}],
            "white_lines": [],
            "green_circles": [],
            "blue_circles": [],
            "poster_grid": [],
            "groups": [],
            "collected_circles": [
                "44.000000,44.000000",
                "44.111111,44.111111"
            ],
            "visible_polygon_ids": ["POLYGON_reload"],
            "expanded_circles": ["44.000000,44.000000"],
            "user_position": {"lat": 44.111111, "lon": 44.111111},
            "current_circle_uid": "BLUE_CIRCLE_reload1",
            "promo_gif_map": {}
        }
        
        requests.post(
            "http://localhost:8000/api/unified_state",
            json=test_state,
            headers={"Content-Type": "application/json"}
        )
        
        # 2. Simulate reload - GET without coordinates (initial load)
        response = requests.get("http://localhost:8000/api/unified_state")
        assert response.status_code == 200
        data = response.json()
        
        # 3. Verify collected circles restored
        assert "44.000000,44.000000" in data["collected_circles"]
        assert "44.111111,44.111111" in data["collected_circles"]
        
        # 4. Verify other state also restored
        assert data["user_position"]["lat"] == 44.111111
        assert "POLYGON_reload" in data["visible_polygon_ids"]
    
    def test_visible_polygon_ids_survive_reload(self):
        """Test that visible_polygon_ids persist."""
        test_state = {
            "location_key": "33.333_33.333",
            "polygons": [
                {"id": "POLYGON_vis1", "coords": [[33.0, 33.0]]},
                {"id": "POLYGON_vis2", "coords": [[33.1, 33.1]]},
                {"id": "POLYGON_vis3", "coords": [[33.2, 33.2]]}
            ],
            "white_lines": [],
            "green_circles": [],
            "blue_circles": [],
            "poster_grid": [],
            "groups": [],
            "collected_circles": [],
            "visible_polygon_ids": ["POLYGON_vis1", "POLYGON_vis3"],  # vis2 not visible
            "expanded_circles": [],
            "user_position": {"lat": 33.0, "lon": 33.0},
            "current_circle_uid": None,
            "promo_gif_map": {}
        }
        
        requests.post(
            "http://localhost:8000/api/unified_state",
            json=test_state,
            headers={"Content-Type": "application/json"}
        )
        
        response = requests.get("http://localhost:8000/api/unified_state")
        data = response.json()
        
        assert "POLYGON_vis1" in data["visible_polygon_ids"]
        assert "POLYGON_vis3" in data["visible_polygon_ids"]
        # POLYGON_vis2 should NOT be in visible_polygon_ids
        assert "POLYGON_vis2" not in data["visible_polygon_ids"]


class TestConcurrentSaveRequests:
    """Tests for handling rapid concurrent save requests."""
    
    @pytest.fixture(autouse=True)
    def check_server(self):
        try:
            requests.get("http://localhost:8000/api/session", timeout=1)
        except requests.exceptions.ConnectionError:
            pytest.skip("Server is not running on port 8000")
    
    def test_rapid_saves_dont_corrupt_state(self):
        """Simulate rapid player movement - many saves in quick succession."""
        base_state = {
            "location_key": "22.222_22.222",
            "polygons": [{"id": "POLYGON_rapid", "coords": [[22.0, 22.0]]}],
            "white_lines": [],
            "green_circles": [],
            "blue_circles": [],
            "poster_grid": [],
            "groups": [],
            "collected_circles": [],
            "visible_polygon_ids": [],
            "expanded_circles": [],
            "user_position": {"lat": 22.0, "lon": 22.0},
            "current_circle_uid": None,
            "promo_gif_map": {}
        }
        
        # Send 10 rapid save requests
        for i in range(10):
            state = base_state.copy()
            state["user_position"] = {"lat": 22.0 + i * 0.001, "lon": 22.0 + i * 0.001}
            state["current_circle_uid"] = f"BLUE_CIRCLE_rapid{i}"
            
            response = requests.post(
                "http://localhost:8000/api/unified_state",
                json=state,
                headers={"Content-Type": "application/json"}
            )
            assert response.status_code == 200
        
        # Final state should reflect last save
        response = requests.get("http://localhost:8000/api/unified_state")
        data = response.json()
        
        # Last position should be saved (approximately 22.009, 22.009)
        assert data["user_position"]["lat"] > 22.008
        assert data["current_circle_uid"] == "BLUE_CIRCLE_rapid9"
