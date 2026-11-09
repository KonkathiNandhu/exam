import { test, expect, type Page } from "@playwright/test";
// These tests explicitly simulate PiP with an iframe and screen permission with
// a canvas MediaStream. They do not establish native window stacking or capture.
async function installFixture(page: Page, deny = false, blank = false) {
  await page.addInitScript(
    ({ deny, blank }) => {
      Object.defineProperty(window, "documentPictureInPicture", {
        configurable: true,
        value: {
          requestWindow: async (options: any) => {
            (window as any).pipOptions = options;
            const iframe = document.createElement("iframe");
            iframe.id = "test-pip";
            iframe.style.cssText = `width:${options.width}px;height:${options.height}px;border:0`;
            document.body.appendChild(iframe);
            const child = iframe.contentWindow!;
            Object.defineProperty(child, "close", {
              value: () => {
                child.dispatchEvent(new PageTransitionEvent("pagehide"));
                iframe.remove();
              },
            });
            (window as any).testPip = child;
            return child;
          },
        },
      });
      navigator.mediaDevices.getDisplayMedia = async (options) => {
        (window as any).captureOptions = options;
        if (deny)
          throw new DOMException("Permission denied", "NotAllowedError");
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 1280, 720);
        ctx.fillStyle = "black";
        ctx.font = "30px sans-serif";
        if (!blank) ctx.fillText("Authorized fixture", 30, 80);
        const stream = canvas.captureStream(1);
        (window as any).testStream = stream;
        return stream;
      };
    },
    { deny, blank },
  );
}
async function open(page: Page, deny = false) {
  await installFixture(page, deny);
  await page.goto("/overlay?window=pip");
  await expect(page.locator(".overlay-launcher > .card")).toHaveText(
    "Start ExamAsk PermissionDisconnect",
  );
  await expect(page.locator(".overlay-launcher > .card button")).toHaveCount(3);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Start Exam", exact: true }).click();
  await expect(page.locator("#test-pip")).toBeVisible();
  await page.getByRole("button", { name: "Ask Permission" }).click();
  return page.frameLocator("#test-pip");
}
async function stopped(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).testStream.getVideoTracks()[0].readyState,
      ),
    )
    .toBe("ended");
}
test.beforeEach(async ({ request, page }, testInfo) => {
  await page.setExtraHTTPHeaders({
    "X-Forwarded-For": `10.254.0.${(testInfo.line % 250) + 1}`,
  });
  await request.post("/test/reset", {
    headers: { origin: "http://localhost:3000" },
    data: {},
  });
});
test.afterEach(async ({ request }) => {
  await request.post("/test/reset", {
    headers: { origin: "http://localhost:3000" },
    data: {},
  });
});
test("unsupported PiP gives a clear error without a popup or capture", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "documentPictureInPicture", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.goto("/overlay?window=pip");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Start Exam", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("unavailable");
  await expect(
    page.getByRole("button", { name: "Ask Permission" }),
  ).toBeDisabled();
});
test("permission denial leaves no processing or answer", async ({ page }) => {
  const pip = await open(page, true);
  await expect(page.getByRole("alert")).toContainText("Permission denied");
  await expect(pip.getByRole("status")).toHaveText("Capture stopped");
  await expect(pip.getByRole("button", { name: "Refresh" })).toBeDisabled();
  await expect(pip.locator(".floating-option")).toHaveCount(0);
});
test("isolated overlay: no idle frames, single Refresh, letters/numbers, failure and Disconnect", async ({
  page,
}) => {
  let count = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/frame")) count++;
  });
  const pip = await open(page);
  await expect(pip.getByRole("button", { name: "Refresh" })).toBeEnabled();
  await page.waitForTimeout(1800);
  expect(count).toBe(0);
  expect(await page.evaluate(() => (window as any).captureOptions.audio)).toBe(
    false,
  );
  expect(await page.evaluate(() => (window as any).pipOptions)).toEqual({
    width: 260,
    height: 320,
  });
  for (const label of ["Refresh", "Disconnect"]) {
    const box = await pip.getByRole("button", { name: label }).boundingBox();
    expect(box?.width).toBe(64);
    expect(box?.height).toBe(64);
  }
  await pip.getByRole("button", { name: "Refresh" }).click();
  await expect(pip.getByRole("status")).toHaveText("Processing");
  await expect(pip.getByRole("button", { name: "Refresh" })).toBeDisabled();
  await expect(pip.locator(".floating-option")).toHaveText("B");
  await expect(pip.locator(".floating-text")).toHaveText("James Gosling");
  expect(count).toBe(1);
  await page
    .locator("#test-pip")
    .screenshot({ path: "test-results/overlay-answered.png" });
  await expect(
    pip.locator("video,img,input,.question,.option,.history"),
  ).toHaveCount(0);
  await expect(
    pip.getByText("Who invented the Java programming language?"),
  ).toHaveCount(0);
  await expect(pip.getByText("Controlled browser-test fixture")).toHaveCount(0);
  await page.waitForTimeout(1800);
  expect(count).toBe(1);
  await pip.getByRole("button", { name: "Refresh" }).click();
  await expect(pip.locator(".floating-option")).toHaveCount(0);
  await expect(pip.locator(".floating-option")).toHaveText("A");
  await expect(pip.locator(".floating-text")).toHaveText(
    "HyperText Markup Language",
  );
  await pip.getByRole("button", { name: "Refresh" }).click();
  await expect(pip.locator(".floating-option")).toHaveText("2");
  await expect(pip.locator(".floating-text")).toHaveText("James Gosling");
  await pip.getByRole("button", { name: "Refresh" }).click();
  await expect(pip.getByRole("status")).toHaveText("Unable to read");
  await expect(pip.locator(".floating-option")).toHaveCount(0);
  expect(count).toBe(4);
  await pip.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.locator("#test-pip")).toHaveCount(0);
  await stopped(page);
  await expect(
    page.locator(".overlay-launcher").getByRole("status"),
  ).toHaveText("Disconnected");
});
test("closing overlay stops capture and leaves mobile workflow separate", async ({
  page,
}) => {
  const pip = await open(page);
  await expect(pip.getByRole("button", { name: "Refresh" })).toBeEnabled();
  await page.evaluate(() => (window as any).testPip.close());
  await stopped(page);
  await expect(page.getByRole("status")).toHaveText(
    "Overlay closed. Capture stopped.",
  );
});
test("permission revocation clears answer and handles expired session locally", async ({
  page,
}) => {
  const pip = await open(page);
  await expect(pip.getByRole("button", { name: "Refresh" })).toBeEnabled();
  await pip.getByRole("button", { name: "Refresh" }).click();
  await expect(pip.locator(".floating-option")).toHaveText("B");
  await page.evaluate(() => {
    const track = (window as any).testStream.getVideoTracks()[0];
    track.stop();
    track.dispatchEvent(new Event("ended"));
  });
  await expect(pip.getByRole("status")).toHaveText("Capture stopped");
  await expect(pip.locator(".floating-option")).toHaveCount(0);
  await expect(pip.getByRole("button", { name: "Refresh" })).toBeDisabled();
});
test("session deadline closes overlay and releases tracks without background analysis", async ({
  page,
}) => {
  const pip = await open(page);
  await expect(pip.getByRole("button", { name: "Refresh" })).toBeEnabled();
  await page.clock.install();
  await page.clock.fastForward(3600001);
  await expect(page.locator("#test-pip")).toHaveCount(0);
  await stopped(page);
  await expect(page.getByRole("status")).toHaveText("Session expired");
});
test("unreadable and uncertain results never invent an answer", async ({
  page,
  request,
}) => {
  await request.post("/test/reset", {
    headers: { origin: "http://localhost:3000" },
    data: { scenario: "unreadable" },
  });
  const pip = await open(page);
  await expect(pip.getByRole("button", { name: "Refresh" })).toBeEnabled();
  await pip.getByRole("button", { name: "Refresh" }).click();
  await expect(pip.getByRole("status")).toHaveText("Unable to read");
  await request.post("/test/reset", {
    headers: { origin: "http://localhost:3000" },
    data: { scenario: "uncertain" },
  });
  await pip.getByRole("button", { name: "Refresh" }).click();
  await expect(pip.getByRole("status")).toHaveText("Uncertain");
  await expect(pip.locator(".floating-option,.floating-text")).toHaveCount(0);
});

