#!/usr/bin/env python3
"""
Apple Reminders MCP Server for Dex

Управление приложением Напоминания (Reminders) на macOS через AppleScript.
Требует macOS и разрешение для терминала/Cursor на доступ к Reminders (Системные настройки → Конфиденциальность).

Tools:
- reminders_list_lists: список всех списков напоминаний
- reminders_list_reminders: напоминания в указанном списке (с опцией только незавершённые)
- reminders_add_reminder: добавить одно напоминание в список
- reminders_add_reminders_batch: добавить несколько напоминаний в список (одним вызовом)
- reminders_complete_reminder: отметить напоминание как выполненное по названию
"""

import asyncio
import subprocess
from typing import Optional

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Apple Reminders")


def _escape_applescript(s: str) -> str:
    """Escape string for use inside AppleScript double-quoted string."""
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").replace("\r", "")


def _run_applescript(script: str) -> tuple[bool, str]:
    """Run AppleScript and return (success, output or error)."""
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            return False, (result.stderr or result.stdout or "Unknown error").strip()
        return True, (result.stdout or "").strip()
    except subprocess.TimeoutExpired:
        return False, "AppleScript timed out"
    except FileNotFoundError:
        return False, "osascript not found (not macOS?)"
    except Exception as e:
        return False, str(e)


async def _run_applescript_async(script: str) -> tuple[bool, str]:
    """Run AppleScript in executor to avoid blocking."""
    return await asyncio.to_thread(_run_applescript, script)


@mcp.tool()
async def reminders_list_lists() -> dict:
    """
    Получить список всех списков напоминаний в Apple Reminders.
    Returns: dict with 'lists' (list of list names) and 'error' if failed.
    """
    script = '''
    tell application "Reminders"
        set listNames to name of every list
        set out to ""
        repeat with n in listNames
            set out to out & n & "\\n"
        end repeat
        return out
    end tell
    '''
    ok, out = await _run_applescript_async(script)
    if not ok:
        return {"lists": [], "error": out}
    names = [x.strip() for x in out.split("\n") if x.strip()]
    return {"lists": names}


@mcp.tool()
async def reminders_list_reminders(
    list_name: str,
    include_completed: bool = False,
) -> dict:
    """
    Получить напоминания из указанного списка.

    Args:
        list_name: название списка (например "Напоминания" или "Покупки")
        include_completed: включать ли выполненные напоминания. По умолчанию False — только активные.

    Returns: dict with 'reminders' (list of {name, completed}) and 'error' if failed.
    """
    if include_completed:
        script = f'''
        tell application "Reminders"
            set theList to list "{_escape_applescript(list_name)}"
            set out to ""
            repeat with r in (every reminder in theList)
                set c to completed of r
                set out to out & (name of r) & "\\t" & c & "\\n"
            end repeat
            return out
        end tell
        '''
    else:
        script = f'''
        tell application "Reminders"
            set theList to list "{_escape_applescript(list_name)}"
            set out to ""
            repeat with r in (every reminder in theList whose completed is false)
                set out to out & (name of r) & "\\n"
            end repeat
            return out
        end tell
        '''
    ok, out = await _run_applescript_async(script)
    if not ok:
        return {"reminders": [], "error": out}
    reminders = []
    for line in out.split("\n"):
        line = line.strip()
        if not line:
            continue
        if include_completed and "\t" in line:
            name, comp = line.split("\t", 1)
            reminders.append({"name": name.strip(), "completed": comp.strip().lower() == "true"})
        else:
            reminders.append({"name": line, "completed": False})
    return {"reminders": reminders, "list_name": list_name}


