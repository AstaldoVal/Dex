#!/usr/bin/env python3
"""
Collect job listings from ALL companies we followed (Game Providers list).
Output: single digest file with jobs per company.
"""

import sys
import os
import json
import time
import re
from datetime import datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'core', 'mcp'))

from linkedin_server import sync_playwright, _get_browser_context, _wait_for_linkedin_load, _is_logged_in, _save_context_state

def get_company_jobs(page, company_url):
    """Extract job listings from company LinkedIn Jobs page."""
    try:
        jobs_url = company_url.rstrip('/') + '/jobs/'
        page.goto(jobs_url, timeout=30000)
        _wait_for_linkedin_load(page)
        time.sleep(4)

        found_jobs = []

        # Strategy 1: job card containers
        job_containers = page.locator('div[class*="job-card"], li[class*="job"], div[data-test-id*="job"]').all()
        if len(job_containers) > 0:
            for container in job_containers[:30]:
                try:
                    title_elem = container.locator('h3, h4, a[href*="/jobs/view/"], span[class*="title"]').first
                    if title_elem.count() > 0:
                        title = title_elem.inner_text().strip()
                        link_elem = container.locator('a[href*="/jobs/view/"]').first
                        job_url = None
                        if link_elem.count() > 0:
                            href = link_elem.get_attribute('href')
                            job_url = f"https://www.linkedin.com{href}" if href and not href.startswith('http') else href
                        location = ""
                        for loc_sel in ['span[class*="location"]', 'span[class*="job-location"]']:
                            le = container.locator(loc_sel).first
                            if le.count() > 0:
                                location = le.inner_text().strip()
                                break
                        if title and len(title) > 3:
                            found_jobs.append({'title': title, 'url': job_url or '', 'location': location})
                except Exception:
                    continue

        # Strategy 2: all job links
        if len(found_jobs) == 0:
            job_links = page.locator('a[href*="/jobs/view/"]').all()
            seen = set()
            for link in job_links[:30]:
                try:
                    href = link.get_attribute('href')
                    if not href:
                        continue
                    job_url = f"https://www.linkedin.com{href}" if not href.startswith('http') else href
                    title = link.inner_text().strip()
                    if not title:
                        try:
                            title = link.locator('..').first.inner_text().strip()[:100]
                        except Exception:
                            title = "Job"
                    if title and len(title) > 2 and title not in seen:
                        seen.add(title)
                        found_jobs.append({'title': title, 'url': job_url, 'location': ''})
                except Exception:
                    continue

        # Strategy 3: job IDs from HTML
        if len(found_jobs) == 0:
            content = page.content()
            job_ids = re.findall(r'/jobs/view/(\d+)', content)
            for jid in list(dict.fromkeys(job_ids))[:20]:
                job_url = f"https://www.linkedin.com/jobs/view/{jid}/"
                found_jobs.append({'title': f"Job {jid}", 'url': job_url, 'location': ''})

        return {'company_url': company_url, 'jobs_count': len(found_jobs), 'jobs': found_jobs}
    except Exception as e:
        return {'company_url': company_url, 'jobs_count': 0, 'jobs': [], 'error': str(e)}


def load_followed_companies(vault_path):
    """Load list of company URLs we followed (from subscription_results + 100hp-gaming)."""
    results_path = os.path.join(vault_path, '.claude', 'linkedin', 'subscription_results.json')
    with open(results_path, 'r') as f:
        data = json.load(f)
    urls = [r['url'] for r in data['results'] if r.get('status') == 'followed']
    # Normalize: strip query and trailing slash for consistency
    normalized = []
    for u in urls:
        u = u.split('?')[0].rstrip('/')
        if u not in normalized:
            normalized.append(u)
    # Add 100HP Gaming (first we followed manually)
    first = 'https://www.linkedin.com/company/100hp-gaming'
    if first not in normalized:
        normalized.insert(0, first)
    return normalized


