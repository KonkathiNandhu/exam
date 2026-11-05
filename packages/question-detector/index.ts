import { createHash } from "node:crypto";
import { questionSchema, type Question } from "../shared/index";
export function normalize(s: string) {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}
export function identify(input: unknown): Question {
  const q = questionSchema.parse(input);
  const canonical = JSON.stringify([
    normalize(q.question),
    Object.entries(q.options)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, normalize(v)]),
  ]);
  return {
    ...q,
    questionId: createHash("sha256").update(canonical).digest("hex"),
  };
}
