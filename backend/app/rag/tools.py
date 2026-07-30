from app.rag.retrieve import get_relevant_chunks
from app.data.resume_chunks import CHUNKS
from app.config import MAX_CONTEXT_CHARS


def search_resume(query: str) -> str:
    """Searches resume for information about her professional
    background, skills, work experience, education, or certifications.

    Args:
        query: The topic or question to search the resume for.
    """
    chunks = get_relevant_chunks(query)
    context = "\n\n".join(chunks)
    return context[:MAX_CONTEXT_CHARS]


def get_project_details(project_name: str) -> str:
    """Returns details about one of the personal projects.

    Args:
        project_name: The name of the project being asked about.
    """
    for chunk in CHUNKS:
        if chunk["id"] == "personal_project":
            return chunk["text"]
    return "No project details found."


def get_fun_fact() -> str:
    """Returns a light, casual fact about author, for visitors asking
    something fun or personal rather than professional. Use this for casual
    questions, not resume questions.
    """
    return (
        "Fang enjoys travel photography — her gallery includes shots from "
        "Japan, South Korea, Australia, and China. Her must do item during "
        "travel is to visit the local supermarkets. She also loves eating "
        "and lemon flavour is her favourite (lemon included)."
    )
