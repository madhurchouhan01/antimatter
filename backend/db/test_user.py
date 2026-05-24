import asyncio
from db.session import AsyncSessionLocal
from core.security import hash_password
from db.models import User

async def main():
    async with AsyncSessionLocal() as db:
        user = User(
            email="dev@test.com",
            hashed_password=hash_password("secret123")
        )

        db.add(user)
        await db.commit()   # ✅ FIXED
        await db.refresh(user)

        print("User created:", user.id)

if __name__ == "__main__":
    asyncio.run(main())