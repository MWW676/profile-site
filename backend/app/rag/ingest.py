import os
import time
import chromadb
from google import genai
from google.genai import types
from dotenv import load_dotenv
from app.data.resume_chunks import CHUNKS

load_dotenv()
client_ai = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

client_db = chromadb.PersistentClient(path="chroma_db")
collection = client_db.get_or_create_collection("resume")


def embed(text: str):
    result = client_ai.models.embed_content(
        model="models/gemini-embedding-001",
        contents=text,
        config=types.EmbedContentConfig(task_type="retrieval_document"),
    )
    return result.embeddings[0].values


def main():
    for chunk in CHUNKS:
        vector = embed(chunk["text"])
        collection.upsert(
            ids=[chunk["id"]],
            embeddings=[vector],
            documents=[chunk["text"]],
        )
        print(f"Ingested: {chunk['id']}")
        time.sleep(2)
    print(f"Done. {collection.count()} chunks in the collection.")


if __name__ == "__main__":
    main()
