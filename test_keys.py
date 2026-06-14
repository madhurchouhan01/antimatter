import os
import requests
from dotenv import load_dotenv

load_dotenv()

github_pat = os.getenv("GITHUB_PAT")
openrouter_key = os.getenv("OPENROUTER_API_KEY")

print("Checking GITHUB_PAT...")
if github_pat:
    headers = {
        "Authorization": f"Bearer {github_pat}"
    }
    # Call GitHub API user info endpoint to test token validity
    res = requests.get("https://api.github.com/user", headers=headers)
    print("GitHub API response status:", res.status_code)
    try:
        print("GitHub user info:", res.json().get("login") or res.json())
    except Exception as e:
        print("Error parsing GitHub response:", e)
else:
    print("GITHUB_PAT not set in environment.")

print("\nChecking GITHUB_PAT with GitHub Models endpoint...")
if github_pat:
    # Test Chat Completions on GitHub Models API
    headers = {
        "Authorization": f"Bearer {github_pat}",
        "Content-Type": "application/json"
    }
    data = {
        "messages": [
            {"role": "user", "content": "Say 'GitHub Models works!'"}
        ],
        "model": "meta/llama-4-scout" # Let's try a lightweight/available model
    }
    res = requests.post("https://models.github.ai/inference/chat/completions", headers=headers, json=data)
    print("GitHub Models response status:", res.status_code)
    try:
        print("GitHub Models response:", res.json())
    except Exception as e:
        print("Error parsing GitHub Models response:", e)

print("\nChecking OPENROUTER_API_KEY...")
if openrouter_key:
    headers = {
        "Authorization": f"Bearer {openrouter_key}",
        "Content-Type": "application/json"
    }
    # OpenRouter auth test
    res = requests.get("https://openrouter.ai/api/v1/auth/key", headers=headers)
    print("OpenRouter status:", res.status_code)
    try:
        print("OpenRouter response:", res.json())
    except Exception as e:
        print("Error parsing OpenRouter response:", e)
else:
    print("OPENROUTER_API_KEY not set in environment.")
