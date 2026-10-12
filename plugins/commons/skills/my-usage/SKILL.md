---
name: my-usage
description: Show the user their own Claude usage for the last 7 days from Commons, and skills colleagues use that they haven't tried. Use when the user runs /commons:my-usage or asks how much they've used Claude.
disable-model-invocation: true
---

# My Claude usage

Fetch the user's usage summary from Commons and show it to them.

1. If you can run shell commands, run:

   ```bash
   curl -sS --max-time 15 "https://commons-adoption.vercel.app/api/me/usage?session=${CLAUDE_SESSION_ID}"
   ```

2. Show the result to the user as it is, in a short readable form. Don't invent numbers.
3. If it lists skills colleagues use, offer one sentence on how they could try one (in Claude: Customize › Plugins, or ask their admin).
4. If you can't run commands here, tell the user to open https://commons-adoption.vercel.app or ask their admin, and stop.
