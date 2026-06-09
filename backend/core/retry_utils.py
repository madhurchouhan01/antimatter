"""
Retry utilities for API calls.
Provides decorators and helpers for retrying failed API operations.
"""

import asyncio
import time
from typing import Callable, TypeVar, Any
from core.logger import get_logger

log = get_logger(__name__)

T = TypeVar("T")

async def retry_async(
    func: Callable,
    *args,
    max_retries: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    **kwargs
) -> Any:
    """
    Retry an async function with exponential backoff.
    
    Args:
        func: Async function to retry
        max_retries: Maximum number of retry attempts (default: 3)
        delay: Initial delay in seconds (default: 1.0)
        backoff: Multiplier for delay between retries (default: 2.0)
        *args, **kwargs: Arguments to pass to the function
        
    Returns:
        Result of the function
        
    Raises:
        Exception: The last exception if all retries fail
    """
    last_exception = None
    current_delay = delay
    
    for attempt in range(max_retries):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            last_exception = e
            if attempt < max_retries - 1:
                log.warning(
                    f"Attempt {attempt + 1}/{max_retries} failed for {func.__name__}: {str(e)}. "
                    f"Retrying in {current_delay}s..."
                )
                await asyncio.sleep(current_delay)
                current_delay *= backoff
            else:
                log.error(
                    f"All {max_retries} attempts failed for {func.__name__}: {str(e)}"
                )
    
    raise last_exception


def retry_sync(
    func: Callable,
    *args,
    max_retries: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    **kwargs
) -> Any:
    """
    Retry a sync function with exponential backoff.
    
    Args:
        func: Function to retry
        max_retries: Maximum number of retry attempts (default: 3)
        delay: Initial delay in seconds (default: 1.0)
        backoff: Multiplier for delay between retries (default: 2.0)
        *args, **kwargs: Arguments to pass to the function
        
    Returns:
        Result of the function
        
    Raises:
        Exception: The last exception if all retries fail
    """
    last_exception = None
    current_delay = delay
    
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            last_exception = e
            if attempt < max_retries - 1:
                log.warning(
                    f"Attempt {attempt + 1}/{max_retries} failed for {func.__name__}: {str(e)}. "
                    f"Retrying in {current_delay}s..."
                )
                time.sleep(current_delay)
                current_delay *= backoff
            else:
                log.error(
                    f"All {max_retries} attempts failed for {func.__name__}: {str(e)}"
                )
    
    raise last_exception
