# Commons set-up guide

Commons shows how your company uses Claude Cowork and Claude Code:

- what kind of work people do with Claude;
- which skills and connectors they use;
- which jobs keep coming up that nobody has a skill for yet.

It is a Claude plugin plus a small server with a dashboard.

You can set it up in one of two ways:

| | **A. Hosted** | **B. Self-hosted** |
|---|---|---|
| Who runs the server | We do | You do, on your own Vercel and Postgres |
| Where your data is stored | Our database (see "What we store") | Only your database |
| Time to set up | About 10 minutes | About 45 minutes |
| What you need | A Claude Team or Enterprise Owner | That, plus GitHub, Vercel, a Postgres database and a Sarvam API key |

In both cases, a Claude **Owner** in your company does the steps in Claude. Employees don't install anything.

---

## A. Hosted: use our server

### What you receive from us
- **Dashboard address:** https://commons-adoption.vercel.app/login
- **Organization ID**, for example `aviha-9wf0`
- **Dashboard password**, sent separately
- **Org token**, which starts with `cmn_`. It lets Claude send data to your organization only, and it can't read anything.

### Steps
1. **Sign in** at https://commons-adoption.vercel.app/login with your organization ID and password.
   Change the password under **Settings › Dashboard password**.
2. **Download your plugin.** On **Settings**, paste your org token and click **Download plugin (.zip)**.
   The file has your org token built in. Keep it inside your company.
3. **Allow Commons on the network.** In Claude, go to **Organization settings › Capabilities** and add
   `commons-adoption.vercel.app` to the allowed domains. Cowork blocks sites that aren't on this list.
4. **Add the plugin for everyone.** Go to **Organization settings › Plugins › Add › Upload plugin**, choose the
   .zip, then set the plugin's default access to **Required**.
5. **(Optional) Turn on monitoring** to see who uses Claude, plus tokens and cost.
   Go to **Admin settings › Cowork › Monitoring** and enter:
   - OTLP endpoint: `https://commons-adoption.vercel.app`
   - OTLP protocol: `http/json`
   - OTLP headers: `Authorization=Bearer <your org token>`

   If you skip this step, Commons stays anonymous: it shows skills, tasks and kinds of work, but no names.
6. **Test it.** Quit and reopen the Claude app, then start a **new** Cowork task.
   - Do one real piece of work that creates a file.
   - Then run `/commons:my-usage`.
   - Open **Live events** on the dashboard. Events should appear within a minute.
   - The session appears on **Analytics** about 2 minutes later.

### What we store
| Stored | How long |
|---|---|
| The text of each prompt people send to Claude | **30 days**, then deleted. Used only to label the kind of work. |
| Labels for each session: a category ("Claims handling"), a task ("Draft claim replies") and a one-line summary | While you use Commons |
| Names of the skills, connectors and tools Claude used | While you use Commons |
| The file type of files Claude created, for example `.docx` (not the file name or contents) | While you use Commons |
| Session ID and timestamps | While you use Commons |
| **Only with monitoring on:** email, Claude model, tokens and estimated cost | While you use Commons |
| Skills people choose to share with `/commons:share-skill` | Until an admin reviews or deletes them |

**Never stored:** Claude's replies, file contents, file names and paths, tool outputs, folder paths.
If monitoring sends any of these, the server drops them as soon as they arrive.

**Who processes the data:**
- **Vercel** (server, Singapore region)
- **Neon** (Postgres database, Singapore region)
- **Sarvam AI** (India): prompts are sent here to produce the labels.

Only your admins can sign in to your dashboard, and each organization sees only its own data. To delete all your
data, ask us: deleting your organization removes every row linked to it.

---

## B. Self-hosted: run your own server

Everything stays in your own accounts. You need:
- a **GitHub** account;
- a **Vercel** account (Pro for business use);
- a **Postgres database** (Neon from the Vercel Marketplace is easiest);
- a **Sarvam API key** from https://dashboard.sarvam.ai.

