import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./smartboard.db")

connect_args = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    # Handle Neon's sslmode and channel_binding for asyncpg
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("sslmode=require", "ssl=require")
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("&channel_binding=require", "")
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("?channel_binding=require", "")
    print("[DB] PostgreSQL database configured: YES")

engine = create_async_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args=connect_args, 
    echo=False,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=5,
    max_overflow=10
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as db:
        try:
            yield db
        finally:
            await db.close()
