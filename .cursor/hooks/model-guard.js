#!/usr/bin/env node
/**
 * .cursor/hooks/model-guard.js
 *
 * Hook: beforeSubmitPrompt
 *
 * Behaviour (A):
 *   - If the active model is NOT one of the approved Cursor models AND
 *     the prompt does NOT start with "/yolo", block submission and show
 *     a friendly warning asking the user to either switch models or
 *     prefix their prompt with /yolo to proceed anyway.
 *
 * Approved models (adjust to match Cursor's exact internal model IDs):
 *   "cursor-small"   → "Cursor 2 Fast"
 *   "cursor-large"   → "Cursor 2"  (sometimes "composer" in older builds)
 */

const APPROVED_MODELS = new Set([
  // Add / adjust these strings to match what Cursor sends in `model` field.
  // Check your hook debug output in Settings → Hooks to confirm the exact values.
  "cursor-small",        // Cursor 2 Fast
  "cursor-large",        // Cursor 2
  "composer-2",          // alternative ID seen in some builds
  "composer-2-fast",     // alternative ID seen in some builds
  "cursor-composer-2",       // Composer 2 (newer docs)
  "cursor-composer-2-fast",  // Composer 2 Fast (newer docs)
]);

const YOLO_PREFIX = "/yolo";

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    // Can't parse input — fail open so we never accidentally block the user
    process.stdout.write(JSON.stringify({ permission: "allow", continue: true }));
    process.exit(0);
  }

  const model  = (input.model  || "").toLowerCase();
  const prompt = (input.prompt || "").trimStart();

  // Pass through immediately if using an approved model
  if (APPROVED_MODELS.has(model)) {
    process.stdout.write(JSON.stringify({ permission: "allow", continue: true }));
    process.exit(0);
  }

  // Also pass through if the user explicitly opted-in with /yolo
  if (prompt.toLowerCase().startsWith(YOLO_PREFIX)) {
    process.stdout.write(JSON.stringify({ permission: "allow", continue: true }));
    process.exit(0);
  }

  // Otherwise: block and explain
  const displayModel = input.model || "unknown model";
  const message =
    `⚠️  You are currently using **${displayModel}**.\n` +
    `Switch to **Cursor 2** or **Cursor 2 Fast**, ` +
    `or start your prompt with \`/yolo\` to proceed anyway.`;

  process.stdout.write(
    JSON.stringify({
      permission: "deny",
      continue: false,
      user_message: message,
    })
  );
  process.exit(0);
}

main().catch((err) => {
  // On unexpected errors, fail open
  process.stderr.write(`[model-guard] error: ${err.message}\n`);
  process.stdout.write(JSON.stringify({ permission: "allow", continue: true }));
  process.exit(0);
});
