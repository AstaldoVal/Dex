import sys, json, asyncio
sys.path.insert(0, "/Users/admin.roman.matsukatov/Development/DEX/core/mcp")
async def main():
    from job_digest_server import generate_job_summary
    with open("/Users/admin.roman.matsukatov/Development/DEX/.scripts/job-search/.summary-input-enable3.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    result = await generate_job_summary(
        job_description=data['job_description'],
        job_title=data.get('job_title', ''),
        company=data.get('company', ''),
        skills_report=data.get("skills_report"),
        focus_gap=data.get("focus_gap", False),
        current_summary=data.get("current_summary"),
        summary_round=data.get("summary_round"),
        previous_eval_notes=data.get("previous_eval_notes"),
    )
    with open("/Users/admin.roman.matsukatov/Development/DEX/.scripts/job-search/.summary-output-enable3.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
asyncio.run(main())