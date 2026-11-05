import { networkConfig, type NetworkConfig } from "./network";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { Session, same, secret } from "../../packages/session-manager/index";
import {
  Provider,
  ProviderError,
  type AI,
} from "../../packages/ai-engine/index";
const authSchema = z.object({
  id: z.string().max(100),
  token: z.string().max(100),
  role: z.enum(["desktop", "mobile"]),
});
export async function buildApp(
  ai: AI = new Provider(),
  options: any = {},
  network: NetworkConfig = networkConfig(),
) {
  const app = Fastify({ logger: false, bodyLimit: 1800000, ...options });
  const sessions = new Map<string, Session>();
  const origins = network.allowedOrigins;
  await app.register(rateLimit, { max: 90, timeWindow: 60000 });
  await app.register(websocket, { options: { maxPayload: 2048 } });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Referrer-Policy", "no-referrer")
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "no-store")
      .header("Permissions-Policy", "camera=(), microphone=()")
      .header(
        "Content-Security-Policy",
        `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${network.apiOrigin} ${network.wsOrigin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
      );
    if (req.headers.origin && origins.includes(req.headers.origin)) {
      reply
        .header("Access-Control-Allow-Origin", req.headers.origin)
        .header("Vary", "Origin")
        .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        .header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.headers.origin && !origins.includes(req.headers.origin))
      return reply.code(403).send({ error: "Origin denied" });
    if (req.method === "OPTIONS") return reply.code(204).send();
    if (req.method === "POST" && !origins.includes(req.headers.origin || ""))
      return reply.code(403).send({ error: "Origin required" });
  });
  app.setErrorHandler((err, req, reply) => {
    const status =
      err instanceof z.ZodError ? 400 : (err as any).statusCode || 500;
    reply.code(status).send({
      error: status === 500 ? "Request failed" : (err as Error).message,
    });
  });
  function authorized(req: any, reply: any) {
    const id = req.params.id;
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    const s = sessions.get(id);
    if (!s || (!s.auth(token, "desktop") && !s.auth(token, "mobile"))) {
      reply.code(401).send({ error: "Session unauthorized or ended" });
      return;
    }
    return { s, desktop: s.auth(token, "desktop") };
  }
  const allowedAssessmentOrigins = (
    process.env.ALLOWED_ASSESSMENT_ORIGINS || ""
  )
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  app.options("/api/*", async (req, reply) => reply.code(204).send());
  const publicConfig = {
    pairingMode: network.mode,
    localPreview: network.localPreview || false,
    appOrigin: network.appOrigin,
    apiOrigin: network.apiOrigin,
    wsOrigin: network.wsOrigin,
    selectedLanIP: network.selectedLanIP,
    candidates: network.candidates,
    configurationError: network.error,
  };
  app.get("/app-config.js", async (req, reply) =>
    reply
      .type("application/javascript")
      .send(
        `window.__APP_CONFIG__=${JSON.stringify(publicConfig).replace(/</g, "\\u003c")};`,
      ),
  );
  app.get("/api/config", async () => ({
    allowedAssessmentOrigins,
    ...publicConfig,
  }));
  app.get("/api/health", async () => ({ ok: true }));
  app.post("/api/sessions", async (req, reply) => {
    const body = z
      .object({ sourceOrigin: z.string().url().optional() })
      .parse(req.body || {});
    if (
      allowedAssessmentOrigins.length &&
      !allowedAssessmentOrigins.includes(body.sourceOrigin || "")
    )
      return reply
        .code(403)
        .send({ error: "Assessment origin is not allowed" });
    if (sessions.size >= 200)
      return reply.code(503).send({ error: "Session capacity reached" });
    const s = new Session();
    sessions.set(s.id, s);
    return { id: s.id, token: s.desktopToken, expiresAt: s.expiresAt };
  });
  app.post("/api/sessions/:id/pair", async (req, reply) => {
    const a = authorized(req, reply);
    if (!a) return;
    if (!a.desktop) return reply.code(403).send({ error: "Desktop only" });
    if (a.s.mobileToken)
      return reply.code(409).send({ error: "Mobile is already paired" });
    if (network.error || !network.appOrigin)
      return reply
        .code(503)
        .send({ error: network.error || "Mobile origin is not configured" });
    return {
      url: `${network.appOrigin}/mobile#${a.s.id}.${a.s.pair()}`,
      expiresAt: a.s.pairExpires,
      localPreview: network.localPreview || false,
    };
  });
  app.post("/api/pair", async (req, reply) => {
    const b = z
      .object({ id: z.string().max(100), token: z.string().max(100) })
      .parse(req.body);
    const s = sessions.get(b.id);
    try {
      if (!s) throw Error();
      const pending = s.requestPair(b.token);
      return {
        id: s.id,
        requestId: pending.id,
        claimToken: pending.claimToken,
        code: pending.code,
        expiresAt: pending.expiresAt,
      };
    } catch {
      return reply
        .code(401)
        .send({ error: "Invalid, used, or expired pairing code" });
    }
  });
  app.post("/api/pair/status", async (req, reply) => {
    const b = z
      .object({ id: z.string(), requestId: z.string(), claimToken: z.string() })
      .parse(req.body);
    const s = sessions.get(b.id);
    const p = s?.pendingPair;
    if (
      !s?.active() ||
      !p ||
      p.id !== b.requestId ||
      !same(p.claimToken, b.claimToken) ||
      Date.now() >= p.expiresAt
    )
      return reply.code(401).send({
        error:
          "Pairing expired, rejected, or session disconnected. Generate a new QR code.",
      });
    return p.approved
      ? { approved: true, id: s.id, token: s.mobileToken }
      : { approved: false };
  });
  app.post("/api/sessions/:id/pair/approve", async (req, reply) => {
    const a = authorized(req, reply);
    if (!a) return;
    if (!a.desktop) return reply.code(403).send({ error: "Desktop only" });
    const b = z
      .object({ requestId: z.string(), approve: z.boolean() })
      .parse(req.body);
    if (
      !a.s.pendingPair ||
      a.s.pendingPair.id !== b.requestId ||
      Date.now() >= a.s.pendingPair.expiresAt
    )
      return reply.code(410).send({ error: "Pairing request expired" });
    if (b.approve) a.s.approvePair();
    else a.s.rejectPair();
    return { ok: true };
  });
  app.post("/api/sessions/:id/capture", async (req, reply) => {
    const a = authorized(req, reply);
    if (!a) return;
    if (!a.desktop) return reply.code(403).send({ error: "Desktop only" });
    a.s.view.captureActive = true;
    a.s.view.state = "CAPTURING";
    a.s.emit();
    return { ok: true };
  });
  app.post("/api/sessions/:id/disconnect", async (req, reply) => {
    const a = authorized(req, reply);
    if (!a) return;
    a.s.end();
    return { ok: true };
  });
  app.post("/api/sessions/:id/refresh", async (req, reply) => {
    const a = authorized(req, reply);
    if (!a) return;
    if (!a.s.view.captureActive || a.s.desktopSocket?.readyState !== 1)
      return reply.code(409).send({ error: "No active capture" });
    const s = a.s;
    if (s.view.state === "PROCESSING")
      return reply
        .code(409)
        .send({ error: "Already processing a Refresh request" });
    s.invalidate();
    const requestId = secret();
    s.frameRequest = requestId;
    s.view.requestId = requestId;
    s.view.question = null;
    s.view.answer = null;
    s.view.state = "PROCESSING";
    s.view.message = "Processing";
    s.emit();
    s.frameTimer = setTimeout(() => {
      if (s.frameRequest !== requestId) return;
      s.invalidate();
      s.view.state = "ERROR";
      s.view.message = "Desktop did not provide a frame. Try Refresh.";
      s.emit();
    }, 8000);
    s.desktopSocket.send(JSON.stringify({ type: "refresh", requestId }));
    return { ok: true, requestId };
  });
  app.post("/api/sessions/:id/frame-error", async (req, reply) => {
    const a = authorized(req, reply);
    if (!a) return;
    if (!a.desktop) return reply.code(403).send({ error: "Desktop only" });
    const b = z.object({ requestId: z.string() }).parse(req.body);
    if (a.s.view.requestId === b.requestId) {
      a.s.invalidate();
      a.s.view.question = null;
      a.s.view.answer = null;
      a.s.view.state = "ERROR";
      a.s.view.message = "Capture failed. Try Refresh.";
      a.s.emit();
    }
    return { ok: true };
  });
  app.post("/api/sessions/:id/invalidate", async (req, reply) => {
    const a = authorized(req, reply);
    if (!a) return;
    if (!a.desktop) return reply.code(403).send({ error: "Desktop only" });
    a.s.invalidate();
    a.s.view.question = null;
    a.s.view.answer = null;
    a.s.view.state = "CAPTURING";
    a.s.view.message = "Screen changed. Waiting for a stable question…";
    a.s.emit();
    return { ok: true };
  });
  app.post("/api/sessions/:id/frame", async (req, reply) => {
    const a = authorized(req, reply);
    if (!a) return;
    const s = a.s;
    if (!a.desktop || !s.view.captureActive)
      return reply.code(403).send({ error: "Capture not authorized" });
    const b = z
      .object({
        frame: z
          .string()
          .max(1750000)
          .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/),
        requestId: z.string().min(1).max(100),
      })
      .parse(req.body);
    if (s.frameRequest !== b.requestId)
      return reply
        .code(409)
        .send({ error: "Frame requires an unused Refresh request" });
    s.invalidate();
    const generation = s.generation;
    const controller = new AbortController();
    s.abort = controller;
    s.view.question = null;
    s.view.answer = null;
    s.view.state = "PROCESSING";
    s.view.message = "Reading the authorized screen…";
    s.emit();
    try {
      const q = await ai.extract(b.frame, controller.signal);
      if (!s.active() || s.generation !== generation) return { obsolete: true };
      if (!q) {
        s.view.state = "CAPTURING";
        s.view.message =
          "No readable complete question. Keep the question and choices visible.";
        s.emit();
        return { ok: true };
      }
      s.view.question = q;
      s.view.message = "Generating suggested answer…";
      s.emit();
      const candidate = await ai.answer(q, controller.signal);
      if (candidate.questionId !== q.questionId)
        throw Error("Mismatched answer");
      const answer =
        candidate.status === "answered" &&
        candidate.selectedOption &&
        q.options[candidate.selectedOption]
          ? { ...candidate, answer: q.options[candidate.selectedOption] }
          : {
              ...candidate,
              status: "uncertain" as const,
              selectedOption: null,
              answer: "Uncertain",
            };
      if (s.active() && s.generation === generation) {
        s.cache.set(q.questionId, answer);
        if (s.cache.size > 100) s.cache.delete(s.cache.keys().next().value!);
        s.view.message = "";
        s.publish(q, answer);
      }
    } catch (error) {
      if (s.active() && s.generation === generation) {
        s.view.state = "ERROR";
        s.view.question = null;
        s.view.answer = null;
        s.view.message =
          error instanceof ProviderError
            ? error.publicMessage
            : "Extraction or AI request failed. Check provider configuration and try Refresh.";
        s.emit();
        app.log.warn({ event: "analysis_failed", session: s.id.slice(0, 8) });
      }
    }
    return { ok: true };
  });
  app.get("/api/socket", { websocket: true }, (socket, req) => {
    if (!origins.includes(req.headers.origin || "")) {
      socket.close(1008, "Origin denied");
      return;
    }
    let session: Session | undefined;
    let role: "desktop" | "mobile" | undefined;
    let listener: (() => void) | undefined;
    let alive = true;
    const timer = setTimeout(
      () => socket.close(1008, "Authentication required"),
      5000,
    );
    socket.on("pong", () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, 15000);
    socket.on("message", (data) => {
      if (session) return;
      try {
        const b = authSchema.parse(JSON.parse(data.toString()));
        const s = sessions.get(b.id);
        if (!s?.auth(b.token, b.role)) throw Error();
        if (b.role === "desktop" && s.desktopSocket?.readyState === 1)
          throw Error();
        if (b.role === "mobile" && s.mobileSocket?.readyState === 1)
          throw Error();
        session = s;
        role = b.role;
        clearTimeout(timer);
        if (role === "desktop") {
          if (s.closeTimer) clearTimeout(s.closeTimer);
          s.desktopSocket = socket;
        } else {
          if (s.mobileCloseTimer) clearTimeout(s.mobileCloseTimer);
          s.mobileSocket = socket;
          s.view.mobileConnected = true;
          s.pendingPair = undefined;
        }
        listener = () => {
          if (socket.readyState === 1)
            socket.send(
              JSON.stringify({
                type: "snapshot",
                ...s.view,
                ...(role === "mobile"
                  ? {
                      question: null,
                      history: [],
                      answer: s.view.answer
                        ? { ...s.view.answer, explanation: "" }
                        : null,
                    }
                  : {}),
              }),
            );
        };
        s.listeners.add(listener);
        s.emit();
      } catch {
        socket.close(1008, "Unauthorized");
      }
    });
    socket.on("close", () => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      if (session && listener) {
        const s = session;
        s.listeners.delete(listener);
        if (role === "mobile" && s.mobileSocket === socket) {
          s.mobileSocket = undefined;
          s.view.mobileConnected = false;
          s.emit();
          if (s.active()) s.mobileCloseTimer = setTimeout(() => s.end(), 20000);
        }
        if (role === "desktop" && s.desktopSocket === socket) {
          s.desktopSocket = undefined;
          if (!s.active()) return;
          s.invalidate();
          s.view.question = null;
          s.view.answer = null;
          s.view.captureActive = false;
          s.view.state = "ERROR";
          s.view.message = "Desktop disconnected";
          s.emit();
          if (s.active()) s.closeTimer = setTimeout(() => s.end(), 5000);
        }
      }
    });
  });
  const sweep = setInterval(() => {
    for (const [id, s] of sessions) {
      if (!s.active()) {
        s.end();
        sessions.delete(id);
      }
    }
  }, 1000);
  sweep.unref();
  app.addHook("onClose", async () => {
    clearInterval(sweep);
    for (const s of sessions.values()) s.end();
  });
  return { app, sessions };
}
