# Chat Reply Paid/1st SMS (Custom)

## Purpose

Enforce a strict response structure when the user asks to formulate a reply from chat history for Match Club conversations, especially for Paid and 1st SMS chats.

## Mandatory Rule (always show first)

When the user asks for a reply based on message history, ALWAYS output this short rule block first:

- `1st SMS мужчины -> логичный ответ (реакция + вопрос)`
- `потом от тебя еще 3-5 сообщений под данного мужчину (по фото, био, анкете)`
- `только потом добивы (шаблоны)`

Do not skip this block. Do not hide it.

## Output Structure

1. Rule block (exactly once, at top)
2. Message 1: logical direct reply to latest male message
3. Messages 2-6: 3-5 personalized follow-up lines for this specific man
4. Optional: 1-2 template-style nudges only after personalized sequence

## Style Constraints

- Keep each message short and natural.
- Avoid robotic wording and repeated openings.
- Use concrete hooks from the provided history (pets, city, hobbies, tone).
- Do not propose contact exchange, money asks, or explicit meeting promises.
- Keep tone playful but grounded.

## Trigger

Use this skill whenever the user asks:

- "придумай ответ"
- "сформулируй ответ по истории"
- "придумай фоллоу ап"
- any request to craft responses from a pasted message thread
