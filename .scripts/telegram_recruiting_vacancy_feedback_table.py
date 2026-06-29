#!/usr/bin/env python3
"""
Из Telegram_Recruiting_personal_live_*.json — только таблица:
рекрутер | кратко вакансия | итоговый фидбэк (эвристика по последним сообщениям).

Перезаписывает MD дайджеста; полные чаты в MD не попадают.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
IN_JSON = REPO_ROOT / "00-Inbox" / "Job_Search" / "Telegram_Recruiting_personal_live_2026-04-19.json"
OUT_MD = REPO_ROOT / "00-Inbox" / "Job_Search" / "Telegram_Recruiting_Personal_Chats_Vacancies_Feedback_Digest_2026-04-19.md"

# Закрыли не на вас (часто путается с «оффер вам»)
RE_CLOSED_OTHER = re.compile(
    r"кандидат[аы]?\s+нашли|кандидат\s+на\s+оффер|на\s+оффері.{0,40}перемов|"
    r"вакансия\s+закрыт|позици[юя]\s+закрыт|роль\s+закрыт|"
    r"position\s+(is\s+)?closed|filled\s+the\s+role|found\s+a\s+candidate|"
    r"already\s+hired|оффер\s+подписали.{0,80}(спасибо|thank)",
    re.I | re.DOTALL,
)
RE_REJECT = re.compile(
    r"отказ|отклон|declin|unfortunately|не\s+подош|выбрали\s+друг|not\s+selected|"
    r"won'?t\s+be\s+moving|про\s+другого\s+кандидат|на\s+этот\s+раз|"
    r"move\s+forward\s+with\s+another|regret\s+to\s+inform|"
    r"к\s+сожалению.{0,50}(не\s+готов|не\s+продолж|не\s+подх|не\s+видим)|"
    r"на\s+жаль.{0,120}(не\s+можемо|не\s+маємо|немаємо|відмов|не\s+готов|"
    r"не\s+можем\s+запропонувати|рухатись\s+далі)",
    re.I | re.DOTALL,
)
# Короткие сообщения рекрутера — длинные посты с «оффер» в маркетинге отсекаем
RE_OFFER = re.compile(
    r"\bcongratul|welcome\s+to\s+the\s+team|рады\s+пригласить|"
    r"подписывай|контракт\s+готов|happy\s+to\s+extend|"
    r"\bwe\s+are\s+pleased\s+to\s+offer\b|\bhere\s+is\s+your\s+offer\b",
    re.I,
)
RE_OFFER_SHORT = re.compile(r"\bоффер\b|\boffer\b", re.I)
RE_INTERVIEW = re.compile(
    r"interview|интервью|собесед|zoom\.us|meet\.google|teams\.microsoft|calendly|"
    r"google\s+meet|созвон(имся)?|встреч[аеи]",
    re.I,
)
RE_JD_HINT = re.compile(
    r"PM|Product\s+Manager|продукт|менеджер|Manager|ваканс|position|remote|iGaming|"
    r"Senior|Middle|contract|зарплат|salary|\$|€|оплата|full[\s-]?time|part[\s-]?time|"
    r"Product\s+Owner|\bPO\b",
    re.I,
)
# Просьба прислать CV без описания роли — не «вакансия»
RE_RESUME_SCREENING = re.compile(
    r"пришлите.{0,40}резюме|send.{0,20}resume|ваш(е)?\s+резюме|your\s+cv|share.{0,15}cv",
    re.I,
)
# Коммерция / инфра вместо роли
RE_B2B_PITCH = re.compile(
    r"платёжн|платежн|инфраструктур|maxpay|крипто.{0,20}плат|буст\s+платеж|"
    r"payment\s+gateway|clients?\s+and",
    re.I,
)
# Явный ответ по треку PM + редирект на другую роль
# Не рекрутинговый отказ по вакансии
RE_SCAM_OR_NON_RECRUIT = re.compile(
    r"правил[ае]\s+проекта|ваш\s+куратор|успешн.{0,20}собесед|матч[\s-]*мейк|"
    r"заработ[а-яa-z]{0,15}\s+в\s+телеграм",
    re.I,
)

RE_PM_NOT_HIRING_REDIRECT = re.compile(
    r"по\s+pm.{0,160}не.{0,8}розгляд|не\s+розглядаємо.{0,100}\bpm\b|"
    r"pm.{0,50}не\s+наймаємо|not\s+hiring.{0,40}\bPM\b|no\s+new\s+.{0,20}\bPM\b",
    re.I,
)


def shorten(s: str, n: int = 160) -> str:
    t = " ".join(s.split())
    if len(t) <= n:
        return t
    return t[: n - 1] + "…"


def _looks_like_reject_or_closure(text: str) -> bool:
    t = text.lower()
    if RE_REJECT.search(text) or RE_CLOSED_OTHER.search(text):
        return True
    if "на жаль" in t and ("не " in t or "немож" in t):
        return True
    if "к сожалению" in t and "не " in t:
        return True
    return False


def pick_vacancy(msgs: list[dict]) -> tuple[str, int | None]:
    incoming = [m for m in msgs if not m["out"] and len(m.get("text") or "") > 35]
    incoming = [m for m in incoming if not _looks_like_reject_or_closure(m["text"])]

    if not incoming:
        any_long = [m for m in msgs if len(m.get("text") or "") > 80]
        any_long = [m for m in any_long if not _looks_like_reject_or_closure(m["text"])]
        if not any_long:
            return "— (в окне нет развёрнутого описания роли)", None
        m = max(any_long, key=lambda x: len(x["text"]))
        return shorten(m["text"]), m.get("id")

    best = None
    best_score = -1
    for m in incoming:
        text = m["text"]
        score = len(text)
        if RE_JD_HINT.search(text):
            score += 400
        if "t.me/" in text:
            score += 250
        if score > best_score:
            best_score = score
            best = m
    assert best is not None
    return shorten(best["text"]), best.get("id")


def _from_recruiter(m: dict) -> bool:
    return not m.get("out")


def classify_feedback(msgs: list[dict]) -> tuple[str, str, str | None, int | None]:
    """Итог по последнему по времени явному сигналу (от новых к старым).
    Возвращает (лейбл, выдержка, дата ISO сообщения рекрутера, id сообщения)."""
    chrono = sorted(msgs, key=lambda m: m.get("date") or "")

    def _hit(label: str, excerpt: str, src: dict) -> tuple[str, str, str | None, int | None]:
        return label, excerpt, src.get("date"), src.get("id")

    for m in reversed(chrono):
        if not _from_recruiter(m):
            continue
        text = m.get("text") or ""
        if RE_PM_NOT_HIRING_REDIRECT.search(text):
            return _hit(
                "По PM сейчас не берут новых кандидатов; в том же сообщении — другая роль/локация",
                shorten(text, 160),
                m,
            )
        if RE_CLOSED_OTHER.search(text):
            return _hit("Вакансия закрыта (нашли другого / оффер не вам)", shorten(text, 140), m)
        if RE_REJECT.search(text):
            return _hit("Отказ / не двигаемся дальше", shorten(text, 140), m)
        if len(text) <= 900 and RE_OFFER.search(text):
            return _hit("Оффер / позитивный финал", shorten(text, 140), m)
        if len(text) <= 350 and RE_OFFER_SHORT.search(text):
            return _hit("Оффер / позитивный финал", shorten(text, 140), m)

    # Созвон — только от рекрутера (иначе «собеседуюсь к ним» в вашем тексте даёт ложноположительные)
    for m in reversed(chrono):
        if not _from_recruiter(m):
            continue
        text = m.get("text") or ""
        if RE_INTERVIEW.search(text):
            return _hit("Интервью / созвон (в переписке)", shorten(text, 140), m)

    has_in = any(not m["out"] for m in chrono)
    has_out = any(m["out"] for m in chrono)
    if has_in and has_out:
        return "Переписка без явного итога в окне сообщений", "—", None, None
    if has_in and not has_out:
        return "Со стороны рекрутера были сообщения, ответа в окне нет", "—", None, None
    if not has_in and has_out:
        return "Только ваши сообщения в окне", "—", None, None
    return "Нет текстовых сообщений в окне", "—", None, None


def refine_vacancy_and_feedback(
    vac: str, mid: int | None, msgs: list[dict], fb: str, fb_note: str, fb_date: str | None, fb_mid: int | None
) -> tuple[str, int | None, str, str, str | None, int | None]:
    """Если в колонке «вакансия» по сути нет роли — не выдавать за итог отбора."""
    if RE_B2B_PITCH.search(vac) and not RE_JD_HINT.search(vac):
        return (
            "— (не описание вакансии: коммерческое / партнёрское предложение)",
            mid,
            "Не фидбэк по отбору на роль",
            "—",
            None,
            None,
        )
    if len(vac) < 240 and RE_RESUME_SCREENING.search(vac) and not RE_JD_HINT.search(vac):
        return (
            "— (в окне только запрос резюме / скрининг, без описания вакансии)",
            mid,
            "Нет итога по заявке — первичный контакт",
            "—",
            None,
            None,
        )
    return vac, mid, fb, fb_note, fb_date, fb_mid


def has_substantive_user_application(msgs: list[dict]) -> bool:
    """В окне есть ваша подача: не одиночное «ок», а смысловой отклик или переписка после него."""
    outs = [m for m in msgs if m.get("out")]
    if not outs:
        return False
    if max(len((m.get("text") or "").strip()) for m in outs) >= 48:
        return True
    total = sum(len((m.get("text") or "").strip()) for m in outs)
    if total >= 90 and len(outs) >= 2:
        return True
    joined = " ".join((m.get("text") or "").lower() for m in outs)
    if any(
        k in joined
        for k in (
            "резюме",
            "cv",
            "опыт",
            "experience",
            "отклик",
            "подхожу",
            "релевант",
            "linkedin",
            "портфолио",
            "готов обсуд",
        )
    ):
        return True
    return False


def is_negative_recruiter_feedback_on_application(fb: str) -> bool:
    """Только отказ или закрытие вакансии не на вас — итог по отбору."""
    return fb.startswith("Отказ /") or fb.startswith("Вакансия закрыта (")


def looks_like_scam_or_non_job_thread(msgs: list[dict]) -> bool:
    for m in msgs:
        if m.get("out"):
            continue
        if RE_SCAM_OR_NON_RECRUIT.search(m.get("text") or ""):
            return True
    return False


def row_link(username: str | None, uid: int, msg_id: int | None) -> str:
    if username and msg_id:
        return f"https://t.me/{username}/{msg_id}"
    if username:
        return f"https://t.me/{username}"
    return f"tg://user?id={uid}"


def date_for_message_id(msgs: list[dict], msg_id: int | None) -> str | None:
    if msg_id is None:
        return None
    for m in msgs:
        if m.get("id") == msg_id:
            return m.get("date")
    return None


def format_dt(iso: str | None) -> str:
    """Короткая дата для таблицы (из ISO)."""
    if not iso:
        return "—"
    # 2026-04-14T12:35:55+00:00 -> 2026-04-14 12:35 UTC
    try:
        if "T" in iso:
            d, rest = iso.split("T", 1)
            t = rest.replace("+00:00", "").replace("Z", "")[:5]
            return f"{d} {t} UTC"
        return iso[:16]
    except Exception:
        return iso[:19]


def main() -> None:
    if not IN_JSON.exists():
        print(f"Missing {IN_JSON}", file=sys.stderr)
        sys.exit(1)
    data = json.loads(IN_JSON.read_text(encoding="utf-8"))
    chats: list[dict] = data.get("chats") or []
    built = data.get("built_at_utc", "")

    lines: list[str] = []
    lines.append("# Дайджест Recruiting: отказ или «закрыли не на вас» после вашей подачи")
    lines.append("")
    lines.append(f"- **Данные:** выгрузка `{IN_JSON.name}` (UTC **{built}**).")
    lines.append(
        "- **Критерий строки:** в окне есть **ваша подача** (смысловой отклик или набор сообщений от вас) **и** от рекрутера — "
        "**отказ** либо **вакансия закрыта на другого**. Остальные чаты в этот файл не попадают."
    )
    lines.append(
        "- **Ограничение:** эвристика по тексту последних ~55 сообщений; при сомнении смотрите чат по ссылке. "
        f"Полный список диалогов: `{IN_JSON.name}`."
    )
    lines.append(
        "- **Даты:** колонки **Дата (вакансия)** и **Дата (фидбэк)** — время сообщения рекрутера в Telegram (как в JSON, UTC)."
    )
    lines.append("")
    lines.append("## Таблица")
    lines.append("")
    lines.append(
        "| Рекрутер | Вакансия (кратко) | Дата (вакансия) | Фидбэк рекрутера | Дата (фидбэк) | Ссылки |"
    )
    lines.append("|----------|-------------------|-----------------|------------------|---------------|--------|")

    rows_out: list[str] = []
    n_kept = 0
    for c in sorted(chats, key=lambda x: (x.get("title") or "").lower()):
        title = (c.get("title") or "Unknown").replace("|", "\\|")
        un = c.get("username")
        uid = c.get("id")
        msgs = c.get("messages") or []
        vac, mid = pick_vacancy(msgs)
        fb, fb_note, fb_date, fb_mid = classify_feedback(msgs)
        vac, mid, fb, fb_note, fb_date, fb_mid = refine_vacancy_and_feedback(
            vac, mid, msgs, fb, fb_note, fb_date, fb_mid
        )

        if not is_negative_recruiter_feedback_on_application(fb):
            continue
        if not has_substantive_user_application(msgs):
            continue
        if looks_like_scam_or_non_job_thread(msgs):
            continue

        vac_esc = vac.replace("|", "\\|")
        vac_d = format_dt(date_for_message_id(msgs, mid))
        fb_d = format_dt(fb_date)
        fb_cell = fb.replace("|", "\\|")
        if fb_note and fb_note != "—":
            fb_cell += f" — _{fb_note.replace('|', '\\|')}_"
        link_v = row_link(un, uid, mid)
        link_f = row_link(un, uid, fb_mid)
        links = f"[вакансия]({link_v}) · [фидбэк]({link_f})" if fb_mid and fb_mid != mid else f"[открыть]({link_v})"
        un_disp = f"@{un}" if un else f"`{uid}`"
        rows_out.append(
            f"| **{title}** ({un_disp}) | {vac_esc} | {vac_d} | {fb_cell} | {fb_d} | {links} |"
        )
        n_kept += 1

    if not rows_out:
        rows_out.append(
            "| — | — | — | Ни одна строка не прошла фильтр (нет пары «ваша подача» + отказ/закрыли не на вас) в этом окне сообщений. | — | — |"
        )

    lines.extend(rows_out)

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append(f"_Сгенерировано скриптом `.scripts/telegram_recruiting_vacancy_feedback_table.py` относительно `{IN_JSON.name}`._")
    lines.append("")

    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT_MD} ({n_kept} отказов/закрытий из {len(chats)} чатов)")


if __name__ == "__main__":
    main()
