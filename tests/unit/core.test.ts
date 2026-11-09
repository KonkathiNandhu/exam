import { test } from "node:test";
import assert from "node:assert/strict";
import { identify } from "../../packages/question-detector/index";
import { Session } from "../../packages/session-manager/index";
import { Provider } from "../../packages/ai-engine/index";
const input = {
  question: "Who invented Java?",
  options: { A: "Guido", B: "James Gosling" },
};
test("normalization deduplicates whitespace and ignores question number", () => {
  assert.equal(
    identify(input).questionId,
    identify({ ...input, number: "2", question: " WHO  invented Java? " })
      .questionId,
  );
});
test("changed option order or text gives new identity", () => {
  assert.notEqual(
    identify(input).questionId,
    identify({ ...input, options: { A: "James Gosling", B: "Guido" } })
      .questionId,
  );
});
test("missing, empty, or invalid option labels rejected", () => {
  for (const options of [
    {},
    { A: "One" },
    { A: "", B: "Two" },
    { foo: "one", bar: "two" },
  ])
    assert.throws(() => identify({ ...input, options }));
});
test("numeric and multiline options supported", () => {
  assert.equal(
    identify({ ...input, options: { "1": "First\nline", "2": "Second" } })
      .options["1"],
    "First\nline",
  );
});
test("single-use pairing, expiry, and role authentication", () => {
  const s = new Session();
  const t = s.pair();
  assert.throws(() => s.requestPair("bad"));
  const pending = s.requestPair(t);
  assert.equal(s.mobileToken, "");
  s.approvePair();
  const m = s.mobileToken;
  assert.ok(s.auth(m, "mobile"));
  assert.ok(!s.auth(m, "desktop"));
  assert.throws(() => s.requestPair(t));
  const other = new Session();
  const token = other.pair();
  assert.throws(() => other.requestPair(token, other.pairExpires));
});
test("60 minute expiry revokes all credentials and cancels work", () => {
  const s = new Session();
  const desktop = s.desktopToken;
  s.abort = new AbortController();
  const signal = s.abort.signal;
  assert.equal(s.expiresAt - s.ttl <= Date.now(), true);
  s.active(s.expiresAt);
  assert.ok(signal.aborted);
  assert.equal(s.view.state, "EXPIRED");
  assert.ok(!s.auth(desktop, "desktop"));
});
test("completed history deduplicated and uncertainty not recorded", () => {
  const s = new Session();
  const q = identify(input);
  const a = {
    questionId: q.questionId,
    selectedOption: "B",
    answer: "James Gosling",
    explanation: "Example",
    status: "answered" as const,
  };
  s.publish(q, a);
  s.publish(q, a);
  assert.equal(s.view.history.length, 1);
  s.publish(identify({ ...input, question: "Another question?" }), {
    ...a,
    status: "uncertain",
  });
  assert.equal(s.view.history.length, 1);
  s.end();
  assert.equal(s.view.history.length, 0);
});
test("AI answers validated and invalid choices become uncertain", async () => {
  const p = new Provider();
  const q = identify(input);
  p.call = async () => ({
    questionId: q.questionId,
    selectedOption: "Z",
    explanation: "Unsure",
    status: "answered",
  });
  assert.equal(
    (await p.answer(q, new AbortController().signal)).status,
    "uncertain",
  );
  p.call = async () => ({
    questionId: "wrong",
    selectedOption: "B",
    explanation: "bad",
    status: "answered",
  });
  await assert.rejects(p.answer(q, new AbortController().signal));
});
test("unreadable vision output returns no question", async () => {
  const p = new Provider();
  p.call = async () => ({ visible: false });
  assert.equal(await p.extract("fixture", new AbortController().signal), null);
});
test("vision extraction labels unlabeled radio choices in reading order", async () => {
  const p = new Provider();
  p.call = async () => ({
    question: "Which declaration uses a floating-point value?",
    options: ["float x = 2.8f;", "int x = 2.8f;", "byte x = 2.8f;"],
  });
  const question = await p.extract("fixture", new AbortController().signal);
  assert.deepEqual(question?.options, {
    A: "float x = 2.8f;",
    B: "int x = 2.8f;",
    C: "byte x = 2.8f;",
  });
});
test("credential comparisons safely reject non-ASCII attacker input", () => {
  const s = new Session();
  assert.equal(s.auth("é".repeat(s.desktopToken.length), "desktop"), false);
});
test("pending approvals expire and cannot be approved or reused", () => {
  const s = new Session();
  const token = s.pair();
  s.requestPair(token);
  assert.throws(() => s.requestPair(token));
  s.pendingPair!.expiresAt = Date.now() - 1;
  assert.throws(() => s.approvePair());
  s.active();
  assert.equal(s.pendingPair, undefined);
  assert.equal(s.mobileToken, "");
  assert.equal(s.view.pendingPair, undefined);
});
test("missing backend key reports an actionable safe configuration error", async () => {
  const previous = process.env.AI_API_KEY;
  try {
    delete process.env.AI_API_KEY;
    const p = new Provider();
    await assert.rejects(
      p.call([], "configured-model", new AbortController().signal),
      (e) =>
        e instanceof Error &&
        e.message.includes("Add AI_API_KEY") &&
        e.message.includes("restart"),
    );
  } finally {
    if (previous === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = previous;
  }
});
