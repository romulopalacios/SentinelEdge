"""
Query API Service — JWT Auth dependency
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from src.config import settings

security = HTTPBearer()


class AuthUser:
    def __init__(self, user_id: str, tenant_id: str, role: str, email: str) -> None:
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.role = role
        self.email = email


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthUser:
    """FastAPI dependency: decode & validate JWT, return AuthUser."""
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"verify_aud": False},
        )
        return AuthUser(
            user_id=payload["sub"],
            tenant_id=payload["tenant_id"],
            role=payload.get("role", "viewer"),
            email=payload.get("email", ""),
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_role(*roles: str):
    """Dependency factory for RBAC."""
    def _check(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role}' is not authorized",
            )
        return user
    return _check
