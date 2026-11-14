# First Windows and Forever test

No client test has run yet. Use this list for the first session.
Save the first Lua error and the failing step. Fix that error before the next step.

## Install and start

1. Download `AzerothCoach-Setup.exe`. Close the game, run the installer, then fully restart the game.
2. Enable AzerothCoach, QuestieDB, and the 200 reply slots.
3. Use windowed or borderless mode. Start with SDR and 100% Windows display scale.
4. Check the installer finish page. Fix any quest data or AI sign-in error.
5. For AI, select **Restart Azeroth Coach** in the Start menu. No window must appear.
6. Keep the game in the foreground. Check the startup checkbox after a Windows sign-in.
7. Run `/coach doctor`. Save its API checks. Check the QuestieDB contract and sound self-test.
8. Run `/coach ping`. Expect `PONG`, with no AI request.
9. Ask about an active quest. Expect a reply with the provider and source lines.

If the strip stays visible, stop the companion. Use the developer doctor with `--capture`, then type `/coach ping`.
The installer includes `node.exe` and `scripts\doctor.js` in `%LOCALAPPDATA%\Programs\AzerothCoach\`.
Run that Node file with the doctor script in a terminal. Add `--live` to test each model.
Add `--capture` to test the foreground game. These checks can use your CLI plan.
Check the process name, client folder, foreground window, HDR, scale, and the top-left corner.
Do not change the codec to work around a window-selection error.

## Coach and route

1. Check the coach below the quest tracker. It must have no box, glow, sound, or chat announcement.
2. Click the tip. Check the chat context and the title of the tip.
3. Right-click. Check the menu. Disable `Show route` when there is no position.
4. Shift-drag the header. Type `/reload`. Check the saved position. Use `/coach dock` to reset it.
5. Collapse the coach. A new tip must show `Coach (1)`.
6. Make little room below the quest tracker. Only the header must show.
7. Check a route from a real quest giver. Compare its numbered map pin with QuestieDB.
8. Walk to the position. Check arrival at 12 yards and the final `You are here.` line.
9. Stop the route from its menu and with `/coach route stop`.

## Triggers and hide rules

1. Change zone and level up. Check each tip against the quest log and QuestieDB.
2. Turn in a chain quest. The next tip must name a quest from that chain.
3. Check gray-quest, full-log, trainer, capital, dungeon, and repeated-death tips as those events occur.
4. Answer a dungeon question. Check `No` after a reload and `Later` after one hour.
5. Pause the coach. Check the minimum pause and the 24-hour rule for repeated subjects.
6. Enter combat. The coach and strip must hide. Check that quest item buttons still work.
7. Leave combat. The coach waits 3 seconds. A queued tip older than 5 minutes must disappear.
8. Check death, ghost, taxi, instance, cinematic, Edit Mode, and a collapsed quest tracker.
9. Open a quest, gossip, merchant, or trainer window. New tips must wait until it closes.
10. Stop the companion. The addon must keep its template tips. The chat must show the offline message.

## Chat, sources, and screenshot

1. Ask about a known quest ID. Click a source and copy its link.
2. Ask about an unknown ID. The coach must ask for facts instead of inventing a quest.
3. Select `Think harder`. Check the deep model and effort in the reply.
4. Attach one screenshot. Check that the chat and strip hide before the capture.
5. Check `%LOCALAPPDATA%\AzerothCoach\shots\` and `run-*\empty\shot.png`. No image must remain after the request.
6. Ask again without the checkbox. There must be no new full-frame image.
7. Reach a configured low test quota. Check the retry time and template fallback.
8. Stop the companion during a run, then start it. Check reconnect and request recovery.
9. Type `/reload` during a question. Check chat history and the pending reply.
10. Test without QuestieDB. The chat and diagnostics must still open.

For a Lua error, use BugSack if available. The addon keeps 300 log lines in SavedVariables.
The companion log is `%LOCALAPPDATA%\AzerothCoach\companion.log`.
Do not publish raw SavedVariables. They can contain private questions.

## Development

Normal setup copies the addon. Run setup again after a source change, then `/reload`.
Fully restart the game when new addon folders or signal files appear.

`npm run setup -- --link` creates a development junction when the destination does not exist.
This puts generated signals and `Inbox.lua` changes in the source folder too.
Keep those files out of commits. Restore the placeholder `Inbox.lua` before a commit.
Use the copy install for the first client test.
