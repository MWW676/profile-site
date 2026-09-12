import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from google.genai.errors import ClientError, ServerError
from app.rag.chat import answer_question

logger = logging.getLogger("uvicorn.error")
router = APIRouter()


class ChatRequest(BaseModel):
    message: str


@router.post("/api/chat")
def chat(request: ChatRequest):
    try:
        answer = answer_question(request.message)
    except ClientError as e:
        if "RESOURCE_EXHAUSTED" in str(e):
            logger.warning("Gemini rate limit hit for a chat request")
            raise HTTPException(
                status_code=503,
                detail="The assistant is a bit busy right now — please try again in a minute.",
            )
        logger.exception("Gemini API error answering a chat question")
        raise HTTPException(
            status_code=502,
            detail="The assistant hit an upstream error. Please try again.",
        )
    except ServerError:
        logger.warning("Gemini service temporarily unavailable")
        raise HTTPException(
            status_code=503,
            detail="The assistant is temporarily unavailable. Please try again shortly.",
        )
    except Exception:
        logger.exception("Unexpected error answering a chat question")
        raise HTTPException(
            status_code=500,
            detail="Something went wrong answering that. Please try again.",
        )
    return {"answer": answer}
