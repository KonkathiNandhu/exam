import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Snapshot, Question, Answer } from "../shared/index";
export const secret = () => randomBytes(32).toString("base64url");
export function same(a: string, b: string) {
  return (
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export class Session {
  id = secret();
  desktopToken = secret();
  mobileToken = "";
  pairToken = "";
  pairExpires = 0;
  pendingPair?: {
    id: string;
    claimToken: string;
    code: string;
    expiresAt: number;
    approved: boolean;
  };
  expiresAt: number;
  generation = 0;
  abort?: AbortController;
  lastFrame = 0;
  frameRequest = "";
  frameTimer?: ReturnType<typeof setTimeout>;
  cache = new Map<string, Answer>();
  listeners = new Set<() => void>();
  view: Snapshot;
  desktopSocket?: any;
  mobileSocket?: any;
  closeTimer?: ReturnType<typeof setTimeout>;
  mobileCloseTimer?: ReturnType<typeof setTimeout>;
  constructor(
    public ttl = 3600000,
    now = Date.now(),
  ) {
    this.expiresAt = now + ttl;
    this.view = {
      state: "IDLE",
      expiresAt: this.expiresAt,
      mobileConnected: false,
      captureActive: false,
      question: null,
      answer: null,
      history: [],
      message: "",
    };
  }
  active(now = Date.now()) {
    if (this.pendingPair && now >= this.pendingPair.expiresAt)
      this.rejectPair();
    if (now >= this.expiresAt) this.end("EXPIRED");
    return this.view.state !== "DISCONNECTED" && this.view.state !== "EXPIRED";
  }
  auth(token: string, role: "desktop" | "mobile") {
    return (
      this.active() &&
      !!token &&
      same(token, role === "desktop" ? this.desktopToken : this.mobileToken)
    );
  }
  pair(now = Date.now()) {
    if (!this.active(now)) throw Error("Session ended");
    this.rejectPair();
    this.pairToken = secret();
    this.pairExpires = now + 120000;
    this.view.state = this.view.captureActive ? "CAPTURING" : "PAIRING";
    this.emit();
    return this.pairToken;
  }
  requestPair(token: string, now = Date.now()) {
    if (
      !this.active(now) ||
      !this.pairToken ||
      !same(token, this.pairToken) ||
      now >= this.pairExpires ||
      this.mobileToken
    )
      throw Error("Invalid pairing");
    this.pairToken = "";
    this.pendingPair = {
      id: secret(),
      claimToken: secret(),
      code: String(randomInt(100000, 1000000)),
      expiresAt: Math.min(now + 120000, this.expiresAt),
      approved: false,
    };
    this.view.pendingPair = {
      id: this.pendingPair.id,
      code: this.pendingPair.code,
      expiresAt: this.pendingPair.expiresAt,
    };
    this.emit();
    return this.pendingPair;
  }
  approvePair() {
    const p = this.pendingPair;
    if (!p || !this.active() || Date.now() >= p.expiresAt)
      throw Error("Pairing expired");
    if (p.approved) return;
    p.approved = true;
    this.mobileToken = secret();
    this.view.pendingPair = undefined;
    this.emit();
  }
  rejectPair() {
    if (this.pendingPair?.approved && !this.view.mobileConnected)
      this.mobileToken = "";
    this.pendingPair = undefined;
    this.view.pendingPair = undefined;
    this.emit();
  }
  emit() {
    for (const listener of this.listeners) listener();
  }
  invalidate() {
    this.frameRequest = "";
    if (this.frameTimer) clearTimeout(this.frameTimer);
    this.generation++;
    this.abort?.abort();
    this.abort = undefined;
  }
  end(state: "DISCONNECTED" | "EXPIRED" = "DISCONNECTED") {
    if (this.view.state === "DISCONNECTED" || this.view.state === "EXPIRED")
      return;
    this.invalidate();
    this.desktopToken = "";
    this.mobileToken = "";
    this.pairToken = "";
    this.pendingPair = undefined;
    this.view.pendingPair = undefined;
    this.cache.clear();
    this.view = {
      ...this.view,
      state,
      captureActive: false,
      mobileConnected: false,
      question: null,
      answer: null,
      history: [],
      message: state === "EXPIRED" ? "Session expired" : "Session disconnected",
    };
    this.emit();
    this.desktopSocket?.close(1000, state);
    this.mobileSocket?.close(1000, state);
    if (this.closeTimer) clearTimeout(this.closeTimer);
    if (this.mobileCloseTimer) clearTimeout(this.mobileCloseTimer);
  }
  publish(q: Question, a: Answer) {
    this.view.question = q;
    this.view.answer = a;
    this.view.state = "CAPTURING";
    if (
      a.status === "answered" &&
      !this.view.history.some((h) => h.question.questionId === q.questionId)
    ) {
      this.view.history.push({ question: q, answer: a });
      this.view.history = this.view.history.slice(-100);
    }
    this.emit();
  }
}