def main():
    vault_path = os.environ.get('VAULT_PATH', os.path.dirname(os.path.dirname(__file__)))
    companies = load_followed_companies(vault_path)
    delay_seconds = 8
    save_every = 10
    digests_dir = os.path.join(vault_path, '00-Inbox', 'Job_Search', 'digests')
    os.makedirs(digests_dir, exist_ok=True)
    partial_path = os.path.join(vault_path, '.claude', 'linkedin', 'jobs_digest_partial.json')
    digest_path = os.path.join(digests_dir, f"linkedin-jobs-digest-all-companies-{datetime.now().strftime('%Y-%m-%d')}.md")

    print(f"📋 Всего компаний для проверки: {len(companies)}")
    print(f"⏱️  Задержка между компаниями: {delay_seconds} сек. Оценка времени: {len(companies) * delay_seconds / 60:.0f} мин.\n")

    all_results = []

    with sync_playwright() as playwright:
        context = _get_browser_context(playwright, headless=False)
        page = context.new_page()
        try:
            page.goto('https://www.linkedin.com/feed', timeout=60000)
            _wait_for_linkedin_load(page)
            if not _is_logged_in(page):
                print("❌ Не залогинен в LinkedIn")
                sys.exit(1)
            print("✅ Вход подтверждён\n")

            for i, company_url in enumerate(companies, 1):
                company_slug = company_url.split('/company/')[-1].replace('-', ' ').title()
                print(f"[{i}/{len(companies)}] {company_slug}")
                result = get_company_jobs(page, company_url)
                all_results.append(result)
                print(f"  Вакансий: {result['jobs_count']}")

                if i % save_every == 0:
                    with open(partial_path, 'w') as f:
                        json.dump({'last_index': i, 'total': len(companies), 'results': all_results}, f, indent=2, ensure_ascii=False)
                    _save_context_state(context)
                    print(f"  💾 Промежуточное сохранение ({i}/{len(companies)})")

                if i < len(companies):
                    time.sleep(delay_seconds)

            _save_context_state(context)
        except KeyboardInterrupt:
            print("\n⚠️ Прервано. Сохраняю промежуточные результаты...")
            with open(partial_path, 'w') as f:
                json.dump({'last_index': len(all_results), 'total': len(companies), 'results': all_results}, f, indent=2, ensure_ascii=False)
        finally:
            context.close()

    # Build digest markdown
    total_jobs = sum(r['jobs_count'] for r in all_results)
    companies_with_jobs = [r for r in all_results if r['jobs_count'] > 0]

    with open(digest_path, 'w', encoding='utf-8') as f:
        f.write("# Дайджест вакансий: компании из Game Providers (LinkedIn)\n\n")
        f.write(f"**Дата:** {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n")
        f.write(f"Проверены страницы Jobs у всех компаний, на которые подписались из списка iGaming провайдеров.\n\n")
        f.write(f"- **Компаний проверено:** {len(all_results)}\n")
        f.write(f"- **Компаний с вакансиями:** {len(companies_with_jobs)}\n")
        f.write(f"- **Всего вакансий:** {total_jobs}\n\n")
        f.write("---\n\n")

        # Companies WITH jobs first
        f.write("## Компании с открытыми вакансиями\n\n")
        for r in companies_with_jobs:
            name = r['company_url'].split('/company/')[-1].replace('-', ' ').title()
            f.write(f"### {name}\n\n")
            f.write(f"**LinkedIn:** {r['company_url']}\n\n")
            f.write(f"**Вакансий:** {r['jobs_count']}\n\n")
            for job in r['jobs']:
                f.write(f"- **{job['title']}**")
                if job.get('location'):
                    f.write(f" — {job['location']}")
                f.write("\n")
                if job.get('url'):
                    f.write(f"  [Открыть]({job['url']})\n")
            f.write("\n")
        f.write("---\n\n")

        # Companies with no jobs (short list)
        f.write("## Компании без вакансий на данный момент\n\n")
        no_jobs = [r for r in all_results if r['jobs_count'] == 0]
        for r in no_jobs:
            name = r['company_url'].split('/company/')[-1].replace('-', ' ').title()
            f.write(f"- {name}: {r['company_url']}\n")
        f.write("\n---\n\n")
        f.write(f"*Собрано автоматически. Всего компаний: {len(all_results)}, вакансий: {total_jobs}.*\n")

    print(f"\n✅ Дайджест сохранён: {digest_path}")
    print(f"📊 Компаний с вакансиями: {len(companies_with_jobs)}, всего вакансий: {total_jobs}")


if __name__ == '__main__':
    main()