### Steps
1. **Fork** https://github.com/Prince-sharma/commons into your GitHub account.
   Keep it public, so your server can read the plugin files.
2. **Create a Vercel project** from your fork. Set **Root Directory** to `server`.
3. **Add a database:** in the project, go to **Storage › Neon › Create** and connect it. This sets `DATABASE_URL`.
4. **Set environment variables** (Production):

   | Name | Value |
   |---|---|
   | `SESSION_SECRET` | A long random string |
   | `SUPERADMIN_PASSWORD` | A strong password, used to create your organization |
   | `CRON_SECRET` | A long random string |
   | `SARVAM_API_KEY` | Your Sarvam key |
   | `COMMONS_PLUGIN_REPO` | `<your-github-name>/commons` |
   | `SARVAM_MODEL` and `SARVAM_BASE_URL` | Only if your Sarvam key has no beta access: `sarvam-105b` and `https://api.sarvam.ai/v1` |

   Optional: change `regions` in `server/vercel.json` to the region closest to you, and use the same region for the database.
5. **Deploy.** The database tables are created automatically.
   Check that `https://<your-app>.vercel.app/api/health` returns OK.
6. **Create your organization.** Open `https://<your-app>.vercel.app/setup` and sign in with `SUPERADMIN_PASSWORD`.
   Create the organization, then save the organization ID, password and org token it shows you. They are shown once.
7. **Continue with steps 1–6 of the hosted guide (A)**, replacing `commons-adoption.vercel.app` with your own address
   everywhere: sign in, download the plugin, allow the domain, upload, optionally turn on monitoring, test.

### Let Claude do it for you
Open **Claude Code** on a computer that has `git`, the GitHub CLI (`gh`) and the Vercel CLI (`vercel`) installed and
signed in. Then paste this:

```text
Set up a self-hosted Commons server for our company from https://github.com/Prince-sharma/commons.
Read the repo's README ("Option 2: self-host") and docs/SETUP.md (section B) first, then:

1. Fork the repo to our GitHub account with gh (keep it public) and clone the fork.
2. Ask me which region we want. Set "regions" in server/vercel.json to the matching Vercel region,
   then commit and push.
3. Create a Vercel project from the fork with Root Directory "server" and link it.
4. Add a Neon Postgres database through the Vercel Marketplace in the same region and connect it,
   so DATABASE_URL is set.
5. Set these Production environment variables:
   - SESSION_SECRET and CRON_SECRET: generate long random strings.
   - SUPERADMIN_PASSWORD: generate a strong one.
   - SARVAM_API_KEY: ask me for it.
   - COMMONS_PLUGIN_REPO: <our-github-name>/commons.
   Ask me whether our Sarvam key has beta model access. If not, also set
   SARVAM_MODEL=sarvam-105b and SARVAM_BASE_URL=https://api.sarvam.ai/v1.
   Never print secret values in the chat. Save them to a local file only I can read, and tell me where it is.
6. Deploy to production. Check that /api/health returns OK.
7. Give me the server address and these next steps: sign in at /setup with SUPERADMIN_PASSWORD, create our
   organization, then follow docs/SETUP.md section A from step 1, using our address.

Ask me before anything that costs money or that I need to approve in a browser.
```

---

## If something doesn't work

| What you see | What to do |
|---|---|
| No plugin events on Live events | Check that the domain is allowed (step 3) and the plugin is Required. Then start a **new** Cowork task. |
| `/commons:my-usage` says "CONNECT tunnel failed" or "403" | The domain isn't allowed yet (step 3). |
| Monitoring events arrive but plugin events don't | Same as above: the domain isn't allowed, or the plugin isn't on. |
| "Matched to a person" stays at 0 with monitoring on | Analytics still works, just without names. Tell us and send a screenshot. |
| Sessions never get a category | The server's Sarvam key is missing or wrong (self-hosted), or wait 2 minutes and refresh. |
