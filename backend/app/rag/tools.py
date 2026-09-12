from app.rag.retrieve import get_relevant_chunks

MAX_CONTEXT_CHARS = 6000


def search_resume(query: str) -> str:
    """Searches Fang Meiheng's resume for information about her professional
    background, skills, work experience, education, or certifications.

    Args:
        query: The topic or question to search the resume for.
    """
    chunks = get_relevant_chunks(query)
    context = "\n\n".join(chunks)
    return context[:MAX_CONTEXT_CHARS]