test("compact launcher authorizes and controls capture in one window", async ({
  page,
  request,
}) => {
  await installFixture(page);
  await page.goto("/overlay");
  await page.getByRole("button", { name: "Start Exam" }).click();
  await expect(page.locator("#test-pip")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ask Permission" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Ask Permission" }).click();
  await expect(page.getByText("Screen sharing is active")).toBeVisible();
  await expect(page.locator("#test-pip")).toHaveCount(0);
  await request.post("/test/reset", {
    headers: { origin: "http://localhost:3000" },
    data: { scenario: "unreadable" },
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Keep the question and choices visible",
  );
  const saveFrame = page.getByRole("link", { name: "Save captured frame" });
  await expect(saveFrame).toHaveAttribute("href", /^data:image\/jpeg;base64,/);
  const download = page.waitForEvent("download");
  await saveFrame.click();
  expect((await download).suggestedFilename()).toBe(
    "answer-overlay-capture.jpg",
  );
  await request.post("/test/reset", {
    headers: { origin: "http://localhost:3000" },
    data: {},
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.locator(".floating-option")).toHaveText("B");
  await expect(saveFrame).toHaveCount(0);
  await page.getByRole("button", { name: "Disconnect" }).click();
  await stopped(page);
  await expect(page.getByRole("status")).toHaveText("Disconnected");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("blank screen captures are reported without uploading a frame", async ({
  page,
}) => {
  let uploads = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/frame")) uploads++;
  });
  await installFixture(page, false, true);
  await page.goto("/overlay");
  await page.getByRole("button", { name: "Start Exam" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Ask Permission" }).click();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "The shared frame is blank",
  );
  expect(uploads).toBe(0);
});
