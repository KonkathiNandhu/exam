const { execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");

const browsers = [
  { name: "Safari", id: "com.apple.Safari", safari: true },
  { name: "Chrome", application: "Google Chrome", id: "com.google.Chrome" },
  { name: "Edge", application: "Microsoft Edge", id: "com.microsoft.edgemac" },
];

const list = `function run(argv) {
  const browser = Application(argv[0]);
  if (!browser.running()) return "[]";
  return JSON.stringify(browser.windows().flatMap(window =>
    window.tabs().map((tab, index) => ({
      windowId: String(window.id()), tabIndex: String(index + 1),
      tabId: argv[1] === "chrome" ? String(tab.id()) : "",
      title: argv[1] === "safari" ? tab.name() : tab.title(), url: tab.url()
    }))));
}`;

function readerScript(browser) {
  const target = browser.safari
    ? "tab (item 2 of argv as integer) of window id (item 1 of argv as integer)"
    : "first tab of window id (item 1 of argv) whose id is (item 2 of argv)";
  const command = browser.safari
    ? "do JavaScript (item 3 of argv) in targetTab"
    : "execute targetTab javascript (item 3 of argv)";
  return `on run argv
    tell application id "${browser.id}"
      set targetTab to ${target}
      return (${command}) as text
    end tell
  end run`;
}

function runScript(args, browser) {
  return new Promise((resolve, reject) => {
    execFile(
      "/usr/bin/osascript",
      args,
      { timeout: 10000, maxBuffer: 180000 },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout.trim());
        const detail = stderr.trim();
        reject(
          Error(
            /-1743\b/.test(detail)
              ? `macOS denied this copy of Answer Overlay access to ${browser.name}. Check its entry in Privacy & Security → Automation.`
              : /JavaScript from Apple Events/i.test(detail)
                ? `${browser.name} blocked JavaScript from Apple Events. Check that setting in the browser’s developer menu.`
              : detail ||
                  `${browser.name} did not respond. Keep the selected tab open.`,
          ),
        );
      },
    );
  });
}

async function listTabs(browser) {
  const raw = await runScript(
      [
        "-l",
        "JavaScript",
        "-e",
        list,
        browser.application || browser.name,
        browser.safari ? "safari" : "chrome",
      ],
      browser,
    );
  if (!raw) throw Error(`${browser.name} returned no tab data. Keep the browser open and try again.`);
  let result;
  try { result = JSON.parse(raw); }
  catch { throw Error(`${browser.name} returned invalid tab data. Reopen the browser and try again.`); }
  return result.flatMap((tab) => {
    try {
      const url = new URL(tab.url);
      return ["http:", "https:"].includes(url.protocol)
        ? [{ ...tab, origin: url.origin }]
        : [];
    } catch {
      return [];
    }
  });
}

function createSource(browser, tab) {
  return { browser, ...tab, key: "answer-overlay-" + randomUUID() };
}

async function runInTab(source, action) {
  const { browser, origin, key } = source;
  const code = `(() => {
    const key = ${JSON.stringify(key)};
    if (location.origin !== ${JSON.stringify(origin)}) return JSON.stringify({error: "This tab changed sites. Select it again."});
    if (${JSON.stringify(action)} === "clear") { sessionStorage.removeItem(key); return "{}"; }
    try {
      if (${JSON.stringify(action)} === "select") {
        sessionStorage.setItem(key, "selected");
        return JSON.stringify({selected: true});
      }
      if (sessionStorage.getItem(key) !== "selected") return JSON.stringify({error: "The selected tab moved or closed. Select it again."});
      return ${extract};
    } catch {
      return JSON.stringify({error: "The question layout could not be read in this tab."});
    }
  })()`;
  const raw = await runScript(
      [
        "-e",
        readerScript(browser),
        source.windowId,
        browser.safari ? source.tabIndex : source.tabId,
        code,
      ],
      browser,
    );
  if (!raw || raw === "missing value" || raw === "undefined")
    throw Error(`${browser.name} ran the tab request but returned no result. Reload the selected tab and try again.`);
  try { return JSON.parse(raw); }
  catch { throw Error(`${browser.name} returned invalid page data. Re-select the tab and try again.`); }
}

