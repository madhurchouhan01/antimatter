import asyncio
from functools import lru_cache
from typing import Literal
import voyageai
from core.config import get_settings
from core.retry_utils import retry_async
from core.logger import get_logger

settings = get_settings()
log = get_logger(__name__)

import os

@lru_cache
def get_voyage_client():
    api_key = settings.voyage_api_key or os.environ.get("VOYAGE_API_KEY")
    return voyageai.AsyncClient(api_key=api_key)

async def embed_documents(texts: list[str]) -> list[list[float]]:
    """Embed a batch of code chunks for indexing with retry mechanism."""
    if not texts:
        return []
    client = get_voyage_client()
    # voyage-code-3 supports up to 128 inputs per batch
    all_embeddings = []
    batch_size = 128
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        log.info(f"Embedding batch {i // batch_size + 1}/{(len(texts) + batch_size - 1) // batch_size}")
        
        async def _embed_batch():
            return await client.embed(
                batch,
                model="voyage-code-3",
                input_type="document",
            )
        
        result = await retry_async(
            _embed_batch,
            max_retries=3,
            delay=1.0,
            backoff=2.0
        )
        all_embeddings.extend(result.embeddings)
    return all_embeddings

async def embed_query(text: str) -> list[float]:
    """Embed a single search query with retry mechanism."""
    client = get_voyage_client()
    
    async def _embed_query():
        return await client.embed(
            [text],
            model="voyage-code-3",
            input_type="query",
        )
    
    result = await retry_async(
        _embed_query,
        max_retries=3,
        delay=1.0,
        backoff=2.0
    )
    return result.embeddings[0]
