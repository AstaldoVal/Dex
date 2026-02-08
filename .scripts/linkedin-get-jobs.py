#!/usr/bin/env python3
"""
Get job listings from LinkedIn company pages.
Extracts jobs from the Jobs tab on company LinkedIn pages.
"""

import sys
import os
import json
import time
from datetime import datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'core', 'mcp'))

from linkedin_server import sync_playwright, _get_browser_context, _wait_for_linkedin_load, _is_logged_in, _save_context_state

def get_company_jobs(page, company_url):
    """Extract job listings from company LinkedIn page Jobs tab."""
    jobs = []
    
    try:
        # Go to company page
        page.goto(company_url)
        _wait_for_linkedin_load(page)
        
        # Try to find and click Jobs tab
        # LinkedIn uses various selectors for Jobs tab
        jobs_selectors = [
            'a[href*="/jobs/"]',
            'button:has-text("Jobs")',
            'a:has-text("Jobs")',
            '[data-control-name="page_member_main_nav_jobs"]',
        ]
        
        jobs_tab_clicked = False
        for selector in jobs_selectors:
            try:
                element = page.locator(selector).first
                if element.count() > 0:
                    # Get href if it's a link
                    if selector.startswith('a'):
                        href = element.get_attribute('href')
                        if href:
                            if href.startswith('/'):
                                jobs_url = f"https://www.linkedin.com{href}"
                            else:
                                jobs_url = href
                            page.goto(jobs_url)
                            jobs_tab_clicked = True
                            break
                    else:
                        element.click()
                        jobs_tab_clicked = True
                        break
            except Exception:
                continue
        
        if not jobs_tab_clicked:
            # Try direct URL
            if company_url.endswith('/'):
                jobs_url = company_url + 'jobs/'
            else:
                jobs_url = company_url + '/jobs/'
            page.goto(jobs_url)
        
        _wait_for_linkedin_load(page)
        time.sleep(3)  # Wait for jobs to load
        
        # Extract job listings
        # LinkedIn job cards have various structures
        job_selectors = [
            'div[data-test-id="job-card"]',
            'div.job-card-container',
            'li.jobs-search-results__list-item',
            'div[class*="job-card"]',
            'a[href*="/jobs/view/"]',
        ]
        
        found_jobs = []
        for selector in job_selectors:
            try:
                elements = page.locator(selector).all()
                if len(elements) > 0:
                    for elem in elements[:20]:  # Limit to first 20 jobs
                        try:
                            # Try to extract job title
                            title_elem = elem.locator('h3, h4, a[href*="/jobs/view/"]').first
                            if title_elem.count() > 0:
                                title = title_elem.inner_text().strip()
                            else:
                                title = elem.locator('text=/.*/').first.inner_text().strip()[:100]
                            
                            # Try to extract job URL
                            link_elem = elem.locator('a[href*="/jobs/view/"]').first
                            if link_elem.count() > 0:
                                job_url = link_elem.get_attribute('href')
                                if job_url and not job_url.startswith('http'):
                                    job_url = f"https://www.linkedin.com{job_url}"
                            else:
                                job_url = None
                            
                            # Try to extract location/company info
                            location = ""
                            company = ""
                            try:
                                location_elem = elem.locator('span[class*="location"], span:has-text(",")').first
                                if location_elem.count() > 0:
                                    location = location_elem.inner_text().strip()
                            except:
                                pass
                            
                            if title and title not in [j.get('title', '') for j in found_jobs]:
                                found_jobs.append({
                                    'title': title,
                                    'url': job_url or '',
                                    'location': location,
                                    'company': company,
                                })
                        except Exception as e:
                            continue
                    
                    if found_jobs:
                        break
            except Exception:
                continue
        
        # If no jobs found with selectors, try to extract from page text
        if not found_jobs:
            try:
                page_text = page.content()
                # Look for job links in page source
                import re
                job_links = re.findall(r'href="(/jobs/view/\d+[^"]*)"', page_text)
                for link in job_links[:20]:
                    job_url = f"https://www.linkedin.com{link}"
                    # Try to get title from link text or nearby
                    try:
                        link_elem = page.locator(f'a[href="{link}"]').first
                        if link_elem.count() > 0:
                            title = link_elem.inner_text().strip()
                            if title:
                                found_jobs.append({
                                    'title': title,
                                    'url': job_url,
                                    'location': '',
                                    'company': '',
                                })
                    except:
                        found_jobs.append({
                            'title': 'Job Listing',
                            'url': job_url,
                            'location': '',
                            'company': '',
                        })
            except Exception:
                pass
        
        return {
            'success': True,
            'company_url': company_url,
            'jobs_count': len(found_jobs),
            'jobs': found_jobs
        }
        
    except Exception as e:
        return {
            'success': False,
            'company_url': company_url,
            'error': str(e),
            'jobs': []
        }

