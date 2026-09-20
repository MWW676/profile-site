import os
import pytest
from app.main import app
from fastapi.testclient import TestClient

@pytest.fixture
def client():
    return TestClient(app)

def pytest_configure(config):
    """
    Runs before any modules are imported.
    Fills in missing environment variables with dummy values.
    """
    dummy_env_vars = {
        "GEMINI_API_KEY": "1234567890abcdef",
        "LANGFUSE_SECRET_KEY": "1234567890abcdef",
        "LANGFUSE_PUBLIC_KEY": "1234567890abcdef",
        "LANGFUSE_BASE_URL": "https://cloud.langfuse.com",
        "CORS_ORIGINS": "http://localhost:3000",
        "UPSTASH_REDIS_REST_URL": "https://abc.upstash.io",
        "UPSTASH_REDIS_REST_TOKEN": "1234567890abcdef",
        "ADMIN_PASSWORD": "1234567890abcdef"
    }

    for key, value in dummy_env_vars.items():
        if key not in os.environ:
            os.environ[key] = value