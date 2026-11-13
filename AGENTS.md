# Agent rules for azeroth-coach

Read `README.md` and `docs/design.md` first. They hold the decisions.

## Project facts

- Target: World of Warcraft: Forever only (client 1.60.1, interface 16001).
- `addon/` is Lua that runs in the game. It has no network and no file
  access. It must not depend on combat data (hidden by "secret values").
- `companion/` runs on the player's Windows PC. It calls the AI through the
  player's own `claude` and `codex` CLI logins.
- The player tests in the game. Agents cannot run WoW on a server.

## Rules

- **Facts come from the quest data, not from the model.** Never let the AI
  name a quest, an NPC, or a position that the data or the wiki did not give.
- **Never fetch Wowhead with an agent or a script.** Its `robots.txt` blocks
  AI agents. Give the player a Wowhead link instead.
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
