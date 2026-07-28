import os
import logging
from google import genai
from google.genai import types
from dotenv import load_dotenv
from app.rag.retrieve import get_relevant_chunks
from langfuse import observe

load_dotenv()
client_ai = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
logger = logging.getLogger("uvicorn.error")

with open("app/prompts/ask_me_system.md") as f:
    SYSTEM_PROMPT = f.read()

MAX_CONTEXT_CHARS = 6000


def build_context(chunks: list[str]) -> str:
    context = "\n\n".join(chunks)
    if len(context) > MAX_CONTEXT_CHARS:
        logger.warning(f"Retrieved context ({len(context)} chars) exceeded cap, truncating")
        context = context[:MAX_CONTEXT_CHARS]
    return context

@observe()
def answer_question(question: str) -> str:
    chunks = get_relevant_chunks(question)
    context = build_context(chunks)
    prompt = f"Context:\n{context}\n\nQuestion: {question}"

    response = client_ai.models.generate_content(
        model="models/gemini-flash-latest",
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
        ),
    )

    usage = response.usage_metadata
    logger.info(
        f"chat request — prompt={usage.prompt_token_count}, "
        f"candidates={usage.candidates_token_count}, "
        f"thoughts={getattr(usage, 'thoughts_token_count', 0)}, "
        f"total={usage.total_token_count}"
    )

    return response.text
