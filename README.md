# 🛡️ cursor-cost-guard

> Keep your Cursor bills lean — automatically.

A set of zero-dependency [Cursor Hooks](https://cursor.com/docs/hooks) that protect you from accidentally burning credits on expensive models when cheaper ones work just fine.

---

## The problem

Cursor lets you pick any model — Opus, Sonnet, GPT-4o, you name it. It's easy to switch to a powerful model for one hard task… and forget to switch back. Every subsequent prompt then runs on the expensive model, quietly draining your credits.

## What this does

| Hook | When | What happens |
|---|---|---|
| `beforeSubmitPrompt` | Every time you hit **Send** | If you're not on Cursor 2 or Cursor 2 Fast, a dialog asks you to confirm before sending |
| `stop` | When the agent finishes responding | Silently resets the model back to **Cursor 2 Fast** for the next prompt |

Two small scripts. No servers. No npm installs. Works on macOS, Linux, and Windows.

---

## How it feels

You switch to Claude Opus to work through a tricky architecture problem. Cursor handles it. The moment it finishes, the model is quietly reset to Cursor 2 Fast in the background. Next time you hit Send on a quick edit, the dialog doesn't even appear — you're already on the fast, cheap model.

If you ever do have the wrong model selected and absentmindedly hit Send, you get a calm nudge:

> *You're about to send this prompt using claude-opus-4-6. Consider switching to Cursor 2 or Cursor 2 Fast to keep costs down. Continue anyway, or cancel to change the model first?*

One click to continue, one click to cancel and switch. No commands to remember, no prefixes to type.

---

## File structure

```
.cursor/
├── hooks.json                     ← registers the two lifecycle hooks
└── hooks/
    ├── model-guard.js             ← beforeSubmitPrompt: shows dialog on wrong model
    ├── auto-switch.js             ← stop: resets model + runs plugins
    └── plugins/
        └── example-api-call.js   ← optional: POST a webhook after every response
```

---

## Installation

**1. Copy the `.cursor/` folder into your project root** (or merge with an existing `.cursor/` folder).

```bash
# Clone the repo
git clone https://github.com/latiosthinh/cursor-cost-guard

# Copy the hooks into your project
cp -r cursor-cost-guard/.cursor /path/to/your/project/
```

**2. Make the scripts executable** (macOS / Linux):

```bash
chmod +x .cursor/hooks/model-guard.js
chmod +x .cursor/hooks/auto-switch.js
chmod +x .cursor/hooks/plugins/example-api-call.js
```

**3. Open your project in Cursor.** The hooks load automatically — no restart needed.

> Cursor watches `hooks.json` and reloads on save. If hooks don't fire, check **Settings → Hooks** for debug output, or restart Cursor.

---

## Approved models

By default the guard allows through:

| Model ID | Display name |
|---|---|
| `cursor-small` | Cursor 2 Fast |
| `cursor-large` | Cursor 2 |
| `composer-2` | Cursor 2 (alt ID) |
| `composer-2-fast` | Cursor 2 Fast (alt ID) |

To add or remove models, edit the `APPROVED_MODELS` set at the top of `model-guard.js`:

```js
const APPROVED_MODELS = new Set([
  "cursor-small",    // Cursor 2 Fast
  "cursor-large",    // Cursor 2
  // "gpt-4o-mini",  // add any other model you're happy to use freely
]);
```

> **Tip:** Not sure what ID string Cursor uses for a given model? Open **Settings → Hooks**, send a prompt, and inspect the raw JSON input — the `model` field will have the exact string.

---

## Auto-restore

After the agent finishes each response, `auto-switch.js` writes `cursor-small` back to Cursor's settings file on disk:

| OS | Settings file |
|---|---|
| macOS | `~/Library/Application Support/Cursor/User/settings.json` |
| Linux | `~/.config/Cursor/User/settings.json` |
| Windows | `%APPDATA%\Cursor\User\settings.json` |

The model picker reflects the change on the next chat open or focus. The switch is completely silent — no message, no notification.

To change which model gets restored, edit `DEFAULT_MODEL` in `auto-switch.js`:

```js
const DEFAULT_MODEL = "cursor-small"; // "Cursor 2 Fast"
```

---

## Plugin system

After the model is restored, `auto-switch.js` scans `.cursor/hooks/plugins/` and calls every `.js` file it finds. This lets you bolt on extra automation without touching the core hooks.

**Plugin contract:**

```js
// .cursor/hooks/plugins/my-plugin.js
module.exports = async function (hookInput, switchResult) {
  // hookInput    — Cursor's stop-hook JSON payload
  //   { conversation_id, generation_id, model, status, loop_count, … }
  // switchResult — { success, previousModel, newModel }
};
```

Plugins run in filename order. A plugin that throws is caught and logged — it never crashes the hook chain. To add one, just drop a `.js` file in the folder. No config changes needed.

### Example plugin: webhook / Slack notification

The included `example-api-call.js` POSTs a structured event to any webhook URL after every completed response — useful for Slack alerts, personal dashboards, or CI triggers.

```bash
# Add to ~/.zshrc or ~/.bashrc
export CURSOR_HOOK_WEBHOOK_URL="https://hooks.slack.com/services/xxx/yyy/zzz"
```

Payload:

```json
{
  "event": "cursor_agent_stop",
  "timestamp": "2026-04-20T10:00:00.000Z",
  "conversation_id": "abc-123",
  "status": "completed",
  "model_at_stop": "claude-opus-4-6",
  "model_restored": "cursor-small",
  "workspace": "/Users/you/myproject"
}
```

Zero npm dependencies — uses the native `fetch` API (Node 18+) with an automatic fallback to the built-in `https` module.

---

## Customisation cheatsheet

| Goal | Where to change |
|---|---|
| Add or remove an approved model | `APPROVED_MODELS` in `model-guard.js` |
| Change the dialog message | `message` string in `model-guard.js` |
| Change which model is restored | `DEFAULT_MODEL` in `auto-switch.js` |
| Add post-response automation | Drop a `.js` file in `.cursor/hooks/plugins/` |
| Send a webhook on every response | Set `CURSOR_HOOK_WEBHOOK_URL` env var |

---

## Requirements

- [Cursor](https://cursor.com) **≥ 1.7** (Hooks are a 1.7+ feature)
- **Node.js ≥ 16** on your PATH (for running the `.js` hook scripts)
- No npm packages required

---

## Contributing

PRs welcome. If you build a useful plugin, feel free to open a PR to add it to `plugins/` with a short description.

---

## License

MIT
