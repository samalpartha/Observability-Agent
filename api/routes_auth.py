"""Auth routes: login, logout, register, list users. Multi-user with RBAC."""
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth import (
    create_access_token,
    get_current_user,
    is_login_configured,
    list_users,
    rate_limit_login,
    register_user,
    require_permission,
    verify_any_user,
    verify_demo_user,
)
from api.schemas import LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request) -> LoginResponse:
    # Rate limit by client IP
    client_ip = request.client.host if request.client else "unknown"
    rate_limit_login(client_ip)

    if not is_login_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Login not configured. Set DEMO_USER and DEMO_PASSWORD in the backend .env file.",
        )

    # Validate input
    username = (body.username or "").strip()
    password = body.password or ""
    if not username:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username is required",
        )
    if len(username) > 100 or len(password) > 200:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Input too long",
        )

    # Multi-user: try demo user first, then registered users
    role = verify_any_user(username, password)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = create_access_token(username, role=role)
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        username=username,
    )


@router.post("/register")
def register(body: dict, request: Request, username: str = Depends(get_current_user)) -> dict:
    """Register a new user. Requires admin role."""
    from fastapi.security import HTTPAuthorizationCredentials
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    require_permission("manage_users", token)

    new_username = (body.get("username") or "").strip()
    new_password = body.get("password", "")
    new_role = body.get("role", "analyst")

    if not new_username or not new_password:
        raise HTTPException(status_code=422, detail="Username and password are required")
    if len(new_username) < 3 or len(new_password) < 6:
        raise HTTPException(status_code=422, detail="Username must be 3+ chars, password 6+ chars")

    created = register_user(new_username, new_password, new_role)
    if not created:
        raise HTTPException(status_code=409, detail="Username already exists")
    return {"ok": True, "username": new_username, "role": new_role}


@router.get("/users")
def get_users(username: str = Depends(get_current_user), request: Request = None) -> dict:
    """List all users. Requires admin role."""
    token = request.headers.get("Authorization", "").replace("Bearer ", "") if request else ""
    require_permission("manage_users", token)
    return {"users": list_users()}


@router.get("/me")
def get_me(username: str = Depends(get_current_user), request: Request = None) -> dict:
    """Return current user info including role."""
    from app.auth import get_user_role, ROLES
    token = request.headers.get("Authorization", "").replace("Bearer ", "") if request else ""
    role = get_user_role(token)
    return {"username": username, "role": role, "permissions": sorted(ROLES.get(role, set()))}


@router.post("/logout")
def logout() -> dict:
    """Client discards token; no server-side session."""
    return {"ok": True, "message": "Logged out"}
