import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from fastmcp import FastMCP
from app.data.resume_chunks import CHUNKS

mcp = FastMCP(name="fang-resume-server")


def _make_resource(text: str):
    def resource_fn() -> str:
        return text
    return resource_fn


for chunk in CHUNKS:
    mcp.resource(
        f"resume://{chunk['id']}",
        name=chunk["id"],
        description=f"Resume section: {chunk['id']}",
    )(_make_resource(chunk["text"]))


if __name__ == "__main__":
    mcp.run()
