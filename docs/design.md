# Design

Status: draft, 2026-11-13. Decisions from the first design talk with Reda.

## Scope

- **Game:** World of Warcraft: Forever (live since 2026-11-04, client
  1.60.1, interface 16001). No Retail, no Classic Era for now.
- **Users:** Reda and one friend. A public release is a later decision.
- **First faction:** Alliance.
- **PC:** Windows. The player has Claude Code and Codex installed and
  signed in.

## The two features

### 1. The insight card

A small card in a fixed place: below the minimap or below the quest tracker.
The player can move it. When a trigger fires, the card shows one short tip.

**Triggers.** The addon detects all of these live, with game events:

| Trigger | Game signal | Example tip |
|---|---|---|
| Level up | `PLAYER_LEVEL_UP` | "Level 22. Three new quests open in Ashenvale." |
| New zone | `ZONE_CHANGED_NEW_AREA` | "This zone has a quest chain that ends in Shadowfang Keep." |
| Close to a dungeon level | level vs. dungeon range | "Deadmines is good at 18–22. You have 2 of its 5 quests." |
| Quest turned in | `QUEST_TURNED_IN` | "The next step of this chain is in Darkshire." |
| Quest turns gray | level vs. quest level | "This quest gives almost no XP now. Abandon it." |
| Quest log almost full | quest log count | "19 of 20 quests. Drop these 3." |
| New class spells | level (every 2 levels) | "You can learn new spells. Nearest trainer: Stormwind." |
| Many deaths in one area | `PLAYER_DEAD` + position | "This area is hard for your level. Come back at 26." |
| Arrival in a capital | zone | "Train, take the 2 city quests, bind your hearthstone." |

**Rules for the card:**
- No card in combat.
- One card at a time. A minimum pause between cards (setting).
- The player can close a card or snooze the coach.
- A card can ask a question with buttons, for example "Do you want to run
  Shadowfang Keep? Yes / No / Later". The addon saves the answer. Later tips
  use it.

### 2. The chat

A click on the card opens a chat window. The chat gets the same context: the
character, the zone, the quest log, and the tip on the card.

## How a tip is made

The AI must not invent tips alone. Forever has more than 1,000 new quests,
and the models do not know them. They would make up quest names. So:

1. **The addon detects the trigger.**
2. **The quest data gives the exact facts:** chains in this zone, dungeon
   quests, prerequisites, what the player already completed.
3. **The AI chooses what is important** and writes one short tip from those
   facts. It can read more with tools (quest data, wiki).

Without the companion, step 3 is a simple text template. The card still works.

## Data the addon reads (live, out of combat)

- Level, XP, rested XP, race, class, faction, gold, talents, professions,
  reputation.
- Zone and map position, and the direction the player faces (for the arrow).
- The quest log with objectives and progress.
- The list of completed quest IDs (the key to chains). Verify the exact API
  on the Forever client.
- Bags, equipment, hearthstone location, group.
- Events: level up, quest accepted, quest turned in, zone change, XP gain,
  death.

Combat data is hidden from addons ("secret values", inherited from the
Midnight API). The coach does not need combat data.

## Knowledge sources

| Source | Use | Rules |
|---|---|---|
| **QuestieDB, Forever data** | The facts for the planner: quests, givers, positions, prerequisites (`preQuestSingle`, `preQuestGroup`), level, race and class limits | GPL-3.0. Bundled data makes our code GPL-3.0. Some Forever data is entered by hand and can be wrong |
| **Warcraft Wiki** (`warcraft.wiki.gg`) | Extra context for the chat: quest stories, tips, dungeon pages | CC BY-SA 4.0. Use the MediaWiki API (`/api.php`) with a clear user agent. Credit the wiki. It has about 237 Forever quest pages, so coverage is partial |
| **Wowhead** (`wowhead.com/forever`) | Extra context for the chat, one page for each question: quests, NPCs, items, comments | See "Wowhead rules" below |

**Wowhead rules.** Its `robots.txt` blocks the AI *training* crawlers on
the whole site (`ClaudeBot`, `GPTBot`, `CCBot`, `Google-Extended`,
`anthropic-ai` and others). For all other agents (`User-agent: *`) it allows
the quest, NPC and item pages, and blocks only `/search`, `/list`,
`/random` and `/account`. So:
- Read one page only when a question needs it. No bulk download, no
  prefetch.
