import { test } from "node:test";
import assert from "node:assert/strict";
import { api, apiURL, socketURL } from "../../apps/client";
test("desktop localhost and mobile both use the configured remote API/WSS; Refresh and Disconnect target the backend", async () => {
  const oldWindow = (globalThis as any).window;
  const oldLocation = (globalThis as any).location;
  const oldFetch = globalThis.fetch;
  const calls: { url: string; auth: string | null }[] = [];
  try {
    (globalThis as any).window = {
      __APP_CONFIG__: {
        apiOrigin: "https://api.example.test",
        wsOrigin: "wss://socket.example.test",
      },
    };
    (globalThis as any).location = { origin: "http://localhost:3000" };
    assert.equal(apiURL("health"), "https://api.example.test/api/health");
    assert.equal(socketURL(), "wss://socket.example.test/api/socket");
    globalThis.fetch = async (url, options) => {
      calls.push({
        url: String(url),
        auth: new Headers(options?.headers).get("Authorization"),
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    for (const action of ["refresh", "disconnect"])
      await api(`sessions/id/${action}`, {}, { id: "id", token: "secret" });
    assert.deepEqual(calls, [
      {
        url: "https://api.example.test/api/sessions/id/refresh",
        auth: "Bearer secret",
      },
      {
        url: "https://api.example.test/api/sessions/id/disconnect",
        auth: "Bearer secret",
      },
    ]);
  } finally {
    (globalThis as any).window = oldWindow;
    (globalThis as any).location = oldLocation;
    globalThis.fetch = oldFetch;
  }
});
