import os
import pytest

class TestCORS:
    FRONTEND_ORIGINS = os.environ["CORS_ORIGINS"].split(",")

    @pytest.mark.smoke
    @pytest.mark.parametrize("origin", FRONTEND_ORIGINS)
    def test_cors_allowed_origins(self, client, origin):
        response = client.options(
            "/",
            headers = {
                    "Origin": origin,
                    "Access-Control-Request-Method": "GET",
                    "Access-Control-Request-Headers": "Content-Type"
                }
            )
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == origin

    @pytest.mark.smoke
    def test_cors_disallowed_origin(self, client):
        malicious_origin = "http://malicious-site.com"
        response = client.options(
            "/",
            headers={
                "Origin": malicious_origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Content-Type"
            }
        )
        assert  response.status_code == 400
        assert response.headers.get("access-control-allow-origin") is None
