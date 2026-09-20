import pytest
from fastapi.routing import APIRoute
from app.main import app

@pytest.mark.smoke
def test_routes_registration():
    """
    Smoke test to ensure that all expected routes are registered in the FastAPI application.
    """
    expected_routes = {
        ("/api/admin/login", "POST"),
        ("/api/admin/leaderboard", "GET"),
        ("/api/admin/leaderboard", "DELETE"),
        ("/api/admin/score/{name}", "DELETE"),
        ("/api/score", "POST"),
        ("/api/leaderboard", "GET"),
        ("/api/score/{name}", "GET"),
        ("/api/chat", "POST"),
        ("/health", "GET"),
        ("/", "GET")
    }

    actual_routes = set()
    for route in app.routes:
        if isinstance(route, APIRoute):
            for method in route.methods:
                actual_routes.add((route.path, method))

    missing_routes = expected_routes - actual_routes
    added_routes = actual_routes - expected_routes
    assert not missing_routes, f"Missing routes: {missing_routes}"
    assert not added_routes, f"Unexpected routes: {added_routes}"
