#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const VAULT = path.resolve(__dirname, '../..');
const JOB_SEARCH_ROOT = __dirname;
const CORE_MCP = path.join(VAULT, 'core/mcp');
const inputPath = path.join(JOB_SEARCH_ROOT, '.summary-input-enable3.json');
const outputPath = path.join(JOB_SEARCH_ROOT, '.summary-output-enable3.json');
const scriptPath = path.join(JOB_SEARCH_ROOT, '.summary-run-enable3.py');

const job = JSON.parse(
  fs.readFileSync(path.join(VAULT, '00-Inbox/Job_Search/data/jobs/9999990068.json'), 'utf8')
);
const skills = JSON.parse(
  fs.readFileSync(path.join(VAULT, '00-Inbox/Job_Search/teal/enable3-cpo-skills-report.json'), 'utf8')
);

const prev = fs.existsSync(path.join(VAULT, '00-Inbox/Job_Search/teal/enable3-cpo-summary.txt'))
  ? fs.readFileSync(path.join(VAULT, '00-Inbox/Job_Search/teal/enable3-cpo-summary.txt'), 'utf8')
  : null;

fs.writeFileSync(
  inputPath,
  JSON.stringify({
    job_description: job.job_description,
    job_title: 'Chief Product Officer',
    company: 'Enable3',
    skills_report: skills,
    focus_gap: true,
    current_summary: prev,
    summary_round: 2,
    previous_eval_notes:
      'Must include exact phrases still missing: Loyalty, Loyalty Programs, Referrals, product-market fit, Positioning, Segment, Adoption, Mechanics, Customization, Partnerships, User Experience, Core Product, Market segments, Build products, Product offering, Scaling products, Leadership, Leading a team, Long-term relationships, Market trends, Prioritizing, Create value, Scalable, Senior leadership, Trends, Programs, Implementing, Product Lifecycle Management, Business segment, Marketing and sales teams.'
  })
);

const script = [
  'import sys, json, asyncio',
  `sys.path.insert(0, ${JSON.stringify(CORE_MCP)})`,
  'async def main():',
  '    from job_digest_server import generate_job_summary',
  `    with open(${JSON.stringify(inputPath)}, "r", encoding="utf-8") as f:`,
  '        data = json.load(f)',
  '    result = await generate_job_summary(',
  "        job_description=data['job_description'],",
  "        job_title=data.get('job_title', ''),",
  "        company=data.get('company', ''),",
  '        skills_report=data.get("skills_report"),',
  '        focus_gap=data.get("focus_gap", False),',
  '        current_summary=data.get("current_summary"),',
  '        summary_round=data.get("summary_round"),',
  '        previous_eval_notes=data.get("previous_eval_notes"),',
  '    )',
  `    with open(${JSON.stringify(outputPath)}, "w", encoding="utf-8") as f:`,
  '        json.dump(result, f, ensure_ascii=False, indent=2)',
  'asyncio.run(main())'
].join('\n');

fs.writeFileSync(scriptPath, script, 'utf8');
const r = spawnSync('python3', [scriptPath], {
  cwd: VAULT,
  env: process.env,
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024
});

if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(r.status || 1);
}

const out = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
if (!out.summary) {
  console.error(JSON.stringify(out, null, 2));
  process.exit(1);
}
const dest = path.join(VAULT, '00-Inbox/Job_Search/teal/enable3-cpo-summary.txt');
fs.writeFileSync(dest, out.summary.trim() + '\n', 'utf8');
console.log('Wrote', dest, 'chars=', out.summary.length);
