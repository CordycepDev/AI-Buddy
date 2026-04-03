# AI Buddy - Obsidian Plugin

A Clippy-style AI assistant that lives in the corner of your Obsidian vault. Meet **Pip** - a friendly floating robot buddy who can chat, offer proactive tips about your notes, and physically move to the text it's referencing.

## Features

- **Floating animated avatar** in the corner of your workspace (draggable)
- **AI-powered chat** with context from your current note
- **Proactive tips** - Pip periodically offers observations about what you're working on
- **Quote location** - Pip moves to the exact text in your note it's commenting on, with a bouncing arrow indicator
- **Scroll tracking** - Pip sticks to the referenced text as you scroll
- **Custom avatar** - use your own image or paste a GIF URL (Giphy, Tenor, etc.)
- **GIF speed control** - adjust animated GIF playback from 0.25x to 4x
- **Secure API key storage** - uses Obsidian's native secret storage (OS keychain)
- **Multiple AI providers** - supports Anthropic Claude and OpenAI

## Installation

### Using BRAT (recommended for beta)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat)
2. Open BRAT settings and click **Add Beta Plugin**
3. Enter: `CordycepDev/AI-Buddy`
4. Click **Add Plugin** and enable it

### Manual Installation

1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](https://github.com/CordycepDev/AI-Buddy/releases/latest)
2. Create a folder `ai-buddy` in your vault's `.obsidian/plugins/` directory
3. Place the downloaded files in that folder
4. Enable the plugin in Obsidian settings

## Configuration

1. Go to **Settings > AI Buddy**
2. Add your API key (Claude or OpenAI) - stored securely in your OS keychain
3. Customize Pip's name, personality, avatar, and tip behavior

## Requirements

- Obsidian v1.11.4 or higher
- An API key from Anthropic (Claude) or OpenAI

## Commands

- **Toggle AI Buddy** - show/hide Pip
- **Reset AI Buddy position** - snap Pip back to the default corner
- **Open AI Buddy chat** - open the chat panel

## License

MIT
