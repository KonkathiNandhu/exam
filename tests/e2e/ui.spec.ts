import { test, expect } from "@playwright/test";
test("desktop authorization disclosure and rejected capture", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Start Screen Sharing" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.evaluate(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
  await page.getByRole("button", { name: "Start Screen Sharing" }).click();
  await expect(page.getByRole("status")).toContainText("Permission denied");
  await expect(
    page.getByRole("button", { name: "Stop Screen Sharing" }),
  ).toBeDisabled();
});
test("mobile empty state has fixed controls and no chat input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mobile");
  await expect(
    page.getByRole("heading", { name: "AI Answer Assistant" }),
  ).toBeVisible();
  await expect(
    page.locator(".question,.history,.option,.bubble,video,img"),
  ).toHaveCount(0);
  for (const name of ["Refresh", "Disconnect"]) {
    const size = await page.getByRole("button", { name }).boundingBox();
    expect(size?.width).toBe(96);
    expect(size?.height).toBe(96);
  }
  await expect(page.getByRole("button", { name: "Refresh" })).toBeDisabled();
  await expect(page.locator("input,textarea")).toHaveCount(0);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
test("practice contains Java fixture and advances to next question", async ({
  page,
}) => {
  await page.goto("/practice");
  await expect(
    page.getByRole("heading", {
      name: "Who invented the Java programming language?",
    }),
  ).toBeVisible();
  await expect(page.getByText("B) James Gosling")).toBeVisible();
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(
    page.getByRole("heading", { name: "What does HTML stand for?" }),
  ).toBeVisible();
});
test("on-demand capture: pairing, exactly one frame per tap, minimal answer, disconnect", async ({
  browser,
}) => {
  const desktop = await browser.newPage();
  let frames = 0;
  desktop.on("request", (r) => {
    if (r.url().endsWith("/frame")) frames++;
  });
  await desktop.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = "black";
      ctx.font = "30px sans-serif";
      ctx.fillText("Controlled practice fixture", 60, 80);
      (window as any).testStream = canvas.captureStream(1);
      return (window as any).testStream;
    };
  });
  await desktop.goto("/");
  await desktop.getByRole("checkbox").check();
  await desktop.getByRole("button", { name: "Start Screen Sharing" }).click();
  await expect(
    desktop.getByText(
      "Screen sharing permission is active. AI runs only when Refresh is pressed.",
    ),
  ).toBeVisible();
  const response = desktop.waitForResponse(
    (r) => r.url().endsWith("/pair") && r.request().method() === "POST",
  );
  await desktop
    .getByRole("button", { name: "Create local pairing preview" })
    .click();
  const pair = await (await response).json();
  await expect(
    desktop.getByAltText("Secure mobile pairing QR code"),
  ).toHaveCount(0);
  await expect(
    desktop.getByRole("link", { name: "Open mobile preview on this computer" }),
  ).toHaveAttribute("href", pair.url);
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await mobile.addInitScript(() => {
    if (!sessionStorage.getItem("mobile"))
      sessionStorage.setItem(
        "mobile",
        JSON.stringify({ id: "obsolete-session", token: "obsolete-token" }),
      );
  });
  await mobile.goto(pair.url);
  await mobile.getByRole("button", { name: "Confirm pairing" }).click();
  await expect(
    desktop.getByRole("button", { name: "Approve pairing" }),
  ).toBeVisible();
  await expect(mobile.getByText("Status: Disconnected")).toBeVisible();
  await desktop.getByRole("button", { name: "Approve pairing" }).click();

  await expect(mobile.getByText("Status: Connected")).toBeVisible();
  await desktop.waitForTimeout(3500);
  expect(frames).toBe(0);
  await expect(mobile.locator(".answer-badge")).toHaveCount(0);
  await mobile.getByRole("button", { name: "Refresh" }).click();
  await expect(mobile.getByRole("status")).toHaveText("Processing");
  await expect(mobile.locator(".answer-badge")).toHaveText("B");
  await expect(mobile.locator(".answer-text")).toHaveText("James Gosling");
  expect(frames).toBe(1);
  await expect(
    mobile.locator(".question,.option,.history,.bubble,video,img"),
  ).toHaveCount(0);
  await expect(mobile.getByText("Controlled browser-test fixture")).toHaveCount(
    0,
  );
  await mobile.screenshot({
    path: "test-results/mobile-answered.png",
    fullPage: true,
  });
  await desktop.waitForTimeout(3500);
  expect(frames).toBe(1);
  await mobile.reload();
  await expect(mobile.getByText("Status: Connected")).toBeVisible();
  await expect(mobile.locator(".answer-badge")).toHaveCount(0);
  await mobile.getByRole("button", { name: "Refresh" }).click();
  await expect(mobile.locator(".answer-badge")).toHaveCount(0);
  await expect(mobile.getByRole("status")).toHaveText("Processing");
  await expect(mobile.locator(".answer-badge")).toHaveText("A");
  await expect(mobile.locator(".answer-text")).toHaveText(
    "HyperText Markup Language",
  );
  expect(frames).toBe(2);
  await mobile.getByRole("button", { name: "Refresh" }).click();
  await expect(mobile.getByRole("button", { name: "Refresh" })).toBeEnabled();
  expect(frames).toBe(3);
  await expect(mobile.locator(".answer-badge")).toHaveText("2");
  await expect(mobile.locator(".answer-text")).toHaveText("James Gosling");
  await mobile.getByRole("button", { name: "Refresh" }).click();
  await expect(mobile.getByRole("status")).toContainText("failed");
  await expect(mobile.locator(".answer-badge,.answer-text")).toHaveCount(0);
  expect(frames).toBe(4);
  mobile.once("dialog", (d) => d.accept());
  await mobile.getByRole("button", { name: "Disconnect" }).click();
  await expect(mobile.getByText("Status: Disconnected")).toBeVisible();
  await expect(mobile.locator(".answer-badge,.answer-text")).toHaveCount(0);
  await expect(
    desktop.getByRole("button", { name: "Stop Screen Sharing" }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      desktop.evaluate(
        () => (window as any).testStream.getVideoTracks()[0].readyState,
      ),
    )
    .toBe("ended");
  await desktop.close();
  await mobile.close();
});
