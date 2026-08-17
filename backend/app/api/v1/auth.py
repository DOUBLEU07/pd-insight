from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import REVIEWER_ROLE_OPTIONS
from app.core.security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.entities import User
from app.services.case_service import log_usage

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    role: str = "researcher"


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str


@router.post("/signup", response_model=AuthResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    existing = db.scalar(
        select(User).where(User.username.ilike(payload.username))
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This username already exists. Try signing in instead.",
        )

    role = payload.role if payload.role in REVIEWER_ROLE_OPTIONS else "researcher"
    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=role,
    )
    db.add(user)
    db.flush()
    log_usage(db, user.username, "signup", role)
    db.commit()

    return AuthResponse(
        access_token=create_access_token(user.username, user.role),
        username=user.username,
        role=user.role,
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = db.scalar(select(User).where(User.username.ilike(payload.username)))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                'Incorrect username or password '
                '(if you don\'t have an account yet, click "Sign Up").'
            ),
        )

    log_usage(db, user.username, "login")
    db.commit()

    return AuthResponse(
        access_token=create_access_token(user.username, user.role),
        username=user.username,
        role=user.role,
    )


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> dict[str, str]:
    return {"username": user.username, "role": user.role}


@router.post("/logout")
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, bool]:
    log_usage(db, user.username, "logout")
    db.commit()
    return {"ok": True}


@router.get("/roles")
def roles() -> dict[str, list[str]]:
    return {"roles": REVIEWER_ROLE_OPTIONS}
