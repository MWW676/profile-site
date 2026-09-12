import os
import chromadb
from google import genai
from google.genai import types
from dotenv import load_dotenv
from app.rag.retry import call_with_retry

load_dotenv()
os.environ["ANONYMIZED_TELEMETRY"] = "False"

client_ai = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
client_db = chromadb.PersistentClient(path="chroma_db")
collection = client_db.get_or_create_collection("resume")


def get_relevant_chunks(question: str, n_results: int = 3) -> list[str]:
    result = call_with_retry(
        client_ai.models.embed_content,
        model="models/gemini-embedding-001",
        contents=question,
        config=types.EmbedContentConfig(task_type="retrieval_query"),
        max_attempts=2,
        base_delay=1.0,
    )
    matches = collection.query(
        query_embeddings=[result.embeddings[0].values],
        n_results=n_results,
    )
    return matches["documents"][0]

