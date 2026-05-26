# from pathlib import Path

# # Folder structure
# dirs = [
#     "backend/api/routes",
#     "backend/api/middleware",
#     "backend/db/migrations",
#     "backend/services",
#     "backend/core",
#     "backend/tests",
# ]

# # Files to create
# files = [
#     "backend/api/routes/auth.py",
#     "backend/api/routes/projects.py",
#     "backend/api/routes/files.py",

#     "backend/api/middleware/auth.py",
#     "backend/api/middleware/rate_limit.py",

#     "backend/db/models.py",
#     "backend/db/session.py",

#     "backend/services/auth_service.py",
#     "backend/services/project_service.py",
#     "backend/services/file_service.py",

#     "backend/core/config.py",
#     "backend/core/security.py",
#     "backend/core/exceptions.py",

#     "backend/tests/test_auth.py",
#     "backend/tests/test_projects.py",
#     "backend/tests/test_files.py",
#     "backend/tests/conftest.py",

#     "backend/main.py",
#     "backend/requirements.txt",

#     "docker-compose.yml",
#     ".env.example",
#     "Makefile",
#     "pyproject.toml",
# ]

# # Create directories
# for d in dirs:
#     Path(d).mkdir(parents=True, exist_ok=True)

# # Create files
# for f in files:
#     Path(f).touch(exist_ok=True)

# print("✅ Project structure created successfully!")


from pathlib import Path

# Run this script from inside the frontend directory
BASE_DIR = Path.cwd()

files = [
    "src/components/ChatPanel.jsx",
    "src/components/CodeEditor.jsx",
    "src/components/EditorTabs.jsx",
    "src/components/FileTree.jsx",
    "src/components/Layout.jsx",

    "src/hooks/useAgentSocket.js",

    "src/lib/api.js",

    "src/pages/Login.jsx",
    "src/pages/ProjectPicker.jsx",

    "src/stores/authStore.js",
    "src/stores/chatStore.js",
    "src/stores/editorStore.js",
    "src/stores/projectStore.js",

    "src/App.jsx",
    "src/index.css",

    "tailwind.config.js",
    "package.json",
]

for file_path in files:
    full_path = BASE_DIR / file_path

    # Create parent directories if they don't exist
    full_path.parent.mkdir(parents=True, exist_ok=True)

    # Skip if file already exists
    if full_path.exists():
        print(f"⏭ Skipped (already exists): {file_path}")
        continue

    # Create empty file
    full_path.touch()

    print(f"✅ Created: {file_path}")

print("\n🎉 Structure setup complete.")