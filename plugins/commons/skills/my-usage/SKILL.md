---
name: my-usage
description: Show which skills and kinds of work are most used across the user's organization (or the user's own usage, if their admin turned that on), from Commons. Use when the user runs /commons:my-usage or asks what skills colleagues use.
disable-model-invocation: true
---

# Claude usage

Fetch the usage summary from Commons and show it to the user.

1. If you can run shell commands, run:

   ```bash
   curl -sS --max-time 15 "https://commons-adoption.vercel.app/api/me/usage?session=${CLAUDE_SESSION_ID}"
   ```

2. Show the result to the user as it is, in a short readable form. Don't invent numbers.
3. If it lists skills colleagues use, offer one sentence on how they could try one (in Claude: Customize › Plugins, or ask their admin).
4. If the request is blocked by the network (for example `CONNECT tunnel failed` or `403`), tell the user their admin must allow `commons-adoption.vercel.app` under Settings › Capabilities › Network egress, and stop.
5. If you can't run commands here, tell the user to open https://commons-adoption.vercel.app or ask their admin, and stop.
