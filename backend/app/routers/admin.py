import os
import hmac
import hashlib
import logging
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from dotenv import load_dotenv
from app.routers.leaderboard import redis, LEADERBOARD_KEY, _invalidate_leaderboard_cache

load_dotenv()
logger = logging.getLogger("uvicorn.error")
router = APIRouter()


def make_token(password: str) -> str:
    return hmac.new(password.encode(), b"admin-session", hashlib.sha256).hexdigest()


class LoginRequest(BaseModel):
    password: str


@router.post("/api/admin/login")
def admin_login(payload: LoginRequest):
    correct_password = os.environ["ADMIN_PASSWORD"]
    if not hmac.compare_digest(payload.password, correct_password):
        raise HTTPException(status_code=401, detail="Incorrect password")
    return {"token": make_token(correct_password)}


def require_admin(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing admin token")
    token = authorization.removeprefix("Bearer ").strip()
    expected = make_token(os.environ["ADMIN_PASSWORD"])
    if not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Invalid admin token")


@router.get("/api/admin/leaderboard")
def admin_get_leaderboard(_: None = Depends(require_admin)):
    try:
        all_entries = redis.zrange(LEADERBOARD_KEY, 0, -1, rev=True, withscores=True)
        return {"leaderboard": all_entries}
    except Exception:
        logger.exception("Redis error fetching admin leaderboard")
        raise HTTPException(status_code=503, detail="Leaderboard temporarily unavailable")


@router.delete("/api/admin/score/{name}")
def admin_delete_score(name: str, _: None = Depends(require_admin)):
    try:
        redis.zrem(LEADERBOARD_KEY, name)
        _invalidate_leaderboard_cache()
        return {"deleted": name}
    except Exception:
        logger.exception("Redis error deleting score")
        raise HTTPException(status_code=503, detail="Leaderboard temporarily unavailable")


@router.delete("/api/admin/leaderboard")
def admin_clear_leaderboard(_: None = Depends(require_admin)):
    try:
        redis.delete(LEADERBOARD_KEY)
        _invalidate_leaderboard_cache()
        return {"cleared": True}
    except Exception:
        logger.exception("Redis error clearing leaderboard")
        raise HTTPException(status_code=503, detail="Leaderboard temporarily unavailable")
