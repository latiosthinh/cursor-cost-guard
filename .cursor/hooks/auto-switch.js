#!/usr/bin/env node
/**
 * .cursor/hooks/auto-switch.js
 *
 * Hook: stop
 *
 * Behaviour (B):
 *   After the agent finishes a response, write the preferred model back to
 *   Cursor's composer settings file so the next session starts on
 *   "Cursor 2 Fast" automatically.
 *
 * Behaviour (C):
 *   After (B) completes, dynamically load every *.js file found inside
 *   .cursor/hooks/plugins/ and call its default export as:
 *
 *       module.default(hookInput, switchResult)
 *
 *   This lets you drop in extra automation without touching this file.
 *   See .cursor/hooks/plugins/example-api-call.js for a worked example.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NOTE ON MODEL SWITCHING
 * ─────────────────────────────────────────────────────────────────────────
 * Cursor does not currently expose a public API for programmatically
 * changing the active model from a hook.  The approach used here writes
 * the preference to the settings JSON that Cursor reads on start-up /
 * focus.  If Cursor changes its storage format this path may need updating.
 *
 * Known settings locations (Cursor ≥ 1.7):
 *   macOS  : ~/Library/Application Support/Cursor/User/settings.json
 *   Linux  : ~/.config/Cursor/User/settings.json
 *   Windows: %APPDATA%\Cursor\User\settings.json
 *
 * The relevant key is "cursor.composer.defaultModel".
 * ─────────────────────────────────────────────────────────────────────────
 */

const fs   = require("fs");
const path = require("path");
const os   = require("os");

// ── Configuration ────────────────────────────────────────────────────────────

/**
 * The model ID to restore after each completed turn.
 * You can override per-machine via env var CURSOR_PREFERRED_MODEL.
 */
const DEFAULT_MODEL = process.env.CURSOR_PREFERRED_MODEL || "composer-2-fast";

/**
 * Settings keys Cursor has used across versions to persist composer defaults.
 * We write all of them to maximize compatibility; unknown keys are harmless.
 */
const SETTINGS_KEYS = [
  "cursor.composer.defaultModel",
  "cursor.composer.model",
  "cursor.composer.selectedModel",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCursorSettingsPath() {
  const platform = os.platform();
  if (platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library", "Application Support", "Cursor", "User", "settings.json"
    );
  }
  if (platform === "win32") {
    return path.join(process.env.APPDATA || "", "Cursor", "User", "settings.json");
  }
  // Linux / WSL
  return path.join(os.homedir(), ".config", "Cursor", "User", "settings.json");
}

function switchModel(modelId) {
  const settingsPath = getCursorSettingsPath();
  const settingsDir = path.dirname(settingsPath);
  let settings = {};

  try {
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    }
  } catch (err) {
    process.stderr.write(`[auto-switch] Could not read settings: ${err.message}\n`);
    return { success: false, error: err.message };
  }

  const previousModel =
    SETTINGS_KEYS.map((k) => settings[k]).find((v) => v != null) || null;
  for (const key of SETTINGS_KEYS) {
    settings[key] = modelId;
  }

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  } catch (err) {
    process.stderr.write(`[auto-switch] Could not write settings: ${err.message}\n`);
    return { success: false, error: err.message };
  }

  process.stderr.write(
    `[auto-switch] Model switched: ${previousModel || "(unset)"} → ${modelId}\n`
  );
  return { success: true, previousModel, newModel: modelId };
}

// ── Plugin loader (C) ─────────────────────────────────────────────────────────

async function runPlugins(hookInput, switchResult) {
  // Plugins live in .cursor/hooks/plugins/ relative to the project root.
  // CURSOR_PROJECT_DIR is provided by Cursor as an env var.
  const projectDir = process.env.CURSOR_PROJECT_DIR || process.cwd();
  const pluginsDir = path.join(projectDir, ".cursor", "hooks", "plugins");

  if (!fs.existsSync(pluginsDir)) return;

  let files;
  try {
    files = fs.readdirSync(pluginsDir).filter((f) => f.endsWith(".js"));
  } catch {
    return;
  }

  for (const file of files) {
    const fullPath = path.join(pluginsDir, file);
    try {
      // Use a fresh require so plugins can be hot-swapped between sessions.
      delete require.cache[require.resolve(fullPath)];
      const plugin = require(fullPath);
      const fn = plugin.default || plugin;
      if (typeof fn === "function") {
        process.stderr.write(`[auto-switch] Running plugin: ${file}\n`);
        await Promise.resolve(fn(hookInput, switchResult));
      }
    } catch (err) {
      // Plugins fail silently — never let a plugin crash the main hook.
      process.stderr.write(`[auto-switch] Plugin "${file}" failed: ${err.message}\n`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;

  let hookInput = {};
  try {
    hookInput = JSON.parse(raw);
  } catch {
    // Ignore parse errors — still attempt the model switch.
  }

  // (B) Switch back to the default model.
  const switchResult = switchModel(DEFAULT_MODEL);

  // (C) Run all plugins in .cursor/hooks/plugins/
  await runPlugins(hookInput, switchResult);

  // The stop hook can optionally return a followup_message.
  // We return an empty object to avoid auto-continuing the conversation.
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[auto-switch] Unexpected error: ${err.message}\n`);
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
});
