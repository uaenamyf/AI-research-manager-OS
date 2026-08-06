# date: 2026-07-23
# dev: myf
"""健康检查 API 测试."""
import pytest
from fastapi.testclient import TestClient

from app.main import app


class TestHealthAPI:
    """健康检查接口测试."""

    def test_health_endpoint(self):
        """测试 /health 端点返回正常."""
        client = TestClient(app)
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data

    def test_health_returns_correct_version(self):
        """测试健康检查返回正确版本号."""
        client = TestClient(app)
        response = client.get("/health")

        data = response.json()
        assert data["version"] == "0.1.0"
