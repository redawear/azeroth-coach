# Agent rules for azeroth-coach

Read `README.md` and `docs/design.md` first. They hold the decisions.

## Project facts

- Target: World of Warcraft: Forever only (client 1.60.1, interface 16001).
- `addon/` is Lua that runs in the game. It has no network and no file
  access. It must not depend on combat data (hidden by "secret values").
- `companion/` runs on the player's Windows PC. It calls the AI through the
  player's own CLI login: `claude` or `codex`, one only.
- The player tests in the game. Agents cannot run WoW on a server.

## Rules

- **Facts come from the quest data, not from the model.** Never let the AI
  name a quest, an NPC, or a position that the quest data, the wiki or
  Wowhead did not give.
- **Wowhead: one page for each question, never bulk.** Go to the page by ID
  (`/forever/quest=<id>`), never `/search` or `/list`. Use a clear user
  agent that is not a blocked AI crawler. Cite the link. Go through the
  cache. See "Wowhead rules" in `docs/design.md`.
- **Warcraft Wiki:** use the MediaWiki API with a clear user agent, go
  through the cache, and credit the wiki (CC BY-SA 4.0).
- **Token care:** tips come from triggers only. Keep the context short. Read
  the cache before any fetch.
- **Red lines:** the companion never sends input to the game and never reads
  game memory.
- **Human-facing text** (README, docs, UI text, commit messages) is in
  ASD-STE100 Simplified Technical English: short, active sentences.
- **No credentials in the repo.** Logins stay in the CLIs. Any key lives
  outside the checkout.

## Build checks

Run `npm test` and `npm run check`. See `docs/windows-test.md` for the client checks.
Set `QUESTIEDB_SOURCE` to an external QuestieDB source folder to test its real support files.
Never copy QuestieDB data into this repository.

The companion owns a private, per-run MCP server. Its only tools read wiki and Wowhead pages by allowed IDs.
The README explains how each player uses their own CLI login. No shared agent credentials are needed.

Use `inspectCodex()` in `companion/agents.js` to check the CLI restrictions.
Do not print the output of `codex mcp list --json`. It can contain bearer tokens.
The helper reads it in memory and returns only server names and feature names.
Never log raw CLI config, process environments, or source request headers.
