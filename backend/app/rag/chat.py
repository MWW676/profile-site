import os
import logging
from google import genai
from google.genai import types
from dotenv import load_dotenv
from pathlib import Path
from langfuse import observe
from app.rag.tools import search_resume
from app.rag.retry import call_with_retry

load_dotenv()
client_ai = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
logger = logging.getLogger("uvicorn.error")

CURRENT_DIR = Path(__file__).resolve().parent.parent
sys_prompt_path = CURRENT_DIR / "prompts" / "ask_me_system.md"
with open(sys_prompt_path) as f:
    SYSTEM_PROMPT = f.read()


@observe()
def answer_question(question: str) -> str:
    response = call_with_retry(
        client_ai.models.generate_content,
        model="models/gemini-flash-latest",
        contents=question,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            tools=[search_resume],
        ),
        max_attempts=2,
        base_delay=1.0,
    )

    usage = response.usage_metadata
    logger.info(
        f"chat request — prompt={usage.prompt_token_count}, "
        f"candidates={usage.candidates_token_count}, "
        f"total={usage.total_token_count}"
    )

    return response.text
