# date: 2026-07-10
# dev: myf
"""健康检查与路由注册测试。"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    """TestClient 不触发 lifespan，不连真实数据库。"""
    return TestClient(app)


def test_health(client):
    """健康检查应返回 200 + ok。"""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"


def test_paper_analyze_requires_token(client):
    """未带 X-Internal-Token 应返回 422（Header 缺失）。"""
    resp = client.post("/paper/analyze", json={"paperId": 1, "pdfUrl": "s3://x"})
    assert resp.status_code == 422


def test_paper_analyze_wrong_token(client):
    """错误的 X-Internal-Token 应返回 401。"""
    resp = client.post(
        "/paper/analyze",
        json={"paperId": 1, "pdfUrl": "s3://x"},
        headers={"X-Internal-Token": "wrong"},
    )
    assert resp.status_code == 401


def test_chat_stream_requires_token(client):
    """Chat 端点未带 token 应 422。"""
    resp = client.post("/rag/chat/stream", json={"paperId": 1, "question": "test"})
    assert resp.status_code == 422


def test_review_generate_requires_token(client):
    """Review 端点未带 token 应 422。"""
    resp = client.post(
        "/review/generate",
        json={"paperIds": [1], "topic": "test"},
    )
    assert resp.status_code == 422


def test_writing_rewrite_requires_token(client):
    """Writing 端点未带 token 应 422。"""
    resp = client.post(
        "/writing/rewrite",
        json={"text": "hello", "action": "polish"},
    )
    assert resp.status_code == 422


def test_writing_rewrite_wrong_token(client):
    """错误的 X-Internal-Token 应返回 401。"""
    resp = client.post(
        "/writing/rewrite",
        json={"text": "hello", "action": "polish"},
        headers={"X-Internal-Token": "wrong"},
    )
    assert resp.status_code == 401