# Main execution
if __name__ == "__main__":
    companies = [
        "https://www.linkedin.com/company/barcrest-games",
        "https://www.linkedin.com/company/epicwinglobal",
    ]
    
    print("🔍 Собираю информацию о вакансиях...\n")
    
    all_results = []
    
    with sync_playwright() as playwright:
        context = _get_browser_context(playwright, headless=False)
        page = context.new_page()
        
        try:
            # Check login
            page.goto('https://www.linkedin.com/feed')
            _wait_for_linkedin_load(page)
            
            if not _is_logged_in(page):
                print("❌ Ошибка: Не залогинен в LinkedIn")
                sys.exit(1)
            
            print("✅ Вход подтверждён\n")
            
            for i, company_url in enumerate(companies, 1):
                print(f"[{i}/{len(companies)}] Обрабатываю: {company_url}")
                result = get_company_jobs(page, company_url)
                all_results.append(result)
                
                if result['success']:
                    print(f"  ✅ Найдено вакансий: {result['jobs_count']}")
                else:
                    print(f"  ❌ Ошибка: {result.get('error', 'Unknown')}")
                
                if i < len(companies):
                    time.sleep(3)  # Small delay between companies
            
            _save_context_state(context)
            
        except Exception as e:
            print(f"❌ Критическая ошибка: {e}")
            import traceback
            traceback.print_exc()
        finally:
            context.close()
    
    # Save results
    vault_path = os.environ.get("VAULT_PATH", os.path.dirname(os.path.dirname(__file__)))
    output_file = os.path.join(vault_path, "00-Inbox", "Job_Search", "debug", f"linkedin-jobs-failed-companies-{datetime.now().strftime('%Y-%m-%d')}.md")
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # Generate markdown digest
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"# Вакансии компаний (не удалось подписаться)\n\n")
        f.write(f"**Дата:** {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n")
        f.write(f"Компании, на которые не удалось подписаться в LinkedIn, и их открытые вакансии.\n\n")
        f.write("---\n\n")
        
        for result in all_results:
            company_name = result['company_url'].split('/company/')[-1].replace('-', ' ').title()
            f.write(f"## {company_name}\n\n")
            f.write(f"**LinkedIn:** {result['company_url']}\n\n")
            
            if result['success']:
                if result['jobs_count'] > 0:
                    f.write(f"**Найдено вакансий:** {result['jobs_count']}\n\n")
                    f.write("### Открытые вакансии:\n\n")
                    for job in result['jobs']:
                        f.write(f"- **{job['title']}**")
                        if job['location']:
                            f.write(f" - {job['location']}")
                        f.write("\n")
                        if job['url']:
                            f.write(f"  - [Ссылка на вакансию]({job['url']})\n")
                        f.write("\n")
                else:
                    f.write("**Вакансии:** Нет открытых вакансий на данный момент\n\n")
            else:
                f.write(f"**Ошибка:** {result.get('error', 'Не удалось получить информацию')}\n\n")
            
            f.write("---\n\n")
        
        # Summary
        total_jobs = sum(r.get('jobs_count', 0) for r in all_results if r.get('success'))
        f.write(f"## Итого\n\n")
        f.write(f"- **Компаний обработано:** {len(all_results)}\n")
        f.write(f"- **Всего вакансий найдено:** {total_jobs}\n")
    
    print(f"\n✅ Результаты сохранены в: {output_file}")
    print(f"\n📊 Итого найдено вакансий: {sum(r.get('jobs_count', 0) for r in all_results if r.get('success'))}")
