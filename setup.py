from pathlib import Path

# Folder structure
dirs = [
    "backend/api/routes",
    "backend/api/middleware",
    "backend/db/migrations",
    "backend/services",
    "backend/core",
    "backend/tests",
]

# Files to create
files = [
    "backend/api/routes/auth.py",
    "backend/api/routes/projects.py",
    "backend/api/routes/files.py",

    "backend/api/middleware/auth.py",
    "backend/api/middleware/rate_limit.py",

    "backend/db/models.py",
    "backend/db/session.py",

    "backend/services/auth_service.py",
    "backend/services/project_service.py",
    "backend/services/file_service.py",

    "backend/core/config.py",
    "backend/core/security.py",
    "backend/core/exceptions.py",

    "backend/tests/test_auth.py",
    "backend/tests/test_projects.py",
    "backend/tests/test_files.py",
    "backend/tests/conftest.py",

    "backend/main.py",
    "backend/requirements.txt",

    "docker-compose.yml",
    ".env.example",
    "Makefile",
    "pyproject.toml",
]

# Create directories
for d in dirs:
    Path(d).mkdir(parents=True, exist_ok=True)

# Create files
for f in files:
    Path(f).touch(exist_ok=True)

print("✅ Project structure created successfully!")