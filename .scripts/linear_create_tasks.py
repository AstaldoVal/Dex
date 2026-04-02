#!/usr/bin/env python3
"""Create Linear issues for Dex tasks. Uses certifi for SSL."""
import asyncio
import json
import os
from pathlib import Path

# Load .env
env_file = Path(__file__).resolve().parent.parent / ".env"
if env_file.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(env_file)
    except ImportError:
        pass

# Force SSL certs
import ssl
import certifi
ssl.create_default_https_context = lambda: ssl.create_default_context(cafile=certifi.where())

import aiohttp

API_URL = "https://api.linear.app/graphql"
API_KEY = os.environ.get("LINEAR_API_KEY") or os.environ.get("LINEAR_TOKEN")

TASKS = [
    ("Доделать прототип по EOS Crop Monitoring", "Прототип продукта EOS Crop Monitoring"),
    ("Проинтегрироваться с Jira и создать задачи с User Story", "Создать все необходимые задачи в Jira с описанием User Story"),
    ("Создать roadmap в Jira на основании user story", "Roadmap на базе созданных user story"),
    ("Ответить на вопросы по EOS: метрики, ресурсы, важное при планировании", "a) Ключові метрики ефективності рішень. c) Список ресурсів та спеціалістів. d) Інше важливе при плануванні змін."),
    ("Создать план контента на неделю для Substack", "План контента на всю следующую неделю для 1% AI Better Every Day"),
    ("Распланировать действия: эффективная подача на вакансии и работа с LinkedIn", "План действий по более эффективной подаче на вакансии и работе с LinkedIn"),
]

QUERY_VIEWER = "query { viewer { id } }"
QUERY_TEAMS = "query { teams { nodes { id } } }"
MUTATION_CREATE = """
mutation($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id identifier title url state { name } }
  }
}
"""



async def graphql(query: str, variables: dict = None):
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    connector = aiohttp.TCPConnector(ssl=ssl.create_default_context(cafile=certifi.where()))
    async with aiohttp.ClientSession(connector=connector) as session:
        async with session.post(
            API_URL,
            json=payload,
            headers={"Authorization": API_KEY, "Content-Type": "application/json"},
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            return await resp.json()


async def main():
    if not API_KEY:
        print("ERROR: LINEAR_API_KEY not set in .env")
        return 1

    # Get viewer and teams
    out_v = await graphql(QUERY_VIEWER)
    if out_v.get("errors"):
        print("ERROR:", out_v["errors"])
        return 1
    viewer_id = (out_v.get("data") or {}).get("viewer", {}).get("id")
    if not viewer_id:
        print("ERROR: viewer not found")
        return 1

    out_t = await graphql(QUERY_TEAMS)
    if out_t.get("errors"):
        print("ERROR:", out_t["errors"])
        return 1
    teams = (out_t.get("data") or {}).get("teams", {}).get("nodes") or []
    if not teams:
        print("ERROR: no teams in workspace")
        return 1
    team_id = teams[0]["id"]

    created = []
    for title, desc in TASKS:
        inp = {"teamId": team_id, "title": title, "assigneeId": viewer_id}
        if desc:
            inp["description"] = desc
        out = await graphql(MUTATION_CREATE, {"input": inp})
        if out.get("errors"):
            print(f"ERROR creating '{title}':", out["errors"])
            continue
        result = (out.get("data") or {}).get("issueCreate") or {}
        if result.get("success") and result.get("issue"):
            issue = result["issue"]
            created.append({"identifier": issue["identifier"], "title": issue["title"], "url": issue["url"]})
            print(f"OK: {issue['identifier']} - {issue['title']}")

    print("\n--- Created", len(created), "issues ---")
    for c in created:
        print(c["identifier"], c["url"])
    return 0


if __name__ == "__main__":
    exit(asyncio.run(main()))
