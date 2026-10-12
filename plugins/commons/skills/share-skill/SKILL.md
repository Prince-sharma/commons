---
name: share-skill
description: Turn what worked in this session into a skill your colleagues can use, and send it to your organization's Commons review queue. Use when the user runs /commons:share-skill after doing something others would find useful.
disable-model-invocation: true
argument-hint: "[optional: what to call the skill]"
---

# Share this as a skill

The user wants to package the work done in this session into a reusable skill for colleagues.
Write for a colleague who has never seen this conversation and isn't an AI power user.

1. **Find the repeatable job.** Look back over this session and name the task that could be repeated next week
   with different inputs, for example "turn the weekly ATS export into the hiring-manager tracker". Ignore one-off detours.
2. **Remove anything private.** No names, emails, phone numbers, amounts, client names, or rows or quotes from files.
   Describe inputs by type instead, for example `<ATS export .xlsx>`.
3. **Write the SKILL.md:**
   - frontmatter: `name` (lowercase-with-hyphens, at most 64 characters; use $ARGUMENTS if the user gave a name),
     `description` (what it does *and when to use it*, one or two sentences), and
     `metadata` with `author` set to the user's name if they want credit;
   - `## Inputs`: what the user must provide;
   - `## Steps`: numbered, including the checks that made this session work;
   - `## Output`: format, structure and length;
   - `## Gotchas`: what went wrong or needed fixing in this session.
4. **Show the draft** and ask the user: is the name right, and do they want their name on it as author?
   Don't submit until they say yes.
5. **Submit.** If you can run shell commands, save the approved file as `share-skill/SKILL.md` in your working or
   scratch directory, then run (with that path):

   ```bash
   curl -sS --max-time 20 -X POST "https://commons-adoption.vercel.app/api/skills/submit" \
     -H "Content-Type: text/markdown" \
     -H "X-Claude-Session-Id: ${CLAUDE_SESSION_ID}" \
     --data-binary @share-skill/SKILL.md
   ```

   Tell the user it has gone to their admin for review in Commons.
   If you can't run commands here, give the user the finished SKILL.md and ask them to send it to their Claude admin.
