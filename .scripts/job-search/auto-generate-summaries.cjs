#!/usr/bin/env node
/**
 * Auto-generate summaries for jobs in digest file that have AUTO_SUMMARY markers.
 * This script is called automatically when digest file is opened/processed in Cursor.
 * 
 * Usage:
 *   node auto-generate-summaries.cjs [digest-file.md]
 * 
 * Or use MCP tool: generate_digest_summaries
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
const JOB_SEARCH_DIR = path.join(VAULT, '00-Inbox', 'Job_Search');

/**
 * Parse digest file and find jobs with AUTO_SUMMARY markers
 */
function findJobsNeedingSummary(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const jobs = [];
  
  // Match: - [ ] [Title · Company · Type](URL)
  // Followed by: <!-- AUTO_SUMMARY:job_type:base64_encoded_job_description -->
  const jobPattern = /- \[ \] \[([^\]]+)\]\(([^\)]+)\)\s*\n\s*<!-- AUTO_SUMMARY:([^:]+):([^>]+) -->/g;
  let match;
  
  while ((match = jobPattern.exec(content)) !== null) {
    const titleLine = match[1];
    const url = match[2];
    const jobType = match[3];
    const jobDescEncoded = match[4];
    
    try {
      const jobDescription = Buffer.from(jobDescEncoded, 'base64').toString('utf-8');
      
      const parts = titleLine.split('·').map(p => p.trim());
      const title = parts[0] || '';
      const company = parts[1] || '';
      
      jobs.push({
        title,
        company,
        url,
        jobType,
        jobDescription,
        markerIndex: match.index,
        markerEnd: match.index + match[0].length
      });
    } catch (e) {
      console.error(`Error decoding job description for ${url}:`, e.message);
    }
  }
  
  return { jobs, content };
}

/**
 * Generate summary using MCP job-digest server (which prepares data for Claude in Cursor)
 */
async function generateSummaryForJob(jobDescription, jobTitle, company, jobType) {
  // Call MCP tool to prepare data and generate summary
  // Summary generation happens in Cursor context via Claude
  const pythonScript = `
import sys
import json
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / 'core' / 'mcp'))

from job_digest_server import generate_job_summary

async def main():
    job_desc = sys.argv[1]
    job_title = sys.argv[2]
    company = sys.argv[3]
    
    try:
        result = await generate_job_summary(
            job_description=job_desc,
            job_title=job_title,
            company=company,
            job_url=""
        )
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

asyncio.run(main())
`;
  
  try {
    const result = execSync(
      `python3 -c ${JSON.stringify(pythonScript)} ${JSON.stringify(jobDescription)} ${JSON.stringify(jobTitle)} ${JSON.stringify(company)}`,
      {
        encoding: 'utf-8',
        cwd: VAULT,
        env: { ...process.env, PYTHONPATH: path.join(VAULT, 'core', 'mcp') },
        maxBuffer: 10 * 1024 * 1024
      }
    );
    
    return JSON.parse(result);
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Main function - processes digest and generates summaries
 */
async function main() {
  const args = process.argv.slice(2);
  let digestFile = args[0];
  
  if (!digestFile) {
    const files = fs.readdirSync(JOB_SEARCH_DIR)
      .filter(f => f.startsWith('linkedin-jobs-') && f.endsWith('.md'))
      .sort()
      .reverse();
    
    if (files.length === 0) {
      console.error('No digest files found');
      process.exit(1);
    }
    
    digestFile = files[0];
  }
  
  const digestPath = path.isAbsolute(digestFile) 
    ? digestFile 
    : path.join(JOB_SEARCH_DIR, digestFile);
  
  if (!fs.existsSync(digestPath)) {
    console.error(`Digest file not found: ${digestPath}`);
    process.exit(1);
  }
  
  const { jobs, content } = findJobsNeedingSummary(digestPath);
  
  if (jobs.length === 0) {
    console.log('No jobs need summary generation');
    return;
  }
  
  console.log(`Found ${jobs.length} jobs needing summary generation`);
  
  // Process jobs and generate summaries
  let updatedContent = content;
  let processed = 0;
  
  // Process in reverse order to preserve indices
  for (let i = jobs.length - 1; i >= 0; i--) {
    const job = jobs[i];
    
    console.log(`Processing ${i + 1}/${jobs.length}: ${job.title} at ${job.company}`);
    
    const summaryData = await generateSummaryForJob(
      job.jobDescription,
      job.title,
      job.company,
      job.jobType
    );
    
    if (summaryData.error) {
      console.error(`  Error: ${summaryData.error}`);
      continue;
    }
    
    // Replace AUTO_SUMMARY marker with actual summary
    const beforeMarker = updatedContent.substring(0, job.markerIndex);
    const afterMarker = updatedContent.substring(job.markerEnd);
    
    // Build summary text
    let summaryText = '\n\n';
    if (summaryData.summary) {
      summaryText += summaryData.summary;
      if (summaryData.suggested_questions && summaryData.suggested_questions.length > 0) {
        summaryText += '\n\n**Suggested questions:**\n';
        summaryData.suggested_questions.forEach(q => {
          summaryText += `- ${q}\n`;
        });
      }
    } else {
      // If summary not generated, keep marker but add note
      summaryText += `<!-- Summary generation failed. Use /job-summary skill. -->`;
    }
    
    updatedContent = beforeMarker + summaryText + afterMarker;
    processed++;
  }
  
  // Write updated content
  fs.writeFileSync(digestPath, updatedContent, 'utf-8');
  console.log(`\nProcessed ${processed}/${jobs.length} jobs. Updated ${digestPath}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = { findJobsNeedingSummary, generateSummaryForJob };