- Go to the page directly from the ID in the quest data, for example
  `https://www.wowhead.com/forever/quest=<id>`. Never use `/search` or
  `/list`.
- Send a clear user agent that is not one of the blocked crawlers.
- Cite the link in the answer, so the player can open the page.
- Cache each page. Stop and fall back to the wiki if Wowhead blocks us.
- The Wowhead terms are in a separate ZAM / Fanbyte document. We have not
  read it yet. Read it before any public release.

**Cache.** The companion keeps a local cache (SQLite) of wiki pages and AI
lookups, with a time limit for each entry. The cache is the same for Claude and Codex,
through the tools that we own (`wiki_lookup`, `wowhead_lookup`). The tool returns only the
relevant section of a page, not the full page. This saves tokens.

## The AI: Claude or Codex, set by the player

The player connects **one** AI: Claude **or** Codex, not both. The companion
uses the player's own CLI login: `claude -p` or `codex exec`. This is
personal use of the player's own plan on the player's own PC.

Inside that one provider, the player sets the model and the effort for each
job, the same way as in a coding tool:

| Job | Default with Claude | Default with Codex |
|---|---|---|
| `coach` (the card tips, frequent and short) | Sonnet, low effort | the CLI default model, low effort |
| `chat` (answers) | Opus, medium effort | the CLI default model, medium effort |
| `deep` (a "think harder" button in the chat) | Opus, high effort | the CLI default model, high effort |

If the AI fails or reaches its limit, the card falls back to the simple tips
from the quest data, and the chat says so.

Example config (draft; check the exact CLI flags in phase 2):

```toml
provider = "claude"     # claude | codex (one only)

[coach]
model = "sonnet"
effort = "low"

[chat]
model = "opus"
effort = "medium"

[deep]
model = "opus"
effort = "high"

[limits]
max_tips_per_hour = 6
```

**Token care:**
- Tips come only from triggers, never from a timer that runs all the time.
- A minimum pause between tips, and a maximum per hour.
- Short, exact context: the facts from the quest data, not raw pages.
- The cache stops repeated wiki and Wowhead reads.
- The companion shows the use for each job in its window.

## The live link between the game and the PC

The addon cannot use the network or write files while the game runs. For tips
that appear by themselves, the link must work live in both directions:

- **Game → PC:** the addon draws a small strip of colored squares in a
  corner of the screen. The companion captures that corner about 4 times each
  second and decodes the data. The game must run windowed or borderless.
- **PC → game:** the companion writes the answer into one of a pool of
  pre-made load-on-demand addons. The addon loads it, with no `/reload`.

This is the method of [wow-ai](https://github.com/chelinho139/wow-ai) (MIT).
We reuse the idea and credit it.

**Red lines:** the companion never sends input to the game and never reads
game memory. It only reads the screen and writes data files. Blizzard has no
public rule on screen readers, so this stays a gray area. Read the Blizzard
add-on policy before any public release.

**Extra:** for a visual question ("what is this item?"), the companion can
send one screenshot with the question. Never all the time.

## Test approach

- **Logic tests without the game:** the planner, the chains, and the routes
  are plain Lua with fake game data. They run on any machine.
- **In-game tests on the Windows PC:** clone the repo, link the addon folder
  into the Forever `Interface\AddOns`, run Claude Code or Codex in the repo.
  The loop is: change, `/reload`, look. The addon writes a debug log to its
  SavedVariables so the agent can read it.
- **Error tools:** BugSack for Lua errors, `/etrace` for events.

## Open questions

- The exact API names on the Forever client: completed quests, player
  facing, quest XP.
- License: bundle QuestieDB (we become GPL-3.0) or depend on the QuestieDB
  addon at runtime. Bundling is simpler for two players.
- The companion language: TypeScript on Node (like wow-ai) or Python.
- The exact CLI flags for model and effort in `claude` and `codex`.
- The card design: Blizzard style to match Forever. Make a mockup before code.
