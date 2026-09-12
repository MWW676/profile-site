import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.rag.retrieve import collection
from app.rag.ingest import main as run_ingestion
from app.routers import chat, health, leaderboard


@asynccontextmanager
async def lifespan(app: FastAPI):
    if collection.count() == 0:
        print("Chroma collection empty — running ingestion on startup")
        run_ingestion()
    yield


app = FastAPI(title="profile-site-backend", lifespan=lifespan)

ALLOWED_ORIGINS = os.environ.get("CORS_ORIGINS", "").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(chat.router)
app.include_router(leaderboard.router)
