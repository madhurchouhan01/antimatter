# tests/conftest.py
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from db.models import Base
from db.session import get_db
from main import app

import os
from sqlalchemy.engine import make_url

base_db_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://aicoder:aicoder@localhost:5432/aicoder")
TEST_DATABASE_URL = make_url(base_db_url).set(database="aicoder_test").render_as_string(hide_password=False)



@pytest_asyncio.fixture
async def engine():
    print(f"FIXTURE DEBUG: TEST_DATABASE_URL={TEST_DATABASE_URL}")
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest_asyncio.fixture
async def client(engine):
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async def override_db():
        async with session_factory() as session:
            yield session
    app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()