#!/usr/bin/env python3
"""
Get job listings from LinkedIn company pages - improved version.
Uses more robust selectors and page inspection.
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
        # Go directly to jobs page
        if company_url.endswith('/'):
            jobs_url = company_url + 'jobs/'
        else:
            jobs_url = company_url + '/jobs/'
        
        print(f"  Открываю: {jobs_url}")
        page.goto(jobs_url)
        _wait_for_linkedin_load(page)
        time.sleep(5)  # Wait longer for dynamic content
        
        # Take screenshot for debugging (optional)
        # page.screenshot(path=f"/tmp/jobs_{company_url.split('/')[-2]}.png")
        
        # Try multiple strategies to find jobs
        found_jobs = []
        
        # Strategy 1: Look for job card containers
        job_containers = page.locator('div[class*="job-card"], li[class*="job"], div[data-test-id*="job"]').all()
        print(f"  Найдено контейнеров с job: {len(job_containers)}")
        
        if len(job_containers) > 0:
            for container in job_containers[:30]:  # Limit to 30
                try:
                    # Try to find title/link
                    title_elem = container.locator('h3, h4, a[href*="/jobs/view/"], span[class*="title"]').first
                    if title_elem.count() > 0:
                        title = title_elem.inner_text().strip()
                        
                        # Find link
                        link_elem = container.locator('a[href*="/jobs/view/"]').first
                        job_url = None
                        if link_elem.count() > 0:
                            href = link_elem.get_attribute('href')
                            if href:
                                if not href.startswith('http'):
                                    job_url = f"https://www.linkedin.com{href}"
                                else:
                                    job_url = href
                        
                        # Find location
                        location = ""
                        location_selectors = [
                            'span[class*="location"]',
                            'span[class*="job-location"]',
                            'div[class*="location"]',
                        ]
                        for loc_sel in location_selectors:
                            loc_elem = container.locator(loc_sel).first
                            if loc_elem.count() > 0:
                                location = loc_elem.inner_text().strip()
                                break
                        
                        if title and len(title) > 3:  # Valid title
                            found_jobs.append({
                                'title': title,
                                'url': job_url or '',
                                'location': location,
                            })
                except Exception as e:
                    continue
        
        # Strategy 2: Look for all job links on page
        if len(found_jobs) == 0:
            print("  Стратегия 1 не сработала, пробую стратегию 2...")
            job_links = page.locator('a[href*="/jobs/view/"]').all()
            print(f"  Найдено ссылок на вакансии: {len(job_links)}")
            
            seen_titles = set()
            for link in job_links[:30]:
                try:
                    href = link.get_attribute('href')
                    if href:
                        if not href.startswith('http'):
                            job_url = f"https://www.linkedin.com{href}"
                        else:
                            job_url = href
                        
                        title = link.inner_text().strip()
                        if not title:
                            # Try to get title from parent or nearby
                            parent = link.locator('..').first
                            title = parent.inner_text().strip()[:100]
                        
                        if title and len(title) > 3 and title not in seen_titles:
                            seen_titles.add(title)
                            found_jobs.append({
                                'title': title,
                                'url': job_url,
                                'location': '',
                            })
                except Exception:
                    continue
        
        # Strategy 3: Parse page HTML for job data
        if len(found_jobs) == 0:
            print("  Стратегия 2 не сработала, пробую стратегию 3...")
            page_content = page.content()
            import re
            
            # Look for job IDs in URLs
            job_ids = re.findall(r'/jobs/view/(\d+)', page_content)
            print(f"  Найдено ID вакансий в HTML: {len(set(job_ids))}")
            
            for job_id in list(set(job_ids))[:20]:
                job_url = f"https://www.linkedin.com/jobs/view/{job_id}/"
                # Try to find title near this ID
                pattern = rf'jobs/view/{job_id}[^>]*>([^<]+)'
                matches = re.findall(pattern, page_content)
                title = matches[0].strip() if matches else f"Job {job_id}"
                
                found_jobs.append({
                    'title': title,
                    'url': job_url,
                    'location': '',
                })
        
        return {
            'success': True,
            'company_url': company_url,
            'jobs_count': len(found_jobs),
            'jobs': found_jobs
        }
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return {
            'success': False,
            'company_url': company_url,
            'error': str(e),
            'error_details': error_details,
            'jobs': []
        }

# Main execution
if __name__ == "__main__":
    companies = [
        "https://www.linkedin.com/company/barcrest-games",
        "https://www.linkedin.com/company/epicwinglobal",
    ]
    
    print("🔍 Собираю информацию о вакансиях (улучшенная версия)...\n")
    
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
                    if result['jobs_count'] > 0:
                        for j, job in enumerate(result['jobs'][:3], 1):
                            print(f"    {j}. {job['title']}")
                else:
                    print(f"  ❌ Ошибка: {result.get('error', 'Unknown')}")
                
                if i < len(companies):
                    time.sleep(3)
            
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
                    f.write("*Примечание: Возможно, компания не публикует вакансии через LinkedIn или страница Jobs недоступна.*\n\n")
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
