#!/usr/bin/env python3
"""Fetch Linear issue UUIDs by identifiers. Uses certifi for SSL."""
import asyncio
import os
from pathlib import Path

env_file = Path(__file__).resolve().parent.parent / ".env"
if env_file.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(env_file)
    except ImportError:
        pass

import ssl
import certifi
ssl.create_default_https_context = lambda: ssl.create_default_context(cafile=certifi.where())
import aiohttp

API_URL = "https://api.linear.app/graphql"
API_KEY = os.environ.get("LINEAR_API_KEY") or os.environ.get("LINEAR_TOKEN")

QUERY = """
query($first: Int!) {
  issues(first: $first) {
    nodes { id identifier }
  }
}
"""

async def main():
    connector = aiohttp.TCPConnector(ssl=ssl.create_default_context(cafile=certifi.where()))
    async with aiohttp.ClientSession(connector=connector) as session:
        async with session.post(API_URL, json={"query": QUERY, "variables": {"first": 30}},
            headers={"Authorization": API_KEY, "Content-Type": "application/json"},
            timeout=aiohttp.ClientTimeout(total=10)) as r:
            j = await r.json()
        nodes = (j.get("data") or {}).get("issues", {}).get("nodes") or []
        want = {"INA-11", "INA-12", "INA-13", "INA-14", "INA-15", "INA-16"}
        for n in nodes:
            if n["identifier"] in want:
                print(n["identifier"], n["id"])

if __name__ == "__main__":
    asyncio.run(main())