@mcp.tool()
async def reminders_add_reminder(
    list_name: str,
    title: str,
    body: Optional[str] = None,
    due_date_iso: Optional[str] = None,
) -> dict:
    """
    Добавить одно напоминание в список.

    Args:
        list_name: название списка (если нет — будет создан в iCloud по умолчанию)
        title: текст напоминания
        body: заметка (опционально)
        due_date_iso: дата/время напоминания в формате ISO (YYYY-MM-DD или YYYY-MM-DDTHH:MM), опционально

    Returns: dict with success and error message if failed.
    """
    list_esc = _escape_applescript(list_name)
    title_esc = _escape_applescript(title)
    body_esc = _escape_applescript(body or "")
    # AppleScript date from ISO: we can pass "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:00"
    due_part = ""
    if due_date_iso:
        due_iso = due_date_iso.strip().replace("T", " ").replace("Z", "")
        if len(due_iso) <= 10:
            due_iso = due_iso + " 12:00:00"
        due_part = f', due date: date "{due_iso}"'
    props = f'{{name:"{title_esc}"'
    if body_esc:
        props += f', body:"{body_esc}"'
    props += due_part + "}"
    script = f'''
    tell application "Reminders"
        set theList to list "{list_esc}"
        tell theList to make new reminder with properties {props}
        return "ok"
    end tell
    '''
    ok, out = await _run_applescript_async(script)
    if not ok:
        return {"success": False, "error": out}
    return {"success": True, "list_name": list_name, "title": title}


@mcp.tool()
async def reminders_add_reminders_batch(
    list_name: str,
    titles: list[str],
) -> dict:
    """
    Добавить несколько напоминаний в список одним вызовом.
    Удобно для списка покупок или чек-листа.

    Args:
        list_name: название списка
        titles: список строк — тексты напоминаний

    Returns: dict with success, added_count and error if failed.
    """
    if not titles:
        return {"success": True, "added_count": 0}
    list_esc = _escape_applescript(list_name)
    # Build AppleScript: repeat over titles and add each
    # We'll do one script that adds all to avoid many osascript calls
    parts = []
    for t in titles:
        t_esc = _escape_applescript(t.strip())
        if not t_esc:
            continue
        parts.append(f'"{t_esc}"')
    if not parts:
        return {"success": True, "added_count": 0}
    # AppleScript: set titles to {"a", "b", "c"} then repeat
    titles_list = ", ".join(parts)
    script = f'''
    tell application "Reminders"
        set theList to list "{list_esc}"
        set titles to {{{titles_list}}}
        repeat with t in titles
            tell theList to make new reminder with properties {{name:(contents of t)}}
        end repeat
        return "ok"
    end tell
    '''
    ok, out = await _run_applescript_async(script)
    if not ok:
        return {"success": False, "added_count": 0, "error": out}
    return {"success": True, "added_count": len(parts), "list_name": list_name}


@mcp.tool()
async def reminders_complete_reminder(
    list_name: str,
    reminder_title: str,
) -> dict:
    """
    Отметить напоминание как выполненное по точному названию.

    Args:
        list_name: название списка
        reminder_title: точный текст напоминания (как в списке)

    Returns: dict with success and error if failed.
    """
    list_esc = _escape_applescript(list_name)
    title_esc = _escape_applescript(reminder_title)
    script = f'''
    tell application "Reminders"
        set theList to list "{list_esc}"
        set theReminder to (first reminder in theList whose name is "{title_esc}")
        set completed of theReminder to true
        return "ok"
    end tell
    '''
    ok, out = await _run_applescript_async(script)
    if not ok:
        return {"success": False, "error": out}
    return {"success": True, "list_name": list_name, "completed": reminder_title}


@mcp.tool()
async def reminders_create_list(list_name: str) -> dict:
    """
    Создать новый список напоминаний, если его ещё нет.
    В Apple Reminders список создаётся при первом обращении; эта команда создаёт пустой список явно.

    Args:
        list_name: название нового списка

    Returns: dict with success and error if failed.
    """
    list_esc = _escape_applescript(list_name)
    script = f'''
    tell application "Reminders"
        if not (exists list "{list_esc}") then
            make new list with properties {{name:"{list_esc}"}}
        end if
        return "ok"
    end tell
    '''
    ok, out = await _run_applescript_async(script)
    if not ok:
        return {"success": False, "error": out}
    return {"success": True, "list_name": list_name}


if __name__ == "__main__":
    mcp.run()
