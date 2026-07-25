import logging
from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
from pydantic import BaseModel
from app.rag.chat import answer_question
from app.rag.retrieve import collection
from app.rag.ingest import main as run_ingestion
from google.genai.errors import ClientError

logger = logging.getLogger("uvicorn.error")

class ChatRequest(BaseModel):
    message: str

@asynccontextmanager
async def lifespan(app: FastAPI):
    if collection.count() == 0:
        print("Chroma collection empty — running ingestion on startup")
        run_ingestion()
    yield

app = FastAPI(title="profile-site-backend", lifespan=lifespan)

@app.post("/api/chat")
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
    except Exception:
        logger.exception("Unexpected error answering a chat question")
        raise HTTPException(
            status_code=500,
            detail="Something went wrong answering that. Please try again.",
        )
    return {"answer": answer}

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"message": "backend is alive"}
