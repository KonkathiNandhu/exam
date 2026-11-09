import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, apiURL, config, useSession, type Credentials } from "../client";
import "./overlay.css";

type PictureInPictureAPI = {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
};
function pipAPI(): PictureInPictureAPI | undefined {
  return (window as Window & { documentPictureInPicture?: PictureInPictureAPI })
    .documentPictureInPicture;
}
export default function AnswerOverlay() {
  const compact = new URLSearchParams(location.search).get("window") !== "pip";
  const [examStarted, setExamStarted] = useState(false);
  const [pip, setPip] = useState<Window | null>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [consent, setConsent] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    compact
      ? "Authorize screen sharing to begin."
      : "Open Answer Overlay, then authorize capture on this page.",
  );
  const [notice, setNotice] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const owner = useRef<{
    stream: MediaStream | null;
    video: HTMLVideoElement | null;
    credentials: Credentials | null;
    pip: Window | null;
    epoch: number;
    frame: AbortController | null;
  }>({
    stream: null,
    video: null,
    credentials: null,
    pip: null,
    epoch: 0,
    frame: null,
  });
  const refreshLock = useRef(false);
  const retrySharper = useRef(false);
  const capturedFrame = useRef<{ id: string; jpeg: string } | null>(null);
  const { snapshot, connected, connectionError } = useSession(
    credentials,
    "desktop",
    (id) => {
      void captureOne(id);
    },
  );
  const active =
    !!snapshot && !["DISCONNECTED", "EXPIRED"].includes(snapshot.state);
  const answer =
    sharing &&
    connected &&
    active &&
    !busy &&
    requestId &&
    snapshot?.requestId === requestId &&
    snapshot.answer?.status === "answered"
      ? snapshot.answer
      : null;
  const reviewableFrame =
    compact &&
    sharing &&
    connected &&
    !busy &&
    requestId &&
    snapshot?.requestId === requestId &&
    (snapshot.state === "CAPTURING" || !!snapshot.answer) &&
    capturedFrame.current?.id === requestId
      ? capturedFrame.current
      : null;

  function release() {
    const state = owner.current;
    state.epoch++;
    state.frame?.abort();
    state.frame = null;
    state.stream?.getTracks().forEach((t) => t.stop());
    state.stream = null;
    if (state.video) {
      state.video.pause();
      state.video.srcObject = null;
      state.video = null;
    }
    refreshLock.current = false;
    retrySharper.current = false;
    capturedFrame.current = null;
  }
  function endSession(closeWindow: boolean, status = "Disconnected") {
    const state = owner.current;
    const c = state.credentials;
    state.credentials = null;
    release();
    setSharing(false);
    setStarting(false);
    setBusy(false);
    setRequestId(null);
    setMessage(status);
    if (c)
      void api(`sessions/${c.id}/disconnect`, {}, c).catch(() => {
        setNotice(
          "Capture stopped locally. The disconnected backend session will expire under its existing lifecycle rules.",
        );
      });
    setCredentials(null);
    if (closeWindow) {
      const child = state.pip;
      state.pip = null;
      setPip(null);
      setMount(null);
      child?.close();
    }
  }
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const leave = () => {
      const c = owner.current.credentials;
      owner.current.credentials = null;
      release();
      owner.current.pip?.close();
      if (c)
        void fetch(apiURL(`sessions/${c.id}/disconnect`), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + c.token,
          },
          body: "{}",
          keepalive: true,
        }).catch(() => {});
    };
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, []);
  useEffect(() => {
    if (snapshot && ["DISCONNECTED", "EXPIRED"].includes(snapshot.state))
      endSession(
        true,
        snapshot.state === "EXPIRED" ? "Session expired" : "Disconnected",
      );
  }, [snapshot?.state]);
  useEffect(() => {
    if (sharing && snapshot && now >= snapshot.expiresAt)
      endSession(true, "Session expired");
  }, [now, sharing, snapshot?.expiresAt]);
  useEffect(() => {
    if (!sharing || connected) return;
    setRequestId(null);
    setBusy(false);
    const timer = setTimeout(
      () => endSession(true, "Connection lost. Capture stopped."),
      5000,
    );
    return () => clearTimeout(timer);
  }, [sharing, connected]);
  useEffect(() => {
    if (
      !requestId ||
      snapshot?.requestId !== requestId ||
      snapshot.state === "PROCESSING"
    )
      return;
    setBusy(false);
    refreshLock.current = false;
    retrySharper.current = snapshot.state === "CAPTURING" && !snapshot.answer;
    if (!retrySharper.current && !snapshot.answer) capturedFrame.current = null;
    if (snapshot.answer?.status === "answered") setMessage("");
    else if (snapshot.answer?.status === "uncertain") setMessage("Uncertain");
    else {
      setMessage("Unable to read");
      setNotice(snapshot.message);
    }
  }, [snapshot, requestId]);

  async function openOverlay() {
    setNotice("");
    const api = pipAPI();
    if (!window.isSecureContext) {
      setNotice(
        "Answer Overlay requires HTTPS or a trustworthy localhost context.",
      );
      return;
    }
    if (!api) {
      setNotice(
        "Document Picture-in-Picture is unavailable in this browser. Use a supporting desktop Chrome version. No popup fallback is used.",
      );
      return;
    }
    setOpening(true);
    const epoch = owner.current.epoch;
    try {
      // requestWindow is invoked directly from this click, before any awaited work.
      const child = await api.requestWindow({ width: 260, height: 320 });
      if (owner.current.epoch !== epoch) {
        child.close();
        return;
      }
      child.document.title = "AI Answer Overlay";
      child.document.documentElement.lang = "en";
      child.document.body.className = "overlay-document";
      for (const node of Array.from(
        document.querySelectorAll('link[rel="stylesheet"],style'),
      )) {
        const clone = node.cloneNode(true) as HTMLElement;
        if (node instanceof HTMLLinkElement)
          (clone as HTMLLinkElement).href = node.href;
        child.document.head.appendChild(clone);
      }
      const target = child.document.createElement("div");
      child.document.body.appendChild(target);
      owner.current.pip = child;
      setPip(child);
      setMount(target);
      setMessage("Authorize capture on the main page");
      child.addEventListener(
        "pagehide",
        () => {
          if (owner.current.pip === child) {
            owner.current.pip = null;
            setPip(null);
            setMount(null);
            endSession(false, "Overlay closed. Capture stopped.");
          }
        },
        { once: true },
      );
    } catch {
      setNotice(
        "Chrome could not open Document Picture-in-Picture. Check browser support and permissions.",
      );
    } finally {
      setOpening(false);
    }
  }
  async function startCapture() {
    if (!consent || (!compact && !owner.current.pip) || starting || sharing)
      return;
    setStarting(true);
    setNotice("");
    const state = owner.current;
    const epoch = state.epoch;
    let selected: MediaStream | null = null;
    let c: Credentials | null = null;
    try {
      // A separate explicit gesture supplies capture activation; no asynchronous PiP call precedes it.
      selected = await navigator.mediaDevices.getDisplayMedia({
        video: compact
          ? { frameRate: 1, displaySurface: "window" }
          : { frameRate: 1 },
        audio: false,
      });
      if (state.epoch !== epoch || (!compact && !state.pip)) {
        selected.getTracks().forEach((t) => t.stop());
        return;
      }
      state.stream = selected;
      selected.getVideoTracks()[0].onended = () =>
        endSession(false, "Capture stopped");
      const configResponse = await fetch(apiURL("config"), {
        signal: AbortSignal.timeout(8000),
      });
      if (!configResponse.ok) throw Error("Cannot load capture policy");
      const config = await configResponse.json();
      const handle = (
        selected.getVideoTracks()[0] as MediaStreamTrack & {
          getCaptureHandle?: () => { origin?: string };
        }
      ).getCaptureHandle?.();
      if (
        config.allowedAssessmentOrigins.length &&
        !config.allowedAssessmentOrigins.includes(handle?.origin)
      )
        throw Error(
          "This capture source is outside the configured assessment allowlist. Select an approved cooperating tab.",
        );
      c = await api("sessions", { sourceOrigin: handle?.origin });
      if (state.epoch !== epoch || (!compact && !state.pip)) {
        void api(`sessions/${c!.id}/disconnect`, {}, c!).catch(() => {});
        return;
      }
      state.credentials = c;
      setCredentials(c);
      await api(`sessions/${c!.id}/capture`, {}, c!);
      if (state.epoch !== epoch || !state.stream)
        throw Error("Capture stopped");
      const v = document.createElement("video");
      v.muted = true;
      v.srcObject = selected;
      state.video = v;
      await v.play();
      if (
        state.epoch !== epoch ||
        selected.getVideoTracks()[0].readyState !== "live"
      )
        throw Error("Capture stopped");
      if (config.allowedAssessmentOrigins.length)
        (selected.getVideoTracks()[0] as any).oncapturehandlechange = () => {
          const next = (
            selected!.getVideoTracks()[0] as any
          ).getCaptureHandle?.();
          if (!config.allowedAssessmentOrigins.includes(next?.origin))
            endSession(false, "Capture stopped");
        };
      setSharing(true);
      setMessage("Ready");
    } catch (error) {
      selected?.getTracks().forEach((t) => t.stop());
      if (c) void api(`sessions/${c.id}/disconnect`, {}, c).catch(() => {});
      if (state.epoch === epoch) {
        state.credentials = null;
        release();
        setCredentials(null);
        setSharing(false);
        setMessage("Capture stopped");
        setNotice(
          error instanceof Error
            ? error.message
            : "Capture was denied or blocked",
        );
      }
    } finally {
      setStarting(false);
    }
  }
  async function captureOne(id: string) {
    const state = owner.current;
    const c = state.credentials;
    const v = state.video;
    const epoch = state.epoch;
    if (!c) return;
    try {
      const track = state.stream?.getVideoTracks()[0];
      if (!track || track.readyState !== "live" || !v?.videoWidth)
        throw Error(
          "No screen frame is available. Disconnect and share the question window again.",
        );
      if (track.muted)
        throw Error(
          "The shared source is paused or unavailable. Restore the shared window or disconnect and select it again.",
        );
      const canvas = document.createElement("canvas");
      let frame: string;
      try {
        const drawFrame = (maxEdge: number) => {
          const scale = Math.min(
            1,
            maxEdge / Math.max(v.videoWidth, v.videoHeight),
          );
          canvas.width = Math.max(1, Math.round(v.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(v.videoHeight * scale));
          canvas
            .getContext("2d")!
            .drawImage(v, 0, 0, canvas.width, canvas.height);
        };
        drawFrame(retrySharper.current ? 2560 : 1600);

        const sample = document.createElement("canvas");
        sample.width = sample.height = 32;
        const sampleContext = sample.getContext("2d")!;
        sampleContext.drawImage(canvas, 0, 0, 32, 32);
        const { data } = sampleContext.getImageData(0, 0, 32, 32);
        if (
          !data.some(
            (value, i) => i % 4 !== 3 && Math.abs(value - data[i % 4]) > 3,
          )
        ) {
          throw Error(
            "The shared frame is blank. Disconnect and select the quiz window in Ask Permission.",
          );
        }
        // A window-only capture can have an opaque black background around
        // the overlay. A few bright pixels do not make it a usable frame.
        if (compact) {
          let blackPixels = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (Math.max(data[i], data[i + 1], data[i + 2]) <= 8) blackPixels++;
          }
          if (blackPixels >= (data.length / 4) * 0.93)
            throw Error(
              "The shared frame is almost entirely black. Disconnect, then select the quiz window itself in Ask Permission.",
            );
        }

        frame = canvas.toDataURL("image/jpeg", 0.82);
        if (frame.length > 1_750_000) {
          drawFrame(1600);
          frame = canvas.toDataURL("image/jpeg", 0.65);
        }
        if (frame.length > 1_750_000)
          throw Error(
            "The frame is too large. Share just the quiz window and try again.",
          );
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
      const controller = new AbortController();
      if (compact) capturedFrame.current = { id, jpeg: frame };
      state.frame = controller;
      const response = await fetch(apiURL(`sessions/${c.id}/frame`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + c.token,
        },
        body: JSON.stringify({ frame, requestId: id }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(60000),
        ]),
      });
      frame = "";
      if (!response.ok)
        throw Error(
          `The server rejected the screen frame (HTTP ${response.status}). Try Refresh again.`,
        );
    } catch (error) {
      if (state.epoch === epoch) {
        if (capturedFrame.current?.id === id) capturedFrame.current = null;
        await api(`sessions/${c.id}/frame-error`, { requestId: id }, c).catch(
          () => {},
        );
        if (state.epoch !== epoch) return;
        setBusy(false);
        refreshLock.current = false;
        setRequestId(null);
        setMessage("Unable to read");
        setNotice(
          error instanceof TypeError
            ? "The screen frame could not reach the server. Check your connection and try Refresh."
            : error instanceof Error
              ? error.message
              : "Frame analysis failed. Try Refresh.",
        );
      }
    }
  }
  async function refresh() {
    if (
      refreshLock.current ||
      !sharing ||
      !connected ||
      !active ||
      !stateValid()
    )
      return;
    const epoch = owner.current.epoch;
    refreshLock.current = true;
    capturedFrame.current = null;
    setBusy(true);
    setRequestId(null);
    setMessage("Processing");
    setNotice("");
    try {
      const result = await api(
        `sessions/${credentials!.id}/refresh`,
        {},
        credentials!,
      );
      if (owner.current.epoch === epoch) setRequestId(result.requestId);
    } catch (error) {
      if (owner.current.epoch === epoch) {
        setBusy(false);
        refreshLock.current = false;
        setMessage("Unable to read");
        setNotice((error as Error).message);
      }
    }
  }
  function stateValid() {
    if (!snapshot || Date.now() >= snapshot.expiresAt) {
      endSession(true, "Session expired");
      return false;
    }
    return true;
  }
  const canRefresh =
    sharing && connected && active && !busy && snapshot?.state !== "PROCESSING";
  useEffect(() => {
    const overlayWindow = compact ? window : pip;
    if (!overlayWindow || !sharing) return;

    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable]"))
        return;
      if (event.key === "Enter") {
        if (target?.closest?.("button, a[href]")) return;
        event.preventDefault();
        if (!event.repeat && canRefresh) void refresh();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (!event.repeat) endSession(true);
      }
    }

    overlayWindow.addEventListener("keydown", onKeyDown);
    return () => overlayWindow.removeEventListener("keydown", onKeyDown);
  });

  const controls = (
    <main className="floating-answer" aria-label="AI answer overlay">
      {compact && !sharing && (
        <div className="compact-permission">
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            I am authorized to share this screen.
          </label>
          <button disabled={!consent || starting} onClick={startCapture}>
            Ask Permission
          </button>
          <small>
            Select the browser window with the quiz in the sharing picker.
          </small>
        </div>
      )}
      {compact && sharing && (
        <p className="compact-sharing">
          Screen sharing is active
          {owner.current.stream?.getVideoTracks()[0]?.label && (
            <>
              <br />
              {owner.current.stream.getVideoTracks()[0].label}
            </>
          )}
        </p>
      )}
      <section className="floating-result" aria-live="polite" aria-busy={busy}>
        {answer ? (
          <>
            <div className="floating-option">{answer.selectedOption}</div>
            <div className="floating-text">{answer.answer}</div>
          </>
        ) : (
          <p role="status">{busy ? "Processing" : message}</p>
        )}
      </section>
      <div className="floating-controls">
        <button
          className="floating-refresh"
          aria-label="Refresh"
          aria-keyshortcuts="Enter"
          title="Refresh (Enter)"
          disabled={!canRefresh}
          onClick={refresh}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 7v5h-5M20 12a8 8 0 1 0-2 6" />
          </svg>
        </button>
        <button
          className="floating-disconnect"
          aria-label="Disconnect"
          aria-keyshortcuts="Delete Backspace"
          title="Disconnect (Delete)"
          onClick={() => endSession(true)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 3v9M7 5a8 8 0 1 0 10 0" />
          </svg>
        </button>
      </div>
      {compact && (notice || connectionError || reviewableFrame) && (
        <div className="compact-diagnostics">
          {(notice || connectionError) && (
            <p role="alert" className="notice">
              {notice || connectionError}
            </p>
          )}
          {reviewableFrame && (
            <a
              href={reviewableFrame.jpeg}
              download="answer-overlay-capture.jpg"
            >
              Save captured frame
            </a>
          )}
        </div>
      )}
    </main>
  );
  if (compact) {
    if (examStarted) return controls;
    return (
      <main className="floating-answer" aria-label="AI answer overlay">
        <div className="floating-result">
          <button onClick={() => setExamStarted(true)}>Start Exam</button>
        </div>
      </main>
    );
  }
  const floating = mount && pip ? createPortal(controls, mount) : null;
  return (
    <>
      <main className="desktop overlay-launcher">
        <header>
          <p className="eyebrow">OPTIONAL CHROME PROTOTYPE</p>
          <h1>Answer Overlay</h1>
          <p>
            A separate floating assistant for explicitly authorized practice.
            Your existing mobile assistant is unchanged.
          </p>
          {config()?.appOrigin.startsWith("https://") &&
            !config()?.configurationError && (
              <p>
                <a href={apiURL("overlay-launcher")}>
                  Download single-file launcher
                </a>
              </p>
            )}
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I am authorized to capture this content and use AI assistance.
          </label>
        </header>
        <section className="card">
          <div className="actions">
            <button
              disabled={!consent || !!pip || opening}
              onClick={openOverlay}
            >
              Start Exam
            </button>
            <button
              disabled={!consent || !pip || sharing || starting}
              onClick={startCapture}
            >
              Ask Permission
            </button>
            <button
              disabled={!pip && !credentials}
              onClick={() => endSession(true)}
            >
              Disconnect
            </button>
          </div>
        </section>
        <p role="status" className={sharing ? "capture-banner" : ""}>
          {sharing
            ? "Screen sharing is active. AI runs only when you press Refresh."
            : message || "Disconnected"}
        </p>
        {(notice || connectionError) && (
          <p role="alert" className="notice">
            {notice || connectionError}
          </p>
        )}
      </main>
      {floating}
    </>
  );
}
