import pytest

class TestStatus:
    @pytest.mark.smoke
    def test_health_status(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    @pytest.mark.smoke
    def test_root_status(self, client):
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == {"message": "backend is alive"}
