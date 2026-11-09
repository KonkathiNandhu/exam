import { test } from "node:test";
import assert from "node:assert/strict";
import { Provider } from "../../packages/ai-engine/index";
import { accessibleQuestionSchema } from "../../packages/shared/index";

const input = {
  text: "Java Quiz\nHow do you create a variable with the floating number 2.8?",
  choices: ["float x = 2.8f;", "x = 2.8f;", "int x = 2.8f;", "byte x = 2.8f"],
};
test("accessible extraction uses text and preserves every option exactly", async () => {
  const provider = new Provider();
  provider.call = async (messages) => {
    assert.deepEqual(JSON.parse((messages[1] as any).content), input);
    return {
      question: "How do you create a variable with the floating number 2.8?",
    };
  };
  const question = await provider.extractText(
    input,
    new AbortController().signal,
  );
  assert.equal(question?.options.A, "float x = 2.8f;");
  assert.deepEqual(Object.values(question!.options), input.choices);
});
test("invented or ambiguous questions never reach answering", async () => {
  const provider = new Provider();
  provider.call = async () => ({ question: "Who invented Java?" });
  assert.equal(
    await provider.extractText(input, new AbortController().signal),
    null,
  );
  provider.call = async () => ({ visible: false });
  assert.equal(
    await provider.extractText(input, new AbortController().signal),
    null,
  );
});
test("accessible input bounds reject partial and oversized payloads", () => {
  assert.throws(() =>
    accessibleQuestionSchema.parse({ ...input, choices: ["one"] }),
  );
  assert.throws(() =>
    accessibleQuestionSchema.parse({ ...input, text: "a".repeat(24001) }),
  );
  assert.throws(() =>
    accessibleQuestionSchema.parse({ ...input, choices: ["one", ""] }),
  );
});
