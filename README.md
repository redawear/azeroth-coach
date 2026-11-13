# Azeroth Coach

A leveling coach and an AI assistant inside **World of Warcraft: Forever**.

Working name. Private project for Reda and friends. Status: design. No code yet.

## What it does

1. **The insight card.** A small card below the minimap or below the quest
   tracker. When something happens in the game (level up, new zone, a dungeon
   level comes close), the card shows one short tip. Example: "This zone has
   a 6-quest chain that ends in Shadowfang Keep. Start it at the inn."
2. **The chat.** A click on the card opens a chat with an AI. The AI knows
   your character, your quests, and the tip on the card.

## How it works

The game does not let an addon use the network. So the project has two parts:

| Part | Runs | Does |
|---|---|---|
| `addon/` | Inside the game (Lua) | Reads the live game state, detects the triggers, shows the card and the chat, draws the arrow |
| `companion/` | On the Windows PC | Talks to the AI through your own `claude` or `codex` login (one of them), reads the wiki and Wowhead, keeps a cache |

The addon works alone. Without the companion, the card shows simple tips from
the quest data. With the companion, the AI writes the tips and answers the
chat.

Full design: [docs/design.md](docs/design.md).

Preview the [four coach sketches](docs/mockups/README.md).

## Phases

1. **Phase 1, no AI:** quest data, planner, triggers, the card with simple
   tips. Alliance first.
2. **Phase 2:** the Windows companion, the live link between the game and
   the PC, AI tips and chat with Claude or Codex.
