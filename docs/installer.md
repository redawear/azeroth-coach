# One-click installer for Windows

Status: design, 2026-11-13. Approved direction: Reda wants a one-click install
now, before the first game test.

## Goal

A player downloads one file, `AzerothCoach-Setup.exe`, and runs it. After it
finishes, the player restarts the game and types `/coach`. The player never
installs Node.js, never uses git, and never types a command in a terminal.

## What the player sees

The installer has 5 pages. Use this text exactly.

### Page 1: Welcome

> **Azeroth Coach**
>
> Azeroth Coach adds a leveling coach and an AI chat to World of Warcraft:
> Forever.
>
> Close World of Warcraft before you continue.

If `Wow.exe` from the `_forever_` folder runs, show: "World of Warcraft is
open. Close it, then click Retry." with **Retry** and **Cancel**.

### Page 2: Game folder

> **Where is World of Warcraft: Forever?**
>
> We found this folder. Change it if it is wrong.
>
> `[ C:\Program Files (x86)\World of Warcraft\_forever_ ]  [Browse…]`

- Find the folder automatically. Use the Blizzard install path in the
  registry first, then the paths that `scripts/setup.js` `findClient()` checks.
- The folder must be named `_forever_` and must hold `Wow.exe`. If not, show:
  "Choose the `_forever_` folder. It holds Wow.exe."
- If the installer cannot write to `Interface\AddOns`, show: "Windows does not
  let this installer write to the game folder. Close the installer, then
  right-click it and select Run as administrator."

### Page 3: AI

> **Which AI do you use?**
>
> ( ) **Claude** — uses your Claude Code sign-in
> ( ) **Codex** — uses your Codex sign-in
> ( ) **No AI** — coach tips only, from the quest data
>
> The AI runs with your own plan. Azeroth Coach does not see your password.

- Next to Claude and Codex, show the detection result in small text:
  "Found" or "Not found. Install it first, or choose another option."
- Preselect the first option that is found, Claude first. If neither is
  found, preselect **No AI**.
- A "Not found" option stays selectable. The finish page then explains the fix.

### Page 4: Install

A progress bar with one line for the current step:

1. "Install Azeroth Coach…"
2. "Download the quest data (QuestieDB)…"
3. "Install the addons…"
4. "Start Azeroth Coach…" (skip for **No AI**)

### Page 5: Finish

The installer runs a short check, then shows one of these:

- **Ready:** "Ready. Start World of Warcraft: Forever, then type /coach."
- **AI not signed in:** "Azeroth Coach is installed, but Claude did not
  answer. Open a terminal, type `claude`, and sign in. The coach works now
  with simple tips." (Use "Codex" and `codex` for Codex.)
- **Quest data download failed:** "Azeroth Coach is installed, but the quest
  data did not download. Check the internet connection, then run this
  installer again."

One checkbox, checked by default (hidden for **No AI**):
"Start Azeroth Coach when Windows starts".

## What the installer does

- Installs per user, with no administrator rights, to
  `%LOCALAPPDATA%\Programs\AzerothCoach\`.
- Ships its own Node.js runtime. The player does not install Node.js.
- Copies the `AzerothCoach` addon into `Interface\AddOns`.
- Downloads the Forever release of QuestieDB from its GitHub releases and
  installs it. It checks the API contract that the addon needs. It does not
  bundle QuestieDB in our repository or in our installer file.
- Creates the 200 reply addons (skip for **No AI**).
- Writes `%LOCALAPPDATA%\AzerothCoach\config.json` with the client path and
  the provider. It keeps an existing `config.json` on upgrade, and changes
  only the client path and the provider.
- Starts the companion with no visible window, and starts it again at each
  Windows sign-in when the checkbox is on.

## Rules for the companion as an installed app

- **No console window, ever.** Not at start, not at sign-in, not when it
  starts PowerShell, `claude`, or `codex`.
- **One copy only.** A second start finds the running copy and exits.
- **The game shows the status.** There is no tray icon in this version. The
  coach header and `/coach doctor` show whether the companion runs.
- **The log stays in** `%LOCALAPPDATA%\AzerothCoach\companion.log`.

## Start menu

A folder named **Azeroth Coach** with:

- **Restart Azeroth Coach**
- **Edit settings** (opens `config.json` in Notepad)
- **Open log folder**
- **Uninstall Azeroth Coach**

## Upgrade

A newer `AzerothCoach-Setup.exe` upgrades in place:

- It stops the running companion, replaces the files, and starts it again.
- It keeps `config.json`, the cache, and the chat history.
- If the game folder gets new addon folders, the finish page says: "Restart
  World of Warcraft to load the new version."

## Uninstall

- Stops the companion. Removes the app, the start at sign-in, the
  `AzerothCoach` addon, and the 200 reply addons.
- Keeps QuestieDB. Other addons, such as Questie, use it.
- Asks with a checkbox, unchecked by default: "Also delete my settings and
  chat history".

## Known limits (accepted for now)

- The file has no code signature. When it is downloaded from the internet,
  Windows SmartScreen shows "Windows protected your PC". The player clicks
  **More info**, then **Run anyway**.
- The repository is private. A player needs repository access to download the
  release, or Reda sends the file.
- No automatic update. The player runs a newer installer.
- The 200 reply addons show in the in-game addon list. The game does not let
  us hide them.

## For developers

The developer setup (`npm ci`, `npm run setup`, `npm start`) stays. Move it to
its own README section, below the player install.
