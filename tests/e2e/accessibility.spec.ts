import { test, expect } from "@playwright/test";
import { questions } from "../../apps/mock-assessment/questions";

test.beforeEach(async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({
    "X-Forwarded-For": `10.253.0.${(testInfo.line % 250) + 1}`,
  });
  await page.addInitScript((question) => {
    (window as any).reads = 0;
    (window as any).disconnects = 0;
    (window as any).changeDuringProcessing = false;
    (window as any).edgeReader = {
      select: async () => ({ title: "Practice quiz — Edge" }),
      read: async () => {
        const count = ++(window as any).reads;
        if (count > 1 && (window as any).changeDuringProcessing)
          return { text: "A different question?", choices: ["One", "Two"] };
        return {
          text: question.question,
          choices: Object.values(question.options),
        };
      },
      disconnect: async () => {
        (window as any).disconnects++;
      },
    };
    navigator.mediaDevices.getDisplayMedia = async () => {
      throw Error("Text mode must never request screen sharing");
    };
  }, questions[0]);
  await page.goto("/overlay");
  await page.getByRole("button", { name: "Start Exam" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Select Edge window" }).click();
  await expect(
    page.getByText("Connected to Practice quiz — Edge"),
  ).toBeVisible();
});

test("Edge text mode reads on demand, returns exact answer and disconnects", async ({
  page,
}) => {
  expect(await page.evaluate(() => (window as any).reads)).toBe(0);
  const request = page.waitForRequest((r) => r.url().endsWith("/frame"));
  await page.getByRole("button", { name: "Refresh" }).click();
  const payload = (await request).postDataJSON();
  expect(payload.frame).toBeUndefined();
  expect(payload.accessibility.choices).toEqual(
    Object.values(questions[0].options),
  );
  await expect(page.locator(".floating-option")).toHaveText("B");
  await expect(page.locator(".floating-text")).toHaveText("James Gosling");
  expect(await page.evaluate(() => (window as any).reads)).toBe(2);
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("status")).toHaveText("Disconnected");
  await expect(page.locator(".floating-option")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).disconnects),
  ).toBeGreaterThan(0);
});

test("a question changed during processing suppresses the old answer", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).changeDuringProcessing = true;
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("status")).toHaveText("Question changed");
  await expect(page.locator(".floating-option")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();
});

test("disconnect during a native read prevents its upload", async ({
  page,
}) => {
  let uploads = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/frame")) uploads++;
  });
  await page.evaluate(() => {
    (window as any).edgeReader.read = () =>
      new Promise((resolve) => {
        (window as any).resolveRead = resolve;
      });
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).resolveRead))
    .toBe("function");
  await page.getByRole("button", { name: "Disconnect" }).click();
  await page.evaluate(() => {
    (window as any).resolveRead({ text: "Old question", choices: ["A", "B"] });
  });
  await expect(page.getByRole("status")).toHaveText("Disconnected");
  expect(uploads).toBe(0);
});
