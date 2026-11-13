# Coach placement sketches

Open [coach-sketches.html](coach-sketches.html) in a browser. It needs no server.
The file includes its images, styles, and scripts.

The four sketches use one shared coach component:

1. [With the quest tracker](01-quests.png): a section below the quests.
2. [Below the minimap](02-minimap.png): a small Blizzard-style frame.
3. [Above the action bar](03-actionbar.png): a strip for the next step.
4. [Beside the game chat](04-chat.png): a tip above the chat.

[The chat example](05-chat-open.png) shows the window after a click on the tip.
[The contact sheet](four-sketches.png) shows all four placements together.

Use the buttons to open the chat, show a route, dismiss a tip, or pause.
The chat can show a sample dungeon preference. It sends no AI request.
The reset button restores the selected sketch.

The forest is an illustrative drawing. The native player frame, minimap,
and action bar come from the public
[wow-ai screenshot](https://github.com/chelinho139/wow-ai/blob/main/docs/screenshot.jpg).
Blizzard Entertainment owns the game art. These are concept sketches, not game captures.
The quest text, counts, routes, and replies are examples.
The sketches do not prove support for the Forever client.

The quest-tracker placement is the proposed default. Reda has not selected a placement yet.
Reda accepts the general direction but asks for a more subtle coach.
The sketches remain the original concepts. Apply this feedback in the working addon.
Reda approved Codex for these sketches because Claude was at its API limit.
This approval applies to this concept task only.

Checks: all four placements; chat open and close; sample preference and message;
route; dismiss; pause; reset; no script errors; no horizontal overflow at 360 pixels.
The checks used a local Chromium process. T3's HTML preview could not start its sandbox.
T3's HTML render still displayed the interactive file.
