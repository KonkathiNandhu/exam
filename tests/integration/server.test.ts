import { test } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { networkConfig } from "../../apps/server/network";
import { buildApp } from "../../apps/server/app";
import { identify } from "../../packages/question-detector/index";
import type { AI } from "../../packages/ai-engine/index";
const origin = "http://localhost:3000";
const network = networkConfig(
  {
    PAIRING_MODE: "cloud",
    PUBLIC_APP_URL: "https://mobile.example.test",
    ALLOWED_APP_ORIGINS: origin,
  },
  {},
);
const q = identify({
  question: "Who invented Java?",
  options: { A: "Guido", B: "James Gosling" },
});
const answer = {
  questionId: q.questionId,
  selectedOption: "B",
  answer: "James Gosling",
  explanation: "Practice fixture",
  status: "answered" as const,
};
const ai: AI = { extract: async () => q, answer: async () => answer };
async function setup(custom = ai) {
  const { app, sessions } = await buildApp(custom, {}, network);
  await app.ready();
  const post = (url: string, payload = {}, token?: string) =>
    app.inject({
      method: "POST",
      url,
      payload,
      headers: {
        origin,
        ...(token ? { authorization: "Bearer " + token } : {}),
      },
    });
  const c = (await post("/api/sessions")).json();
  async function analyze(payload: object, token = c.token) {
    const session = sessions.get(c.id)!;
    const previous = session.desktopSocket;
    session.desktopSocket = { readyState: 1, send: () => {} };
    const refresh = await post(`/api/sessions/${c.id}/refresh`, {}, token);
    session.desktopSocket = previous;
    if (refresh.statusCode !== 200) return refresh;
    return post(
      `/api/sessions/${c.id}/frame`,
      { ...payload, requestId: refresh.json().requestId },
      token,
    );
  }
  return { app, sessions, post, c, analyze };
}
test("pairing one-time exchange, strict auth, origin and capture validation", async () => {
  const { app, post, c, analyze } = await setup();
  try {
    const pair = (await post(`/api/sessions/${c.id}/pair`, {}, c.token)).json();
    assert.ok(pair.url.startsWith(network.appOrigin + "/mobile#"));
    assert.ok(!pair.url.includes("localhost"));
    const token = pair.url.split(".").pop();
    const m = await post("/api/pair", { id: c.id, token });
    assert.equal(m.statusCode, 200);
    assert.equal(
      (await post("/api/pair/status", m.json())).json().approved,
      false,
    );
    assert.equal(
      (
        await post(
          `/api/sessions/${c.id}/pair/approve`,
          { requestId: m.json().requestId, approve: true },
          "bad",
        )
      ).statusCode,
      401,
    );
    await post(
      `/api/sessions/${c.id}/pair/approve`,
      { requestId: m.json().requestId, approve: true },
      c.token,
    );
    const mobile = (await post("/api/pair/status", m.json())).json();

    assert.equal(
      (await post("/api/pair", { id: c.id, token })).statusCode,
      401,
    );
    assert.equal(
      (await post(`/api/sessions/${c.id}/capture`, {}, mobile.token))
        .statusCode,
      403,
    );
    assert.equal(
      (await post(`/api/sessions/${c.id}/capture`, {}, "bad")).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/sessions",
          headers: { origin: "https://evil.example" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await app.inject({ method: "POST", url: "/api/sessions" })).statusCode,
      403,
    );
    await post(`/api/sessions/${c.id}/capture`, {}, c.token);
    assert.equal((await analyze({ frame: "bad" }, c.token)).statusCode, 400);
  } finally {
    await app.close();
  }
});
test("frame extraction, cache, refresh and disconnect lifecycle", async () => {
  let calls = 0;
  const { app, post, c, sessions, analyze } = await setup({
    ...ai,
    answer: async () => {
      calls++;
      return answer;
    },
  });
  try {
    const s = sessions.get(c.id)!;
    await post(`/api/sessions/${c.id}/capture`, {}, c.token);
    const frame = { frame: "data:image/jpeg;base64,YQ==" };
    await analyze(frame, c.token);
    assert.equal(sessions.get(c.id)!.view.answer?.answer, "James Gosling");
    assert.equal(s.view.history.length, 1);
    s.lastFrame = 0;
    await analyze({ frame: "data:image/jpeg;base64,Yg==" }, c.token);
    assert.equal(calls, 2);
    s.lastFrame = 0;
    await analyze({ ...frame, force: true }, c.token);
    assert.equal(calls, 3);
    assert.equal(s.view.history.length, 1);
    assert.equal(
      (await post(`/api/sessions/${c.id}/refresh`, {}, c.token)).statusCode,
      409,
    );
    await post(`/api/sessions/${c.id}/disconnect`, {}, c.token);
    assert.equal(s.view.captureActive, false);
    assert.equal(
      (await post(`/api/sessions/${c.id}/capture`, {}, c.token)).statusCode,
      401,
    );
  } finally {
    await app.close();
  }
});
test("obsolete AI response cannot replace a newer question", async () => {
  let release: () => void = () => {};
  let started: () => void = () => {};
  const ready = new Promise<void>((r) => (started = r));
  const gate = new Promise<void>((r) => (release = r));
  const next = identify({
    question: "What is HTML?",
    options: { A: "HyperText Markup Language", B: "Other" },
  });
  let n = 0;
  const { app, post, c, sessions, analyze } = await setup({
    extract: async () => (++n === 1 ? q : next),
    answer: async (question) => {
      if (question.questionId === q.questionId) {
        started();
        await gate;
        return answer;
      }
      return {
        ...answer,
        questionId: next.questionId,
        selectedOption: "A",
        answer: next.options.A,
      };
    },
  });
  try {
    await post(`/api/sessions/${c.id}/capture`, {}, c.token);
    const first = analyze({ frame: "data:image/jpeg;base64,YQ==" }, c.token);
    await ready;
    await post(`/api/sessions/${c.id}/invalidate`, {}, c.token);
    sessions.get(c.id)!.lastFrame = 0;
    await analyze({ frame: "data:image/jpeg;base64,Yg==" }, c.token);
    release();
    await first;
    assert.equal(sessions.get(c.id)!.view.answer?.questionId, next.questionId);
    assert.equal(sessions.get(c.id)!.view.history.length, 1);
  } finally {
    release();
    await app.close();
  }
});
test("extraction failures clear stale answers; expiration enforced on requests", async () => {
  let fail = false;
  const { app, post, c, sessions, analyze } = await setup({
    ...ai,
    extract: async () => {
      if (fail) throw Error("Timeout");
      return q;
    },
  });
  try {
    const s = sessions.get(c.id)!;
    await post(`/api/sessions/${c.id}/capture`, {}, c.token);
    await analyze({ frame: "data:image/jpeg;base64,YQ==" }, c.token);
    fail = true;
    s.lastFrame = 0;
    await analyze({ frame: "data:image/jpeg;base64,Yg==" }, c.token);
    assert.equal(s.view.answer, null);
    assert.equal(s.view.state, "ERROR");
    s.expiresAt = Date.now() - 1;
    assert.equal(
      (await post(`/api/sessions/${c.id}/capture`, {}, c.token)).statusCode,
      401,
    );
    assert.equal(s.view.state, "EXPIRED");
  } finally {
    await app.close();
  }
});
test("WebSocket authenticated snapshots never include frame or credentials", async () => {
  const { app, c } = await setup();
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address() as any;
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/socket`, {
    origin,
  });
  try {
    await new Promise<void>((r) => socket.on("open", r));
    const message = new Promise<string>((r) =>
      socket.once("message", (d) => r(d.toString())),
    );
    socket.send(JSON.stringify({ ...c, role: "desktop" }));
    const data = await message;
    assert.equal(JSON.parse(data).type, "snapshot");
    assert.ok(!data.includes(c.token));
    assert.ok(!data.includes("data:image"));
  } finally {
    socket.close();
    await new Promise((r) => socket.once("close", r));
    await app.close();
  }
});
test("configured assessment origin allowlist rejects unsupported declarations", async () => {
  process.env.ALLOWED_ASSESSMENT_ORIGINS = "https://training.example";
  const { app } = await buildApp(ai, {}, network);
  delete process.env.ALLOWED_ASSESSMENT_ORIGINS;
  try {
    for (const body of [{}, { sourceOrigin: "https://unrelated.example" }])
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/api/sessions",
            payload: body,
            headers: { origin },
          })
        ).statusCode,
        403,
      );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/sessions",
          payload: { sourceOrigin: "https://training.example" },
          headers: { origin },
        })
      ).statusCode,
      200,
    );
  } finally {
    await app.close();
  }
});
test("cross-origin mobile preflight and API access are explicit, no wildcard origins", async () => {
  const { app } = await buildApp(ai, {}, network);
  try {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/pair",
      headers: {
        origin: network.appOrigin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    assert.equal(response.statusCode, 204);
    assert.equal(
      response.headers["access-control-allow-origin"],
      network.appOrigin,
    );
    assert.match(
      String(response.headers["access-control-allow-headers"]),
      /Authorization/,
    );
    assert.equal(
      (
        await app.inject({
          method: "OPTIONS",
          url: "/api/pair",
          headers: { origin: "https://attacker.example.test" },
        })
      ).statusCode,
      403,
    );
    const config = (await app.inject("/app-config.js")).body;
    assert.ok(config.includes(network.wsOrigin));
    assert.ok(config.includes(network.apiOrigin));
  } finally {
    await app.close();
  }
});
test("missing secure remote configuration blocks QR rather than generating localhost", async () => {
  const config = networkConfig({}, {});
  const { app } = await buildApp(ai, {}, config);
  try {
    const created = (
      await app.inject({
        method: "POST",
        url: "/api/sessions",
        payload: {},
        headers: { origin },
      })
    ).json();
    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${created.id}/pair`,
      payload: {},
      headers: { origin, authorization: "Bearer " + created.token },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().url, undefined);
  } finally {
    await app.close();
  }
});
test("single-use Refresh gates frames, clears old answers, and enforces matching option text", async () => {
  let count = 0;
  const { app, post, c, sessions } = await setup({
    ...ai,
    answer: async () => {
      count++;
      return { ...answer, answer: "Untrusted mismatched text" };
    },
  });
  try {
    const s = sessions.get(c.id)!;
    await post(`/api/sessions/${c.id}/capture`, {}, c.token);
    s.desktopSocket = { readyState: 1, send: () => {}, close: () => {} };
    const refresh = await post(`/api/sessions/${c.id}/refresh`, {}, c.token);
    assert.equal(refresh.statusCode, 200);
    const requestId = refresh.json().requestId;
    const frame = { frame: "data:image/jpeg;base64,YQ==", requestId };
    assert.equal(s.view.answer, null);
    assert.equal(s.view.state, "PROCESSING");
    assert.equal(
      (await post(`/api/sessions/${c.id}/refresh`, {}, c.token)).statusCode,
      409,
    );
    assert.equal(
      (
        await post(
          `/api/sessions/${c.id}/frame`,
          { ...frame, requestId: "wrong" },
          c.token,
        )
      ).statusCode,
      409,
    );
    await post(`/api/sessions/${c.id}/frame`, frame, c.token);
    assert.equal(sessions.get(c.id)!.view.answer?.answer, "James Gosling");
    assert.equal(
      (await post(`/api/sessions/${c.id}/frame`, frame, c.token)).statusCode,
      409,
    );
    assert.equal(count, 1);
    await post(`/api/sessions/${c.id}/refresh`, {}, c.token);
    assert.equal(s.view.answer, null);
    assert.equal(s.view.question, null);
  } finally {
    await app.close();
  }
});

test("accessible text reuses authenticated single-use refresh and exact answer mapping", async () => {
  let calls = 0;
  const { app, sessions, post, c, analyze } = await setup({
    ...ai,
    extractText: async () => {
      calls++;
      return q;
    },
  });
  try {
    const payload = {
      accessibility: { text: q.question, choices: Object.values(q.options) },
    };
    assert.equal((await analyze(payload)).statusCode, 409);
    await post(`/api/sessions/${c.id}/capture`, {}, c.token);
    assert.equal((await analyze(payload)).statusCode, 200);
    assert.equal(calls, 1);
    assert.equal(sessions.get(c.id)!.view.answer?.answer, "James Gosling");
    const requestId = sessions.get(c.id)!.view.requestId;
    assert.equal(
      (
        await post(
          `/api/sessions/${c.id}/frame`,
          { ...payload, requestId },
          c.token,
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await post(
          `/api/sessions/${c.id}/frame`,
          { ...payload, requestId },
          "bad",
        )
      ).statusCode,
      401,
    );
    assert.equal(calls, 1);
    assert.equal(
      (
        await analyze({
          accessibility: { text: "Incomplete question", choices: ["Only one"] },
        })
      ).statusCode,
      400,
    );
  } finally {
    await app.close();
  }
});
