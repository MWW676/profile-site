import os
import re
import time
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from upstash_redis import Redis
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("uvicorn.error")
router = APIRouter()

redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"],
    rest_retries=2,
    rest_retry_interval=2,
)

LEADERBOARD_KEY = "leaderboard"
MAX_SCORE_PER_LEVEL = 100
NAME_PATTERN = re.compile(r"^[A-Za-z0-9 _-]{1,20}$")

CACHE_TTL_SECONDS = 8
_leaderboard_cache: dict | None = None
_leaderboard_cache_time: float = 0.0


def _invalidate_leaderboard_cache():
    global _leaderboard_cache
    _leaderboard_cache = None


class ScoreSubmission(BaseModel):
    name: str
    score: int

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not NAME_PATTERN.match(v):
            raise ValueError("Name must be 1-20 characters: letters, numbers, spaces, - or _")
        return v

    @field_validator("score")
    @classmethod
    def validate_score(cls, v: int) -> int:
        if v < 0 or v > 100_000:
            raise ValueError("Score out of plausible range")
        return v


@router.post("/api/score")
def submit_score(submission: ScoreSubmission):
    try:
        previous = redis.zscore(LEADERBOARD_KEY, submission.name)

        if previous is not None and submission.score - previous > MAX_SCORE_PER_LEVEL:
            logger.warning(
                f"Rejected implausible score jump for '{submission.name}': "
                f"{previous} -> {submission.score}"
            )
            raise HTTPException(status_code=400, detail="Score increase too large for one submission")

        if previous is not None and submission.score <= previous:
            return {"name": submission.name, "score": previous, "updated": False}

        redis.zadd(LEADERBOARD_KEY, {submission.name: submission.score})
        _invalidate_leaderboard_cache()
        return {"name": submission.name, "score": submission.score, "updated": True}

    except HTTPException:
        raise
    except Exception:
        logger.exception("Redis error submitting score")
        raise HTTPException(status_code=503, detail="Leaderboard temporarily unavailable")


@router.get("/api/leaderboard")
def get_leaderboard():
    global _leaderboard_cache, _leaderboard_cache_time
    now = time.time()

    if _leaderboard_cache is not None and (now - _leaderboard_cache_time) < CACHE_TTL_SECONDS:
        return _leaderboard_cache

    try:
        top = redis.zrange(LEADERBOARD_KEY, 0, 9, rev=True, withscores=True)
        result = {"leaderboard": top}
        _leaderboard_cache = result
        _leaderboard_cache_time = now
        return result
    except Exception:
        logger.exception("Redis error fetching leaderboard")
        raise HTTPException(status_code=503, detail="Leaderboard temporarily unavailable")


@router.get("/api/score/{name}")
def get_score(name: str):
    try:
        score = redis.zscore(LEADERBOARD_KEY, name)
        return {"name": name, "score": score}
    except Exception:
        logger.exception("Redis error looking up score")
        raise HTTPException(status_code=503, detail="Leaderboard temporarily unavailable")