# Azeroth Coach: first live test (2026-11-14)

The test runs the one-click installer from PR #4 (`AzerothCoach-Setup.exe`, v0.1.0) on the Windows desktop.
The game folder is `D:\World of Warcraft\_forever_`. The AI provider is Codex.

File paths below are repository paths. The installed copy uses the same layout.

## GitHub issues (filed 2026-11-14, all assigned to redawear)

| Log item | Issue |
|---|---|
| 8. Remove the route | [#5](https://github.com/redawear/azeroth-coach/issues/5) (do first) |
| Idea B. Location as text | [#6](https://github.com/redawear/azeroth-coach/issues/6) |
| 4 + idea A. Minimap button | [#7](https://github.com/redawear/azeroth-coach/issues/7) |
| 1. Dungeon already done | [#8](https://github.com/redawear/azeroth-coach/issues/8) |
| 2. Dungeon on another continent | [#9](https://github.com/redawear/azeroth-coach/issues/9) |
| 3. Non-dungeon instances | existing [#1](https://github.com/redawear/azeroth-coach/issues/1) (comment added) |
| 5. npm in player text | [#10](https://github.com/redawear/azeroth-coach/issues/10) |
| 6 + 7. Log noise | [#11](https://github.com/redawear/azeroth-coach/issues/11) |
| 9. Slot entries in the list | [#12](https://github.com/redawear/azeroth-coach/issues/12) |
| 9. Polls use up slots | [#13](https://github.com/redawear/azeroth-coach/issues/13) (related to [#2](https://github.com/redawear/azeroth-coach/issues/2)) |
| 10. QuestieDB | no issue: keep it |

## What worked

- The installer completed with no errors (08:46–08:47 local time).
- It installed the app, the addon, QuestieDB, and the 200 reply addons.
- It wrote `config.json`, the "start at sign-in" entry, and the 4 Start menu shortcuts.
- One companion process runs. It has no console window.
- The companion attached to the game at 13:48:44 UTC.
- The chat handshake works (PONG at 13:54:27 UTC).

## Not tested in this round

- **No AI answer ran.** The companion log has 3 events only: the start, the attach to the game, and 1 handshake. Codex never ran.
  - The dungeon questions do not go to the AI (`addon/AzerothCoach/Core.lua:42`, `not tip.question`).
  - No chat question was sent.
- So these are still not tested: a Codex answer, the sources line, the "Think harder" button, the screenshot box, the hourly limits, and the sign-in error text.
- The round ended at about 14:30 UTC. The companion and the game were still running, one copy of each.

## Problems

### 1. The coach asks about a dungeon that the player already did

- **Seen:** after login, the coach asked "Do you want tips for this dungeon?" about Deadmines. The player already did Deadmines.
- **Cause:**
  - The game keeps no record of a finished 5-player dungeon. The addon can only see completed quests.
  - The question shows when the level is in range and 1 or more dungeon quests are not done (`addon/AzerothCoach/Tips.lua:54-73`). If the player skipped 1 quest, the coach thinks the dungeon is not done.
  - The text "You have N of M quests" counts only the quests in the log (`plan.active`). It ignores the completed quests (`plan.completed`, `addon/AzerothCoach/Planner.lua:175`).
  - The answers are only Yes / No / Later (`addon/AzerothCoach/CoachSection.lua:90`). There is no "Already done" answer.
  - The AI chat gets the active quests, not the completed quests (`addon/AzerothCoach/Data.lua:220-221`).
- **Proposed fix:**
  - Show the completed count: "You finished 4 of 6 quests."
  - Do not ask when most of the dungeon quests are complete.
  - Add a **Done it** answer.
  - Send a short summary of completed quests per dungeon and per zone to the AI.
- **Workaround:** click **No**. The coach does not ask again for that dungeon on this character.

### 2. The coach suggests a dungeon on a different continent

- **Seen:** in Stonetalon Mountains (Kalimdor), at level 22, the coach asked about "City of Dalaran". The player answered Yes to test it.
- **Cause:**
  - "City of Dalaran" is a Forever dungeon (area 16544, instance 2959). Its entrance is in Alterac Mountains, in the Eastern Kingdoms (`QuestieDB/support/Forever/Zones/dungeons.lua:143`).
  - The coach checks every dungeon in the world. It does not use the player's zone, continent, or distance (`addon/AzerothCoach/Tips.lua:55`).
  - The level window runs from the lowest required level of any dungeon quest, minus 2, to the highest quest level (`addon/AzerothCoach/Planner.lua:173-174`). One low-level quest makes the window very wide.
- **Proposed fix:**
  - Prefer dungeons on the player's continent, then sort by distance to the entrance (`dungeons.lua` has the entrance coordinates).
  - Use a level window based on most of the dungeon quests, not the single widest quest.
- **To check:** which level range did the tip show? The window included level 22.

### 3. The dungeon list includes battlegrounds, raids, and city areas (found in the code, not seen in the game)

- **Cause:** the addon uses all entries of the QuestieDB `ZoneDB.dungeons` table (`addon/AzerothCoach/Data.lua:47-53`). The table includes Warsong Gulch, Alterac Valley, Arathi Basin, Molten Core, Onyxia's Lair, Zul'Gurub, Deeprun Tram, Hall of Legends, Champions' Hall, and Darkmoon Faire Island.
- **Risk:** a battleground or raid with quests in the level range can trigger the "dungeon" question. Deeprun Tram has low-level quests.
- **Proposed fix:** keep an allow-list of 5-player dungeons, or exclude battlegrounds, raids, and city areas.

### 4. After the player closes the coach, nothing shows how to open it again

- **Seen:** the player used a "hide" control. The coach disappeared, and the player did not know how to call it back.
- **Cause:**
  - The "Coach" block under the quest tracker shows only when there is a tip or a route (`addon/AzerothCoach/CoachSection.lua:40`). After a dismiss, it stays hidden for 10 minutes or more.
  - The chat window closes with the X button or the Esc key.
  - There is no minimap button and no hint text. The key binding "Open the coach chat" has no default key.
  - Collapsing the quest tracker also hides the coach (`addon/AzerothCoach/Triggers.lua:21`).
- **Proposed fix:**
  - Add a minimap button (see idea A below). The player prefers this fix.
  - The first time the player closes the coach, show one line in chat: "Type /coach to open the coach again."
- **Workaround:** type `/coach`. Type `/coach <question>` to ask in one step.
- **To check:** which control did the player click? (the X, Esc, Dismiss, or the header minimize button)

### 5. Player text tells the player to run developer commands

- `addon/AzerothCoach/ChatWindow.lua:85`: `Start it on this PC with "npm start"`.
- `companion/jobs.js:18-19`: `Run "npm run doctor"`.
- `addon/AzerothCoach/Link.lua` (`L.Poll`): `Run npm run setup, then restart the game.`
- A player who used the installer has no `npm`. The text should say: "Open the Start menu and click Restart Azeroth Coach."

### 6. The log grows when the game is closed

- The companion writes "waiting for Wow window" every 3 seconds. That is about 1,200 lines per hour.
- With start at sign-in, the log grows on every day the player does not play.
- The log rotates at 1 MB (`companion/main.js:25`). After about 27 hours without the game, the wait lines push all useful lines out.
- **Proposed fix:** log the wait once, then log again only when the state changes.

### 7. The log shows the handshake as a chat answer

- The handshake (`trigger: hello`) writes `chat: done; daily use []` (`companion/main.js:50-55`). It looks the same as a real answer.
- **Proposed fix:** log it as `hello: done`.

### 8. The coach has a route arrow, but the product must have no arrows

- **Decision (player, 2026-11-14):** "We don't want any arrows."
- **Where it comes from:** the approved build spec asked for it. `docs/implementation.md` section 7 "Route line" specifies a 16×16 `MinimapArrow` that turns with the player, a distance line, and numbered pins on the world map. `docs/design.md:71` reads the facing direction "for the arrow". Commit `685540a` built it.
- **When it shows:** only after the player right-clicks a tip and selects **Show route**.
- **Decision (player, 2026-11-14): remove the full route.** That is the arrow, the distance line, the world map pins, the "Show route" menu item, and `/coach route stop`.
- **Code to remove:**
  - `addon/AzerothCoach/Route.lua`: the full file, and its line in `AzerothCoach.toc:17`.
  - `addon/AzerothCoach/CoachSection.lua`: the menu item (line 17), the route checks in `Refresh` (lines 40, 44, 58-62), and the route row (lines 98-101).
  - `addon/AzerothCoach/Core.lua`: `AC.Route.Pins()` (line 131) and the 0.1 s route ticker (line 151).
  - `addon/AzerothCoach/UI.lua`: `UI.Arrow` (lines 168-172) and `UI.Pin` (lines 173-181), if nothing else uses them.
  - `addon/AzerothCoach/Slash.lua:15`: `/coach route stop`.
  - The route tests, if any, in `tests/addon.test.js`, `tests/planner.test.js`, or `tests/game.lua`.
- **Docs to change, so a later build does not add it back:**
  - `docs/implementation.md`: delete section 7, and the route parts of sections 1 and 6.
  - `docs/design.md:71`: the facing direction "for the arrow".
  - `README.md:11,120,130`.
  - Add the rule to the docs: "No arrows and no routes."
- **Keep:** the quest positions from QuestieDB. The tip order uses them to put the nearest quest first (`addon/AzerothCoach/Planner.lua:146-166`). That is not a route.
- **Decision (player, 2026-11-14): allow text directions.** Idea B sends a compass direction ("240 yd north-east") to the AI, and the AI can write it in its answer. The player sees no arrow. Keep the bearing math when the route is removed.

### 9. The addon list shows 200 "Azeroth Coach slot" entries

- **Seen:** the in-game AddOn List shows "Azeroth Coach slot 1", "slot 10", "slot 100", "slot 101", and so on. Each has a red "?" icon and "Only loadable on demand". The player asked why there are so many and what they are.
- **What the slots do:**
  - A WoW addon cannot read a file while the game runs. The one exception: the game can load a "load on demand" addon one time.
  - The companion writes each reply into one slot addon (`Inbox.lua`). The coach then loads that slot to read the reply (`addon/AzerothCoach/Link.lua`, `L.Poll`).
  - The game cannot load a slot a second time before `/reload`. So 1 slot = 1 reply. 200 slots = 200 replies, then the coach says "Reply slots are used up. Type /reload to continue."
  - The other direction (game to companion) uses a pixel strip at the top left of the screen. The companion reads it from the screen (`AzerothCoachStrip`, `companion/capture.ps1`).
  - The method comes from wow-ai (MIT) (`companion/install-slots.js:2`). `docs/installer.md` lists the 200 entries as a known limit: the game does not let an addon hide them.
- **Why 200:** the hourly limits allow about 31 AI replies (6 coach, 20 chat, 5 deep), plus the handshakes. 200 slots last about 6 hours at the maximum rate.
- **Proposed fix:**
  - Pad the titles so they sort in order: "slot 001", not "slot 1" (`companion/install-slots.js:13`).
  - Add `## Notes: Part of Azeroth Coach. Keep it enabled.` to each slot `.toc`. The tooltip then explains the entry.
  - Add `## IconTexture:` to the main addon and the slots. The red "?" looks like an error.
  - Optional: fewer slots (for example 100) if a play session rarely needs more. The trade-off is an earlier `/reload`.
- **To check:** when sound signals do not work, the coach polls every 15 seconds (`Link.lua`, `pollAt = GetTime() + 15`), and each poll loads one slot. A long answer (deep: 300 s timeout) can then use about 20 slots. Run `/coach doctor` and read "sound signals" and "free slots".

### 10. Question: do we need QuestieDB? (answer: yes, keep it)

- The game tells an addon only about the quests in the log and the completed quest IDs. It cannot list all quests, their levels, prerequisites, chains, start NPCs, positions, or dungeons.
- QuestieDB supplies all of that. Every quest tip, chain step, and dungeon plan comes from it (`addon/AzerothCoach/Data.lua`, `Tips.lua`).
- The AI facts come from it too. The validator rejects an answer with an ID that is not in the facts, so the AI cannot invent quests.
- Without QuestieDB, the coach shows "Quest data is not available" and gives no quest tips.
- We do not bundle it (`docs/installer.md`). It is a separate GPL-3.0 project with its own updates. Questie uses it too, so many players already have it.
- **No change needed.** Polish only: QuestieDB shows above Azeroth Coach in the list, but it is not grouped with it. That is fine, because other addons use it.

## Ideas from the player

### A. A coach button on the minimap

- **Idea:** put an icon on the edge of the minimap, at the bottom left. It shows notifications and nudges, and the player can click it.
- **Why:** it fixes problem 4. A minimap button is the usual entry point for a WoW addon, so players look for it there.
- **Proposed behavior:**
  - Click: open or close the chat.
  - Right-click: the same menu as the Coach block. Reuse `CoachSection.Menu` (`addon/AzerothCoach/CoachSection.lua:14`).
  - A badge or glow when a tip waits. A tip can then wait on the button and not open the tracker block.
  - Tooltip: the companion status. Reuse `UI.SetStatus` and `UI.Tooltip` (`addon/AzerothCoach/UI.lua:138-146`).
  - The player can drag it around the edge of the minimap. A setting can hide it.
- **To note:** Forever uses a round minimap with its own icons (for example, the sun icon at the top right). Put the button on the `Minimap` frame edge, and test that it does not cover other icons.

### B. Better location data for the AI

- **Question:** would screenshots of the minimap with the location help the coach? Does the coach already use them?
- **What the coach does now:**
  - The addon reads the map, the x and y position, and the facing direction. It uses them for the tip order (`addon/AzerothCoach/Planner.lua:140`) and the route arrow (`addon/AzerothCoach/Route.lua:64-80`).
  - The AI gets only the zone name (`addon/AzerothCoach/State.lua:137`). It gets no coordinates, no subzone, and no direction. The quest facts include NPC names, not their positions (`addon/AzerothCoach/Data.lua:198`).
  - The chat has an "Attach one screenshot" box. It captures the full game window, scaled down (`companion/capture.ps1:158-173`). The limit is 6 screenshots each hour. The minimap is in the image, but it is small.
  - The blue line and the "72.3, 42.1" text on the minimap do not come from Azeroth Coach.
- **Proposed fix, in order (all automatic, the player types nothing):**
  1. Send the location as text in every question: coordinates, subzone, and facing direction.
  2. For each active quest, send the nearest quest target with its distance and direction, for example: "{n:123}: 240 yd north-east". The addon already has the spawn data and the direction math (`Route.Heading`).
  3. Later, if needed: a minimap-only crop for terrain questions (caves, paths, cliffs). The addon knows the minimap position on the screen, so the companion can crop it.
- **Why text first:** text is exact and costs almost nothing. It works for every question and has no hourly limit. It also cannot show game chat. AI models read small map images badly.

## Open questions

- The installer selects Claude first if it finds Claude. This install uses Codex. Did the player choose Codex, or did the installer not find the `claude` CLI?

# Round 2 (2026-11-17): PR #15 build, commit 9873ce0

Setup: installer from CI run 43617029544. Level 18, Stormwind City. Provider Codex (CLI 0.167.0).

## 11. The first real AI question failed

- **Seen:** the question "walkthrough for the sleeping bag quest" got "The companion could not finish this question. Ask again. If it fails again, type /coach doctor." Two tries, two failures.
- **Log:** `AI error (failed): Cannot verify the Codex tool policy. Update the Codex CLI, then ask again.`
- **Cause:** `inspectCodex` (`companion/agents.js`) lists the Codex MCP servers before it applies the feature disables. Two servers (`codex_app`, `cua_repl`) come from bundled Codex plugins. The check then passes `-c mcp_servers.codex_app.enabled=false`. Codex rejects that override: "invalid transport in mcp_servers.codex_app". With the feature disables applied, only `node_repl` is left, and it can be switched off.
- **Since:** v0.1.0. Round 1 sent no real question.
- **Fix:** in PR #15 (pass A6).

## 12. Console windows popped up again and again

- **Seen:** while the question ran, windows opened and closed many times.
- **Cause:** the installed companion runs as `AzerothCoach.exe`, which has no console. It starts Codex through the npm wrapper `codex.js`, and the wrapper starts `codex.exe` without `windowsHide`. Windows gives each `codex.exe` a new visible console. One question starts Codex up to 5 times.
- **Since:** v0.1.0 installer (#4). `npm start` in a console hides the problem.
- **Fix:** in PR #15 (pass A6): start the native `codex.exe` directly, and run other JS entry points with the console `node.exe`.

## 13. A big colored block showed at the top-left

- **Seen:** "weird colors" at the top-left during the question.
- **What it is:** the pixel strip that carries the question from the game to the companion (up to 800×192 px).
- **Why it stayed:** sound signals probably do not work on this PC. The login sent a hello, which happens only without signals. Without signals, the strip stays until the first slot poll (5 s or more; the login hello shows it for 10 s). One read also failed its checksum.
- **To check:** `/coach doctor` → "sound signals: true/false". Check that game sound is on.
