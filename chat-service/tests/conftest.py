"""
Override settings for unit tests that don't need real infrastructure.
Tests that require DB/Redis should use mocks or a real test container.
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://mock:mock@localhost:5432/mockstack_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production")
