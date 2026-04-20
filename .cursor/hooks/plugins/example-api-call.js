#!/usr/bin/env node
/**
 * .cursor/hooks/plugins/example-api-call.js
 *
 * Example plugin (C) — called by auto-switch.js after every completed
 * agent response, right after the model is switched back to Cursor 2 Fast.
 *
 * This particular example POSTs a small JSON payload to a webhook URL,
 * useful for:
 *   • Slack / Discord notifications  ("Agent finished task X")
 *   • Internal logging APIs
 *   • CI/CD triggers
 *   • Personal dashboards
 *
 * ── How to configure ────────────────────────────────────────────────────────
 * Set the CURSOR_HOOK_WEBHOOK_URL environment variable to your endpoint,
 * e.g. in your shell profile:
 *
 *   export CURSOR_HOOK_WEBHOOK_URL="https://hooks.slack.com/services/xxx/yyy/zzz"
 *
 * If the variable is not set the plugin is a no-op (nothing is sent).
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Plugin contract (defined by auto-switch.js):
 *   module.exports = async function (hookInput, switchResult) { … }
 *
 *   hookInput    — the raw stop-hook JSON from Cursor
 *                  { conversation_id, generation_id, model, status, loop_count, … }
 *   switchResult — result from the switchModel() call in auto-switch.js
 *                  { success, previousModel, newModel } | { success: false, error }
 */

module.exports = async function exampleApiCall(hookInput, switchResult) {
  const webhookUrl = process.env.CURSOR_HOOK_WEBHOOK_URL;
  if (!webhookUrl) return; // No URL configured — skip silently.

  const payload = {
    event:           "cursor_agent_stop",
    timestamp:       new Date().toISOString(),
    conversation_id: hookInput.conversation_id  || null,
    generation_id:   hookInput.generation_id    || null,
    status:          hookInput.status           || "unknown",
    loop_count:      hookInput.loop_count       ?? null,
    model_at_stop:   hookInput.model            || null,
    model_restored:  switchResult.newModel      || null,
    model_was:       switchResult.previousModel || null,
    workspace:       process.env.CURSOR_PROJECT_DIR || null,
  };

  // Use the built-in fetch (Node 18+) or fall back to https for older runtimes.
  const body = JSON.stringify(payload);

  try {
    if (typeof fetch !== "undefined") {
      // Node 18+ / modern runtime
      const res = await fetch(webhookUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      process.stderr.write(
        `[plugin:example-api-call] POST ${webhookUrl} → HTTP ${res.status}\n`
      );
    } else {
      // Fallback: Node's built-in https module (no external deps needed)
      await postWithHttps(webhookUrl, body);
    }
  } catch (err) {
    // Log but never throw — a failed webhook must never break the hook chain.
    process.stderr.write(
      `[plugin:example-api-call] Request failed: ${err.message}\n`
    );
  }
};

// ── https fallback (zero dependencies) ───────────────────────────────────────

function postWithHttps(url, body) {
  return new Promise((resolve, reject) => {
    const { request } = require("https");
    const parsed      = new URL(url);

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname + parsed.search,
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = request(options, (res) => {
      process.stderr.write(
        `[plugin:example-api-call] POST ${url} → HTTP ${res.statusCode}\n`
      );
      res.resume(); // drain response body
      resolve(res.statusCode);
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
