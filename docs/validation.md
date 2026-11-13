# Build validation

Date: 2026-11-13. Branch: `build/full-coach`. Host: Linux, Node 24.
No part has run in the Forever client. The Windows guide remains required.

## Automated checks

- `QUESTIEDB_SOURCE=/tmp/azeroth-questiedb-upstream npm test`: 47 pass, 1 skip, 0 fail.
- The skipped check needs Windows PowerShell. It decodes an image from the real Lua pixel codec.
- Without `QUESTIEDB_SOURCE`, the external QuestieDB source check also skips.
- `npm run check`: 40 Lua and JavaScript files pass syntax checks.
- CI runs tests and syntax checks on Ubuntu and Windows, with Node 22.16 and 24.

The tests cover these defects from the first Claude review:

- The real QuestieDB `.private` shape, source strings, overrides, map groups, and alternative dungeon areas.
- Reverse prerequisites, Skyborne race masks, and dungeon level inference.
- Ten minutes without a companion: at most 11 s of strip visibility, with exactly one slot read.
- Old presence files, new beats, restart, and wrap at 2,000.
- Chat outbox recovery, long fights, one locked slot, and progress throttles.
- Waiting tips, ordinary drag, route expiry, event bursts, and stale death events.
- Separate character history, remembered fact names, expanded tip length, and level lists.
- Guarded Wowhead redirects, source limits, reply validation, and MCP tool limits.
- Screenshot deletion after success, model failure, failed file move, and startup after a crash.
- Startup cleanup does not follow directory links. Fallback reads require a new file time and a new request ID.
- New tips reset the previous block fade. The test client stores real alpha values.
- Local failures clear the outbox. The presence baseline scan uses batches of 64 calls.
- State reads each distinct spell or reputation restriction once, without a loop over all cached quests.
- Number validation accepts formatted XP and money. CLI error matching uses whole authentication terms.

Claude completed two reviews. The second review found a block alpha defect and an outdated index.
The block alpha regression now passes. The publication step must stage every repair and new file.

Two findings do not block the first private test:

- [Issue 1](https://github.com/redawear/azeroth-coach/issues/1): dungeon offers can include transit areas, battlegrounds, and raids.
  `/coach dungeons off` stops these offers.
- [Issue 2](https://github.com/redawear/azeroth-coach/issues/2): reused signal files use slower polling after 200 request IDs.
  Replies still arrive through the fallback path.

The external QuestieDB test reads real map files. Dungeon rows use a structural fixture.
No QuestieDB data is copied into this repository.

## Real CLI checks

The installed CLIs are Claude Code 2.1.321 and codex-cli 0.167.0.
Both returned `PONG` through `companion/agents.js` with restricted flags and no requested tools.
Claude used `sonnet`. Codex used its configured default model.
These checks used Linux. They do not prove Windows image support or the live source tools.

The Codex policy check verifies the advertised feature flags and inherited MCP settings in memory.
The local check disabled 12 features and one inherited MCP server. It printed no raw MCP configuration.
OpenAI documents `unified_exec` as always on, with no user opt-out. `shell_tool` controls command tools.
The companion requires `shell_tool=false` and verifies its other selected restrictions.
See the [official config reference](https://developers.openai.com/codex/config-reference.md).

## Client checks

Use [the Windows test guide](windows-test.md). It covers installation, transport, native UI, and quest facts.
The following checks still need the actual client:

- Blizzard templates, tracker taint, key bindings, map pins, and the sound-file signals.
- Completed quests, facing, trivial quest range, quest limits, and QuestieDB coverage.
- Foreground capture, display scale, HDR, exclusive fullscreen, and screenshot timing.
- Windows CLI launchers, Codex image arguments, and Claude's restricted `Read` rule.
- Live Wowhead redirects and page quality. The automated redirect test uses a fixture.

Do not call the build client-tested until these checks pass.
