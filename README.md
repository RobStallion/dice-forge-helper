# Dice Forge Companion 🎲🏛️

A real-time multiplayer web companion for the **Dice Forge** board game (up to 4 players). Keep the physical **Islands board** and **Heroic Feat cards** on the table while moving **dice rolling, face forging, Sanctuary stock, and resource/score tracking** to your phones or a shared tablet.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/RobStallion/dice-forge-helper)

## Features

- **Room-Code Multiplayer + Shared Table View**:
  - One player creates a 4-letter room code; up to 4 players can join from their phones, or you can open the **All Heroes (Table View)** on a shared tablet/laptop (or add & control multiple Heroes from a single device).
- **Divine & Minor Blessings**:
  - **⚡ Divine Blessing (Roll All)**: Rolls both dice for all active players simultaneously and automatically credits Gold, Sun Shards, Moon Shards, and Glory Points.
  - Individual **Roll Both Dice** (for ousting / card effects), **Roll Light / Dark Die** (Minor Blessings), and **🐂 Minotaur Roll** (subtracts rolled resources).
- **Interactive Choice & Special Face Resolution**:
  - Automatically prompts players when rolling **"OR" choice faces**, **Mirror of the Abyss** (lists opponents' currently rolled faces to copy), **Guardian's Shield** (auto-detects resource matches or lets you pick), **Tenacious Boar**, and **×3 Helmet of Invisibility** (automatically triples the other die's reward).
- **Full Sanctuary & Gardens Forging**:
  - Tracks Sanctuary stock for **2-Player** (2 faces/pool) or **3/4-Player** (4 faces/pool) setups, plus all **Gardens** special card faces and a **Custom Face** builder.
- **Hero Inventory & Score Tracker**:
  - Tracks Gold, Sun, Moon, Glory Track, and Heroic Feat Card Glory with fast `-5 / -1 / +1 / +5` buttons, **Blacksmith's Chest** cap expanders, **Blacksmith's Hammer** progress (`0–30`, auto-awarding `+10` and `+15` Glory), and a 25-step **Undo** button.

## Running Locally

```bash
npm install
npm start
```

Then open `http://localhost:3000` in your browser.

## Deploying to Render.com (Free Tier)

1. Go to [dashboard.render.com](https://dashboard.render.com/) and sign in with GitHub.
2. Click **New +** → **Web Service** (or **Blueprint** to auto-read `render.yaml`).
3. Connect the `RobStallion/dice-forge-helper` repository.
4. Use these settings (auto-detected):
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Click **Create Web Service**!
