import importlib
import pytest

@pytest.mark.smoke
def test_app_imports():
    """
    Smoke test to ensure that the main application and its modules can be imported without errors.
    """
    importlib.import_module("app.main")
    importlib.import_module("app.rag.retrieve")
    importlib.import_module("app.rag.ingest")
    importlib.import_module("app.routers.chat")
    importlib.import_module("app.routers.health")
    importlib.import_module("app.routers.leaderboard")
    importlib.import_module("app.routers.admin")
