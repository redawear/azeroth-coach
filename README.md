# Azeroth Coach

A quest coach and an AI chat for **World of Warcraft: Forever**.
Private build for Reda and friends. Target: client 1.60.1, interface 16001.

The full build is ready for its first Windows test. Automated checks pass on Linux.
No part has run in the Forever client yet.

The coach shows one quiet tip below the quest tracker. It has no box or sound.
It hides in combat and when no tip or route exists. Shift-drag the header to move it.
Click a tip to ask about it. Right-click for routes, pause, and other options.

The addon works without AI. The separate **QuestieDB** addon supplies the quest facts.
The Windows companion adds Claude or Codex through your own CLI login.
It uses one provider at a time. It never sends game input or reads game memory.

## Install on Windows

1. Install [Node.js](https://nodejs.org/) 22.16 or later. Node 24 is recommended.
2. Install [QuestieDB](https://github.com/Questie/QuestieDB/releases) in the Forever AddOns folder.
   Use its Forever release with API contract 4. We do not bundle its data.
3. Install `claude` or `codex`. Run it in a terminal and sign in with your own account.
4. Clone this repository. Open a terminal in it and run:

   ```powershell
   npm ci
   npm run setup
   ```

5. Close the game fully. Start it again in windowed or borderless mode.
6. Run `npm start`. Keep the game in the foreground and its top-left corner visible.
7. Run `/coach doctor`, then `/coach ping` in the game. Open the chat with `/coach`.

Setup asks for the client path and provider. You can also pass them:

```powershell
npm run setup -- --client "C:\Games\World of Warcraft\_forever_" --provider claude
```

Setup creates 200 reply addons. Leave them enabled. The game indexes them only at launch.
When all slots are used, type `/reload`. The companion creates no new addon folders during play.
The [Windows test guide](docs/windows-test.md) covers the first session and error checks.

## Settings

Runtime files live in `%LOCALAPPDATA%\AzerothCoach\`. The logins stay in the CLIs.
The folder holds `config.json`, `cache.sqlite`, `state.json`, and the companion log.
Setup also makes a `Start Azeroth Coach.cmd` file there.
Do not put credentials in this repository.

Edit `config.json` to change the provider, model, effort, or limits. Restart after a provider change.
The companion reads job settings again for each request. Example:

```json
{
  "provider": "claude",
  "jobs": {
    "coach": { "model": "sonnet", "effort": "low", "timeout": 45 },
    "chat": { "model": "opus", "effort": "medium", "timeout": 120 },
    "deep": { "model": "opus", "effort": "high", "timeout": 300 }
  },
  "limits": { "coach": 6, "chat": 20, "deep": 5, "shots": 6 }
}
```

For Codex, set `provider` to `codex` and each `model` to `""` to use its CLI default.
Keep the `addonDir` and `capture` values that setup writes.
Use `cliPath` only if the companion cannot find your CLI.
Set `savedVariables` to one character's `AzerothCoach.lua` file for optional reload recovery.
The companion reads that file only. It does not scan account files.

Claude has no built-in tools for text questions. Source tools can read only allowed IDs.
Codex keeps your local config and login. The companion verifies its tool policy before each run.
It disables command tools, apps, browser tools, plugins, hooks, other MCP servers, and web search.
A failed policy check stops the run. It never prints MCP credentials.
Its process still uses a read-only sandbox. Claude is the recommended provider for the first test.
CLI flags and screenshot support still need a Windows test.

## Commands

| Command | Result |
|---|---|
| `/coach` | Open or close the chat |
| `/coach <question>` | Ask a question |
| `/coach pause [minutes]` / `resume` | Pause or resume tips |
| `/coach dock` | Put the coach below the quest tracker |
| `/coach route stop` | Stop the route |
| `/coach on` / `off` | Enable or disable the coach |
| `/coach interval 5` | Set the pause between tips: 5, 10, 20, or 30 minutes |
| `/coach expire 10` | Remove a tip after 5 or 10 minutes, or `never` |
| `/coach dungeons on` / `off` | Enable or disable dungeon tips |
| `/coach settings` | Open native settings, or show the commands |
| `/coach status` / `doctor` | Show the link and API checks |
| `/coach ping` | Test the link without an AI request |

Assign the chat key in the game's key bindings. Dungeon tips have `Yes`, `No`, and `Later` answers.
Routes use positions from QuestieDB. They never use positions from the AI.

## Sources, images, and limits

- QuestieDB is a separate runtime dependency. Its Forever coverage is incomplete.
- Warcraft Wiki uses its API, a cache, and **CC BY-SA 4.0** credit.
- Wowhead gets one ID page per question. HTTP 403 or 429 stops requests for 24 hours.
- Page cache: 7 days. Missing pages: 1 day. AI tips: 24 hours.
- The AI uses entity tokens. The addon puts in the real names. Unknown IDs fail validation.
- The model can still write a wrong name in plain text. The validator cannot prove every sentence.
- The companion stores 50 chat turns and sends the last 6. It does not read game chat or the character name.
  Each character session has separate history. Recovery needs its saved session token.
  A full SavedVariables wipe starts a new session with no restored history.
- `Attach one screenshot` applies to one message. The limit is 6 each hour.
  The companion captures the game client area after the strip disappears, then deletes the file after the run.
  It deletes leftover images at startup after a crash. The image can show game chat.
  Text questions use no full-screen image.

The link uses a visible strip of color cells at the top-left corner.
It covers up to 800×192 pixels while the companion reads a request. It can stay visible if capture fails.
The companion writes replies to pre-made load-on-demand addons. Silent WAV files carry the signals.
This transport comes from [wow-ai](https://github.com/chelinho139/wow-ai), under MIT.
See [provenance](third_party/wow-ai/provenance.json).

## Checks

```powershell
npm test
npm run check
npm run doctor
npm run doctor -- --live
npm run doctor -- --capture
```

`--live` runs the selected models and uses your CLI plan. `--capture` needs the foreground game.
The tests use small fictional quests. They cover the addon lifecycle, planner, protocol, source cache,
MCP tools, provider streams, quotas, reply validation, and screenshot deletion.
They do not prove game compatibility. Fullscreen, HDR, scale, taint, and live API behavior need the first Windows session.
Real Claude and Codex text runs pass on Linux with the restricted flags. Windows image runs remain untested.
See the [validation record](docs/validation.md) for the checks and limits.
Two known issues remain: [instance classification](https://github.com/redawear/azeroth-coach/issues/1)
and [signal reuse after 200 request IDs](https://github.com/redawear/azeroth-coach/issues/2).

The [implementation brief](docs/implementation.md) records the architecture and exact native UI patterns.
The [design notes](docs/design.md) record the product decisions.
The [four sketches](docs/mockups/README.md) show the earlier, less subtle concepts.
