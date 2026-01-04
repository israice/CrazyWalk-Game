"""
Pytest fixtures for CrazyWalk-Game tests.
"""
import sys
import os
import pytest

# Add project root to path for imports
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)


@pytest.fixture
def mock_env(monkeypatch):
    """Set up common environment variables for testing."""
    monkeypatch.setenv("SERVER_PORT", "8000")
    monkeypatch.setenv("FRONTEND_INDEX_PAGE", "CORE/FRONTEND")
    monkeypatch.setenv("REDIS_HOST", "localhost")
    monkeypatch.setenv("REDIS_PORT", "6379")


@pytest.fixture
def sample_coordinates():
    """Sample coordinates for testing location functions."""
    return {
        "lat": 50.4501,
        "lon": 30.5234,
        "city": "Kyiv"
    }


@pytest.fixture
def sample_game_state():
    """Sample game state for testing state handlers."""
    return {
        "polygons": [],
        "white_lines": [],
        "blue_circles": [],
        "green_circles": [],
        "collected_circles": [],
        "expanded_circles": [],
        "user_position": {"lat": 50.4501, "lon": 30.5234}
    }


@pytest.fixture
def project_root():
    """Return path to project root."""
    return PROJECT_ROOT
