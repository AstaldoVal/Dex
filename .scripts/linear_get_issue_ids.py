#!/usr/bin/env python3
"""Fetch Linear issue UUIDs by identifiers."""
import os
from pathlib import Path

env_file = Path(__file__).resolve().parent.parent / ".env"
if env_file.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(env_file)
    except ImportError:
        pass

import requests

API_URL = "https://api.linear.app/graphql"
API_KEY = os.environ.get("LINEAR_API_KEY") or os.environ.get("LINEAR_TOKEN")

QUERY = """
query($first: Int!) {
  issues(first: $first) {
    nodes { id identifier }
  }
}
"""

def main():
    if not API_KEY:
        print("ERROR: LINEAR_API_KEY not set in .env")
        return 1
    r = requests.post(
        API_URL,
        json={"query": QUERY, "variables": {"first": 30}},
        headers={"Authorization": API_KEY, "Content-Type": "application/json"},
        timeout=10,
    )
    j = r.json()
    nodes = (j.get("data") or {}).get("issues", {}).get("nodes") or []
    want = {"INA-11", "INA-12", "INA-13", "INA-14", "INA-15", "INA-16"}
    for n in nodes:
        if n["identifier"] in want:
            print(n["identifier"], n["id"])
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
