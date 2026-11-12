import { useEffect, useRef, useState } from "react";
import { api, saved, useSession, type Credentials } from "../client";
export default function Mobile() {
  const [c, set] = useState<Credentials | null>(() =>
    location.hash ? null : saved("mobile"),
  );
  const [error, err] = useState("");
  const [busy, loading] = useState(false);
  const { snapshot: s, connected, connectionError } = useSession(c, "mobile");
  const [pending, setPending] = useState<{
    id: string;
    requestId: string;
    claimToken: string;
    code: string;
    expiresAt: number;
  } | null>(null);
  const [invitation] = useState(() => {
    if (!location.hash) return null;
    const [id, token] = location.hash.slice(1).split(".");
    history.replaceState(null, "", location.pathname);
    return { id, token };
  });
  async function requestPair() {
    if (!invitation) return;
    err("");
    try {
      set(null);
      sessionStorage.removeItem("mobile");
      setPending(await api("pair", invitation));
    } catch (e) {
      err((e as Error).message);
    }
  }
  useEffect(() => {
    if (!pending) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const b = await api("pair/status", pending);
        if (disposed) return;
        if (b.approved) {
          const c = { id: b.id, token: b.token };
          sessionStorage.setItem("mobile", JSON.stringify(c));
          set(c);
          setPending(null);
        } else timer = setTimeout(poll, 1500);
      } catch (e) {
        if (!disposed) {
          err((e as Error).message);
          setPending(null);
        }
      }
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [pending]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const refreshLock = useRef(false);
  const active = !!s && !["DISCONNECTED", "EXPIRED"].includes(s.state);
  const canRefresh =
    active && connected && s.captureActive && !busy && s.state !== "PROCESSING";
  const a =
    connected &&
    active &&
    !busy &&
    requestId &&
    s?.requestId === requestId &&
    s.state !== "PROCESSING" &&
    s.answer?.status === "answered"
      ? s.answer
      : null;
  useEffect(() => {
    if (requestId && s?.requestId === requestId && s.state !== "PROCESSING") {
      loading(false);
      refreshLock.current = false;
    }
  }, [s, requestId]);
  useEffect(() => {
    if (!connected || !active) {
      setRequestId(null);
      loading(false);
      refreshLock.current = false;
    }
  }, [connected, active]);
  async function refresh() {
    if (!c || !canRefresh || refreshLock.current) return;
    refreshLock.current = true;
    loading(true);
    setRequestId(null);
    err("");
    try {
      const result = await api(`sessions/${c.id}/refresh`, {}, c);
      setRequestId(result.requestId);
    } catch (e) {
      err((e as Error).message);
      loading(false);
      refreshLock.current = false;
    }
  }
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Enter" || event.defaultPrevented || event.isComposing ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        (event.target instanceof Element &&
          event.target.closest("button, a[href], input, textarea, select, [contenteditable]"))
      ) return;
      if (!canRefresh) return;
      event.preventDefault();
      if (!event.repeat) void refresh();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  async function disconnect() {
    if (!c || !confirm("Disconnect and stop screen sharing on both devices?"))
      return;
    setRequestId(null);
    loading(false);
    try {
      await api(`sessions/${c.id}/disconnect`, {}, c);
    } catch (e) {
      err((e as Error).message);
    }
  }
  return (
    <main className="mobile">
      <header>
        <h1>AI Answer Assistant</h1>
        <p>
          <span className={"dot " + (connected && active ? "green" : "")} />
          Status:{" "}
          {connected && active
            ? "Connected"
            : s?.state === "EXPIRED"
              ? "Expired"
              : "Disconnected"}
        </p>
      </header>
      {!c && invitation && (
        <section className="card">
          <p>
            {pending
              ? `Compare code ${pending.code} with your desktop, then approve there.`
              : "Confirm that you want to pair this phone with your desktop session."}
          </p>
          {!pending && <button onClick={requestPair}>Confirm pairing</button>}
        </section>
      )}
      <section
        className="answer-only"
        aria-live="polite"
        aria-busy={busy || s?.state === "PROCESSING"}
      >
        {a ? (
          <>
            <div className="answer-badge">{a.selectedOption}</div>
            <h2 className="answer-text">{a.answer}</h2>
          </>
        ) : (
          <p role="status">
            {busy || s?.state === "PROCESSING"
              ? "Processing"
              : error ||
                connectionError ||
                (s?.answer?.status === "uncertain"
                  ? "Unable to determine an answer. Try Refresh."
                  : s?.requestId === requestId
                    ? s?.message
                    : "")}
          </p>
        )}
      </section>
      <div className="answer-controls">
        <button
          className="round-control refresh-control"
          aria-label="Refresh"
          aria-keyshortcuts="Enter"
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
            <path d="M20 7v5h-5" />
            <path d="M19 12a7 7 0 1 0-2 5M20 12a8 8 0 0 0-2-6" />
          </svg>
        </button>
        <button
          className="round-control disconnect-control"
          aria-label="Disconnect"
          disabled={!active || !connected}
          onClick={disconnect}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 3v9" />
            <path d="M7 5a8 8 0 1 0 10 0" />
          </svg>
        </button>
      </div>
    </main>
  );
}
