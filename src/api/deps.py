from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from src.db.models import User
from src.db.session import get_db
from src.services.auth import decode_token


async def get_current_user(
    authorization: str | None = Header(default=None),
    medguard_access: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
    elif medguard_access:
        token = medguard_access
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Thieu Bearer token"
        )
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token khong hop le hoac het han",
        )
    user = db.get(User, payload.get("user_id"))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Nguoi dung khong ton tai"
        )
    if getattr(user, "account_status", "active") != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tai khoan chua duoc kich hoat")
    return user


def require_role(role: str):
    """Dependency factory: chi cho phep user dung vai_tro (patient | pharmacist)."""

    async def _dep(current_user: User = Depends(get_current_user)) -> User:
        if current_user.vai_tro != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Yeu cau vai tro '{role}'",
            )
        return current_user

    return _dep
