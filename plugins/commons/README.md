# Commons plugin

Commons helps your organization see how Claude is used and share the skills that work.
Your admin installed this plugin; it sends usage events to your organization's Commons server.

## What it sends

| Hook | Sent | Kept |
|---|---|---|
| `UserPromptSubmit` | the prompt, session and prompt IDs | prompt text for 30 days, to label the kind of work |
| `PostToolUse` / `PostToolUseFailure` (skills, connectors, file edits) | the tool call | the skill or connector name and the file **extension** only. File contents and paths are dropped on arrival |
| `Stop` | that Claude finished a turn | the timestamp |

Your name and email come from Claude's monitoring export, which your admin configures.
Claude's replies, file contents, file paths and tool outputs are never stored.

## What it adds

- `/commons:my-usage`: your own usage for the last 7 days, and skills colleagues use.
- `/commons:share-skill`: turns this session into a skill and sends it to your admin for review.

Plain claude.ai chat doesn't run plugin hooks; only Cowork and Claude Code sessions are counted.
