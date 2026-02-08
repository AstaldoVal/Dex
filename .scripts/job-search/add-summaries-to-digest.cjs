#!/usr/bin/env node
/**
 * Add summaries to job digest using MCP job-digest server
 * 
 * Reads a digest file and generates summaries for jobs that have job descriptions.
 * Can be called with a specific digest file or processes the latest one.
 * 
 * Usage:
 *   node add-summaries-to-digest.cjs [digest-file.md]
 * 
 * Requires:
 *   - MCP job-digest server configured
 *   - ANTHROPIC_API_KEY environment variable (optional, falls back to manual generation)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { VAULT, DIGESTS_DIR } = require('./job-search-paths.cjs');

/**
 * Call MCP tool via Python script
 */
function callMCPTool(toolName, args) {
  try {
    const script = `
import sys
import json
import asyncio
from pathlib import Path

# Add core/mcp to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'core' / 'mcp'))

from job_digest_server import generate_job_summary, detect_job_type

async def main():
    result = await ${toolName}(${JSON.stringify(args)})
    print(json.dumps(result, indent=2))

asyncio.run(main())
`;
    
    const result = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`, {
      cwd: VAULT,
      encoding: 'utf-8',
      env: { ...process.env, PYTHONPATH: path.join(VAULT, 'core', 'mcp') }
    });
    
    return JSON.parse(result);
  } catch (error) {
    console.error(`Error calling MCP tool ${toolName}:`, error.message);
    return null;
  }
}

/**
 * Parse digest file and extract jobs
 */
function parseDigest(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const jobs = [];
  
  // Match job entries: - [ ] [Title · Company · Type](URL)
  const jobPattern = /- \[ \] \[([^\]]+)\]\(([^\)]+)\)/g;
  let match;
  
  while ((match = jobPattern.exec(content)) !== null) {
    const titleLine = match[1];
    const url = match[2];
    
    const parts = titleLine.split('·').map(p => p.trim());
    const title = parts[0] || '';
    const company = parts[1] || '';
    const workType = parts[2] || '';
    
    // Check if summary already exists (look for content after URL line)
    const lineIndex = content.indexOf(match[0]);
    const nextJobMatch = content.substring(lineIndex).match(/- \[ \] \[/);
    const jobContentEnd = nextJobMatch ? lineIndex + nextJobMatch.index : content.length;
    const jobContent = content.substring(lineIndex, jobContentEnd);
    
    const hasSummary = jobContent.includes('**Suggested questions:**') || 
                      (jobContent.split('\n').length > 2 && !jobContent.includes('---'));
    
    jobs.push({
      title,
      company,
      workType,
      url,
      hasSummary,
      lineIndex,
      contentEnd: jobContentEnd
    });
  }
  
  return { jobs, content };
}

/**
 * Generate summary for a job (requires job description)
 * For now, this is a placeholder - actual implementation would need job description
 */
function generateSummaryForJob(job, jobDescription) {
  if (!jobDescription) {
    return null;
  }
  
  // Call MCP tool
  const result = callMCPTool('generate_job_summary', {
    job_description: jobDescription,
    job_title: job.title,
    job_url: job.url,
    company: job.company
  });
  
  return result;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  let digestFile = args[0];
  
  // If no file specified, find latest digest
  if (!digestFile) {
    const files = fs.readdirSync(DIGESTS_DIR)
      .filter(f => f.startsWith('linkedin-jobs-') && f.endsWith('.md'))
      .sort()
      .reverse();
    
    if (files.length === 0) {
      console.error('No digest files found in', DIGESTS_DIR);
      process.exit(1);
    }
    
    digestFile = files[0];
    console.log(`Using latest digest: ${digestFile}`);
  }
  
  const digestPath = path.isAbsolute(digestFile) 
    ? digestFile 
    : path.join(DIGESTS_DIR, digestFile);
  
  if (!fs.existsSync(digestPath)) {
    console.error(`Digest file not found: ${digestPath}`);
    process.exit(1);
  }
  
  const { jobs, content } = parseDigest(digestPath);
  console.log(`Found ${jobs.length} jobs in digest`);
  
  const jobsWithoutSummary = jobs.filter(j => !j.hasSummary);
  console.log(`${jobsWithoutSummary.length} jobs without summary`);
  
  if (jobsWithoutSummary.length === 0) {
    console.log('All jobs already have summaries');
    return;
  }
  
  console.log('\nNote: To generate summaries, job descriptions are needed.');
  console.log('This script can be extended to fetch job descriptions from LinkedIn URLs');
  console.log('or you can manually add summaries using the MCP job-digest tools.');
  console.log('\nJobs without summaries:');
  jobsWithoutSummary.forEach(job => {
    console.log(`  - ${job.title} at ${job.company} (${job.url})`);
  });
}

if (require.main === module) {
  main();
}

module.exports = { parseDigest, generateSummaryForJob };
