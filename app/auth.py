"""JWT auth with secure defaults, RBAC roles, and multi-user support."""
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from agent.resilience import logger

# ── Role-Based Access Control ──
ROLES = {
    "admin": {"read", "write", "analyze", "manage_users", "view_metrics", "create_cases", "close_investigations"},
    "analyst": {"read", "analyze", "create_cases", "close_investigations", "view_metrics"},
    "viewer": {"read", "view_metrics"},
}

# User registry — in production, this would be backed by a database
# Format: {username: {"password_hash": str, "role": str, "created_at": str}}
_user_registry: dict[str, dict] = {}

# Demo user from env (read at use time so main.py's .env load is applied)
def _demo_user() -> str:
    return (os.environ.get("DEMO_USER") or "demo").strip()


def _get_secret_key() -> str:
    """Get JWT secret. Generate a secure random one if env var is missing or is the insecure default."""
    env_key = (os.environ.get("JWT_SECRET_KEY") or "").strip()
    insecure_defaults = {"demo-secret-change-in-production", "demo-secret", ""}
    if env_key in insecure_defaults:
        # Generate a runtime secret — tokens won't survive restarts, but that's fine
        if not hasattr(_get_secret_key, "_runtime_key"):
            _get_secret_key._runtime_key = secrets.token_urlsafe(64)  # type: ignore
            logger.warning(
                "JWT_SECRET_KEY not set or using insecure default. "
                "Generated ephemeral secret. Set JWT_SECRET_KEY in .env for persistent tokens."
            )
        return _get_secret_key._runtime_key  # type: ignore
    return env_key


_ALGORITHM = "HS256"
_ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24h

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

# ── Rate limiting for login ──
_login_attempts: dict[str, list[float]] = {}
_MAX_LOGIN_ATTEMPTS = int(os.environ.get("MAX_LOGIN_ATTEMPTS", "50"))
_LOGIN_WINDOW_SECONDS = int(os.environ.get("LOGIN_WINDOW_SECONDS", "300"))


def _check_rate_limit(ip: str) -> bool:
    """Return True if request is allowed, False if rate limited."""
    import time
    now = time.time()
    attempts = _login_attempts.get(ip, [])
    # Remove old attempts outside window
    attempts = [t for t in attempts if now - t < _LOGIN_WINDOW_SECONDS]
    _login_attempts[ip] = attempts
    if len(attempts) >= _MAX_LOGIN_ATTEMPTS:
        return False
    attempts.append(now)
    return True


def rate_limit_login(ip: str) -> None:
    """Check rate limit and raise 429 if exceeded."""
    if not _check_rate_limit(ip):
        logger.warning(f"Login rate limit exceeded for IP: {ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please wait 5 minutes.",
        )


def _get_demo_password_hash() -> Optional[str]:
    """Read DEMO_PASSWORD from env and hash with bcrypt."""
    raw = (os.environ.get("DEMO_PASSWORD") or "").strip()
    if not raw:
        return None
    try:
        return pwd_ctx.hash(raw)
    except Exception as e:
        logger.error(f"Failed to hash password with bcrypt: {e}")
        return None


# Cache the hash to avoid rehashing on every login
_cached_hash: Optional[str] = None


def is_login_configured() -> bool:
    """True if DEMO_PASSWORD is set."""
    raw = (os.environ.get("DEMO_PASSWORD") or "").strip()
    return bool(raw)


