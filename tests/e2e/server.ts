// Isolated browser-test server. Never imported by production entrypoints.
import { resolve } from "node:path";
import staticPlugin from "@fastify/static";
import { networkConfig } from "../../apps/server/network";
import { buildApp } from "../../apps/server/app";
import { identify } from "../../packages/question-detector/index";
import { questions } from "../../apps/mock-assessment/questions";
// Explicit loopback-only preview exercises the supported local configuration.
const network = networkConfig({ LOCAL_PAIRING_PREVIEW: "true" }, {});
let frames = 0;
let scenario = "default";
const { app } = await buildApp(
  {
    extractText: async (input) => {
      await new Promise((r) => setTimeout(r, 350));
      return identify({
        question: input.text,
        options: Object.fromEntries(
          input.choices.map((choice, index) => [
            String.fromCharCode(65 + index),
            choice,
          ]),
        ),
      });
    },
    extract: async () => {
      await new Promise((r) => setTimeout(r, 350));
      if (scenario === "unreadable") return null;
      const n = frames++;
      if (n >= 3) throw Error("Controlled extraction failure");
      const raw = questions[n === 1 ? 1 : 0];
      return identify(
        n === 2
          ? {
              ...raw,
              options: Object.fromEntries(
                Object.values(raw.options).map((text, i) => [
                  String(i + 1),
                  text,
                ]),
              ),
            }
          : raw,
      );
    },
    answer: async (q) => {
      if (scenario === "uncertain")
        return {
          questionId: q.questionId,
          selectedOption: null,
          answer: "Uncertain",
          explanation: "Controlled uncertainty",
          status: "uncertain",
        };
      const raw = questions.find((x) => x.question === q.question)!;
      const selectedOption = q.options[raw.correct]
        ? raw.correct
        : String(raw.correct.charCodeAt(0) - 64);
      return {
        questionId: q.questionId,
        selectedOption,
        answer: q.options[selectedOption],
        explanation: "Controlled browser-test fixture",
        status: "answered",
      };
    },
  },
  { trustProxy: true }, // Test-only forwarded client IPs isolate rate-limit buckets.
  network,
);
// Isolated test fixture controls; never registered by the production server.
app.post("/test/reset", async (req) => {
  frames = 0;
  scenario = (req.body as any)?.scenario || "default";
  return { ok: true };
});
await app.register(staticPlugin, { root: resolve("dist/web") });
app.setNotFoundHandler((req, reply) => reply.sendFile("index.html"));
await app.listen({ host: "127.0.0.1", port: 3000 });
