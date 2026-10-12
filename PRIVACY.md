# Commons privacy note

This note is for employees of organizations that use Commons, and for the admins who set it up.

**Who runs it.** Your organization's Commons server is run either by your organization (self-hosted) or by the
hosted Commons service on your organization's behalf. Only your organization's admins can see its dashboard.

**What reaches the server.**
- From the Commons plugin (Cowork and Claude Code): your prompts; the names of skills, connectors and tools Claude
  used; the files Claude created or edited (the server keeps only the extension, such as `.docx`); when a turn ended.
- From Claude's monitoring export (configured by your admin): your email, the session, tokens, model and estimated
  cost. Depending on your admin's settings it may also include Claude's replies, tool inputs and folder paths. Commons
  discards these on arrival.

**What is stored and for how long.**
- Prompt text: 30 days, then deleted. It is used to label the kind of work (for example "Draft follow-up emails").
- Labels, summaries, skill and connector names, file extensions, tokens and cost: while the organization uses Commons.
- Never stored: Claude's replies, file contents, file paths, tool outputs, folder paths.

**Processors.** Prompts are sent to Sarvam AI's API to produce the labels. The hosted service runs on Vercel and
Neon (Postgres) in the region chosen for your organization.

**What admins see.** Organization totals, usage levels, recurring tasks, skills ranked by use, and per-session
activity in a content-free live log. Up to three example prompts are shown for a suggested skill.

**Your own data.** `/commons:my-usage` shows you your last 7 days. Ask your admin to delete your data.
