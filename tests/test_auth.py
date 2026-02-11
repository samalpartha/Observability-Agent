"""Tests for authentication: JWT, rate limiting, password verification."""
import os
import pytest

# Set test credentials before importing auth
os.environ["DEMO_USER"] = "testuser"
os.environ["DEMO_PASSWORD"] = "testpass123"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-testing-only"

from app.auth import (
    create_access_token,
    decode_token,
    is_login_configured,
    rate_limit_login,
    verify_demo_user,
    _check_rate_limit,
    _login_attempts,
)
from fastapi import HTTPException


class TestJWT:
    def test_create_and_decode_token(self):
        token = create_access_token("testuser")
        assert isinstance(token, str)
        assert len(token) > 20

        username = decode_token(token)
        assert username == "testuser"

    def test_decode_invalid_token(self):
        username = decode_token("invalid.token.here")
        assert username is None

    def test_decode_empty_token(self):
        username = decode_token("")
        assert username is None


class TestPasswordVerification:
    def test_correct_credentials(self):
        assert verify_demo_user("testuser", "testpass123")

    def test_wrong_password(self):
        assert not verify_demo_user("testuser", "wrongpass")

    def test_wrong_username(self):
        assert not verify_demo_user("wronguser", "testpass123")

    def test_empty_credentials(self):
        assert not verify_demo_user("", "")
        assert not verify_demo_user("testuser", "")
        assert not verify_demo_user("", "testpass123")

    def test_login_configured(self):
        assert is_login_configured()


class TestRateLimiting:
    def setup_method(self):
        # Clear rate limit state
        _login_attempts.clear()

    def test_allows_under_limit(self):
        assert _check_rate_limit("1.2.3.4")

    def test_blocks_after_limit(self):
        ip = "10.0.0.1"
        from app.auth import _MAX_LOGIN_ATTEMPTS
        for _ in range(_MAX_LOGIN_ATTEMPTS):
            _check_rate_limit(ip)
        assert not _check_rate_limit(ip)

    def test_different_ips_independent(self):
        from app.auth import _MAX_LOGIN_ATTEMPTS
        for _ in range(_MAX_LOGIN_ATTEMPTS):
            _check_rate_limit("10.0.0.2")
        # Different IP should still be allowed
        assert _check_rate_limit("10.0.0.3")

    def test_raises_http_429(self):
        from app.auth import _MAX_LOGIN_ATTEMPTS
        ip = "10.0.0.4"
        for _ in range(_MAX_LOGIN_ATTEMPTS):
            _check_rate_limit(ip)
        with pytest.raises(HTTPException) as exc_info:
            rate_limit_login(ip)
        assert exc_info.value.status_code == 429