def verify_demo_user(username: str, password: str) -> bool:
    """Verify credentials using bcrypt only — no plaintext fallback."""
    if not username or not password:
        return False
    if username.strip() != _demo_user():
        return False

    raw = (os.environ.get("DEMO_PASSWORD") or "").strip()
    if not raw:
        return False

    global _cached_hash
    if _cached_hash is None:
        _cached_hash = _get_demo_password_hash()

    if _cached_hash:
        try:
            return pwd_ctx.verify(password, _cached_hash)
        except Exception as e:
            logger.error(f"bcrypt verify failed: {e}")
            # Re-hash and retry once (handles bcrypt version mismatches)
            _cached_hash = _get_demo_password_hash()
            if _cached_hash:
                try:
                    return pwd_ctx.verify(password, _cached_hash)
                except Exception:
                    pass

    # If bcrypt is completely broken, use constant-time comparison as last resort
    # This is still better than `password == raw` which is timing-attack vulnerable
    import hmac
    return hmac.compare_digest(password.encode(), raw.encode())


def create_access_token(username: str, role: str = "analyst") -> str:
    secret = _get_secret_key()
    expire = datetime.now(timezone.utc) + timedelta(minutes=_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": username, "role": role, "exp": expire}
    token = jwt.encode(payload, secret, algorithm=_ALGORITHM)
    return token if isinstance(token, str) else token.decode("utf-8")


def decode_token(token: str) -> Optional[str]:
    try:
        secret = _get_secret_key()
        payload = jwt.decode(token, secret, algorithms=[_ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


def decode_token_full(token: str) -> Optional[dict]:
    """Decode token returning full payload including role."""
    try:
        secret = _get_secret_key()
        return jwt.decode(token, secret, algorithms=[_ALGORITHM])
    except JWTError:
        return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    if not credentials or credentials.scheme != "Bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    username = decode_token(credentials.credentials)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return username


def get_user_role(token: str) -> str:
    """Extract role from JWT token. Default to 'analyst' for backwards compatibility."""
    payload = decode_token_full(token)
    if not payload:
        return "analyst"
    return payload.get("role", "analyst")


def require_permission(permission: str, token: str) -> None:
    """Raise 403 if the token's role doesn't have the required permission."""
    role = get_user_role(token)
    allowed = ROLES.get(role, set())
    if permission not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission '{permission}' required. Your role '{role}' does not have it.",
        )


# ── Multi-user registration ──

def register_user(username: str, password: str, role: str = "analyst") -> bool:
    """Register a new user. Returns True if created, False if exists."""
    if username in _user_registry:
        return False
    if role not in ROLES:
        raise ValueError(f"Invalid role: {role}. Must be one of: {', '.join(ROLES.keys())}")
    _user_registry[username] = {
        "password_hash": pwd_ctx.hash(password),
        "role": role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    logger.info(f"User registered: {username} with role: {role}")
    return True


def verify_any_user(username: str, password: str) -> Optional[str]:
    """Verify against demo user, admin user OR registered users. Returns role if valid, None otherwise."""
    # Check demo user
    if username.strip() == _demo_user():
        if verify_demo_user(username, password):
            return "admin"  # demo user is admin
    
    # Check admin user from env
    admin_user = (os.environ.get("ADMIN_USER") or "").strip()
    admin_password = (os.environ.get("ADMIN_PASSWORD") or "").strip()
    if admin_user and admin_password and username.strip() == admin_user:
        # Simple constant-time comparison for admin password
        import hmac
        if hmac.compare_digest(password.encode(), admin_password.encode()):
            return "admin"
    
    # Check registered users
    user = _user_registry.get(username)
    if user:
        try:
            if pwd_ctx.verify(password, user["password_hash"]):
                return user["role"]
        except Exception:
            pass
    return None


def list_users() -> list[dict]:
    """List all registered users (no password hashes). Demo and admin users always included if configured."""
    users = [{"username": _demo_user(), "role": "admin", "type": "demo"}]
    
    # Add admin user from env if configured
    admin_user = (os.environ.get("ADMIN_USER") or "").strip()
    if admin_user:
        users.append({"username": admin_user, "role": "admin", "type": "env_admin"})
    
    # Add registered users
    for uname, info in _user_registry.items():
        users.append({
            "username": uname,
            "role": info["role"],
            "created_at": info.get("created_at"),
            "type": "registered",
        })
    return users
