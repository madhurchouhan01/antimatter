import asyncio
from functools import lru_cache
from typing import Literal
import voyageai
from core.config import get_settings

settings = get_settings()

import os

@lru_cache
def get_voyage_client():
    api_key = settings.voyage_api_key or os.environ.get("VOYAGE_API_KEY")
    return voyageai.AsyncClient(api_key=api_key)

async def embed_documents(texts: list[str]) -> list[list[float]]:
    """Embed a batch of code chunks for indexing."""
    if not texts:
        return []
    client = get_voyage_client()
    # voyage-code-3 supports up to 128 inputs per batch
    all_embeddings = []
    batch_size = 128
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        result = await client.embed(
            batch,
            model="voyage-code-3",
            input_type="document",
        )
        all_embeddings.extend(result.embeddings)
    return all_embeddings

async def embed_query(text: str) -> list[float]:
    """Embed a single search query."""
    client = get_voyage_client()
    result = await client.embed(
        [text],
        model="voyage-code-3",
        input_type="query",
    )
    return result.embeddings[0]