async function readTab(source) {
  const result = await runInTab(source, "read");
  if (result.error) throw Error(result.error);
  if (
    typeof result.text !== "string" ||
    result.text.length < 5 ||
    result.text.length > 24000 ||
    !Array.isArray(result.choices) ||
    result.choices.length < 2 ||
    result.choices.length > 8 ||
    result.choices.some(
      (choice) =>
        typeof choice !== "string" || !choice.trim() || choice.length > 3000,
    )
  )
    throw Error(
      "This tab needs one visible question with 2–8 labeled radio-button choices.",
    );
  return { text: result.text, choices: result.choices };
}

// Keep this code local and fixed. The hosted overlay cannot supply JavaScript.
const extract = String.raw`(() => {
  const local = location.pathname === "/practice" && document.querySelector(".practice");
  const fail = error => JSON.stringify({error});
  if (local) {
    const card = document.querySelector(".practice .card");
    const text = card?.querySelector("h2")?.innerText.trim();
    const choices = [...(card?.querySelectorAll(".option") || [])]
      .map(option => option.innerText.replace(/^[A-H1-8]\)\s*/, "").trim());
    return JSON.stringify({text, choices});
  }
  const visible = node => node && node.getClientRects().length && getComputedStyle(node).visibility === "visible";
  const w3schools = /^(www\.)?w3schools\.com$/i.test(location.hostname);
  if (w3schools && /\/quiz\.asp$/i.test(location.pathname))
    return fail("The selected tab is the quiz introduction. Select the tab showing Question 1 and its choices.");
  const quizPage = w3schools && location.pathname === "/quiztest/quiztest.asp";
  const quizForm = quizPage && [...document.forms].find(form =>
    [...form.querySelectorAll("button, input[type=submit]")].some(button =>
      visible(button) && /^Next\b/i.test((button.innerText || button.value || "").trim())
    ) && form.querySelectorAll('input[type="radio"]').length >= 2
  );
  const root = quizForm || document;
  const labelsOf = input => [...new Set([...(input.labels || []), input.closest("label")])].filter(visible);
  const textOf = input => {
    const labels = labelsOf(input);
    if (labels.length) return labels.map(label => label.innerText.trim()).join(" ").trim();
    if (!visible(input)) return "";
    const references = (input.getAttribute("aria-labelledby") || "").split(/\s+/);
    const named = references.map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" ");
    if (named) return named;
    const ariaLabel = input.getAttribute("aria-label")?.trim();
    if (ariaLabel) return ariaLabel;
    if (input.matches('[role="radio"]')) return input.innerText.trim();
    const sibling = input.previousElementSibling || input.nextElementSibling;
    if (visible(sibling) && sibling.innerText?.trim()) return sibling.innerText.trim();
    return input.parentElement?.innerText.trim() || "";
  };
  const controls = [...root.querySelectorAll('input[type="radio"], [role="radio"]')]
    .filter(input => input.matches('input[type="radio"]')
      ? !input.parentElement?.closest('[role="radio"]')
      : !input.querySelector('[role="radio"]'));
  const groups = new Map();
  for (const input of controls) {
    if (!visible(input) && !labelsOf(input).length) continue;
    const scope = input.closest('[role="radiogroup"]') || input.form || input.closest("fieldset") || document;
    const name = input.name || "";
    if (!groups.has(scope)) groups.set(scope, new Map());
    const names = groups.get(scope);
    if (!names.has(name)) names.set(name, []);
    names.get(name).push(textOf(input));
  }
  const candidates = [...groups.values()].flatMap(names => [...names.values()])
    .filter(group => group.length >= 2);
  if (candidates.length !== 1 || candidates[0].some(choice => !choice))
    return fail("Show one question with readable answer choices, then press Refresh.");
  const [choices] = candidates;
  // Some quiz sites render the question as a plain text node immediately
  // before the radio group. Use the visible page text as the source context
  // so the text model can locate that question even without semantic markup.
  const text = (document.body.innerText || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 24000);
  return JSON.stringify({text, choices});
})()`;

module.exports = {
  browsers,
  listTabs,
  createSource,
  readTab,
  runInTab,
  extract,
  readerScript,
};
