import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  api,
  apiURL,
  config,
  saved,
  useSession,
  type Credentials,
} from "../client";
export default function Desktop() {
  const [c, set] = useState<Credentials | null>(null);
  useEffect(() => {
    const previous = saved("desktop");
    sessionStorage.removeItem("desktop");
    if (previous)
      void api(`sessions/${previous.id}/disconnect`, {}, previous).catch(
        () => {},
      );
  }, []);
  const [error, err] = useState("");
  const [mobileURL, setMobileURL] = useState("");
  const [apiStatus, setAPIStatus] = useState("Not tested");
  const [qr, setQR] = useState("");
  const [pairExpiry, pairTime] = useState(0);
  const [now, time] = useState(Date.now());
  const [sharing, share] = useState(false);
  const [consent, agree] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const pending = useRef(false);
  const {
    snapshot: s,
    connected,
    connectionError,
  } = useSession(c, "desktop", (requestId) => {
    void captureFrame(requestId);
  });
  const stopTracks = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    share(false);
  };
  useEffect(() => {
    const t = setInterval(() => time(Date.now()), 1000);
    return () => {
      clearInterval(t);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (sharing && s && now >= s.expiresAt) stopTracks();
  }, [now, sharing, s?.expiresAt]);
  useEffect(() => {
    if (!sharing || connected) return;
    const timer = setTimeout(() => {
      stopTracks();
      if (c) void api(`sessions/${c.id}/disconnect`, {}, c).catch(() => {});
    }, 5000);
    return () => clearTimeout(timer);
  }, [sharing, connected, c]);
  useEffect(() => {
    if (s && ["EXPIRED", "DISCONNECTED"].includes(s.state)) {
      stopTracks();
      setQR("");
    }
  }, [s?.state]);
  async function captureFrame(requestId: string) {
    if (!c || pending.current) return;
    pending.current = true;
    try {
      const v = video.current;
      if (
        !sharing ||
        !stream.current
          ?.getVideoTracks()
          .some((t) => t.readyState === "live") ||
        !v?.videoWidth
      )
        throw Error("Authorized capture is unavailable");
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1600 / v.videoWidth);
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
      const frame = canvas.toDataURL("image/jpeg", 0.82);
      canvas.width = 0;
      canvas.height = 0;
      await api(`sessions/${c.id}/frame`, { frame, requestId }, c);
    } catch (e) {
      err((e as Error).message);
      await api(`sessions/${c.id}/frame-error`, { requestId }, c).catch(
        () => {},
      );
    } finally {
      pending.current = false;
    }
  }
  async function start() {
    err("");
    let selected: MediaStream | null = null;
    try {
      selected = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1 },
        audio: false,
      });
      stream.current = selected;
      const config = await fetch(apiURL("config")).then((r) => r.json());
      const handle = (selected.getVideoTracks()[0] as any).getCaptureHandle?.();
      if (
        config.allowedAssessmentOrigins.length &&
        !config.allowedAssessmentOrigins.includes(handle?.origin)
      )
        throw Error(
          "Choose a permitted training tab that exposes its capture origin. This source is not on the configured allowlist.",
        );
      const cred = await api("sessions", { sourceOrigin: handle?.origin });
      sessionStorage.setItem("desktop", JSON.stringify(cred));
      set(cred);
      await api(`sessions/${cred.id}/capture`, {}, cred);
      const v = document.createElement("video");
      v.srcObject = selected;
      v.muted = true;
      await v.play();
      if (selected.getVideoTracks()[0].readyState !== "live")
        throw Error("Screen sharing ended before setup completed");
      video.current = v;
      if (config.allowedAssessmentOrigins.length) {
        (selected.getVideoTracks()[0] as any).oncapturehandlechange = () => {
          const current = (
            selected!.getVideoTracks()[0] as any
          ).getCaptureHandle?.();
          if (!config.allowedAssessmentOrigins.includes(current?.origin)) {
            err(
              "Capture source changed to a source outside the configured allowlist.",
            );
            stopTracks();
            void api(`sessions/${cred.id}/disconnect`, {}, cred).catch(
              () => {},
            );
          }
        };
      }
      selected.getVideoTracks()[0].onended = () => {
        stopTracks();
        void api(`sessions/${cred.id}/disconnect`, {}, cred).catch(() => {});
      };
      share(true);
    } catch (e) {
      selected?.getTracks().forEach((t) => t.stop());
      err((e as Error).message);
    }
  }
  async function stop() {
    stopTracks();
    if (c)
      try {
        await api(`sessions/${c.id}/disconnect`, {}, c);
      } catch (e) {
        err((e as Error).message);
      }
  }
  async function pair() {
    if (!c) return;
    try {
      const b = await api(`sessions/${c.id}/pair`, {}, c);
      setMobileURL(b.url);
      setQR(
        b.localPreview
          ? ""
          : await QRCode.toDataURL(b.url, { width: 240, margin: 2 }),
      );
      pairTime(b.expiresAt);
    } catch (e) {
      err((e as Error).message);
    }
  }
  async function approve(approve: boolean) {
    if (!c || !s?.pendingPair) return;
    try {
      await api(
        `sessions/${c.id}/pair/approve`,
        { requestId: s.pendingPair.id, approve },
        c,
      );
    } catch (e) {
      err((e as Error).message);
    }
  }
  async function testConnection() {
    try {
      const r = await fetch(apiURL("health"), {
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw Error();
      setAPIStatus(
        "Reachable from this desktop. Phone reachability is not yet confirmed.",
      );
    } catch {
      setAPIStatus(
        "Failed: check address, certificate trust, firewall or client isolation. A different network needs a public endpoint.",
      );
    }
  }
  return (
    <main className="desktop">
      <header>
        <div className="brand-mark">✦</div>
        <p className="eyebrow">AUTHORIZED PRACTICE WORKSPACE</p>
        <h1>
          Screen to mobile.
          <br />
          <span className="muted">A clearer way to learn.</span>
        </h1>
        <p>
          Share a permitted screen in Microsoft Edge. Receive AI suggested
          answers on your paired phone.
        </p>
      </header>
      <p>
        <a href="/overlay" target="_blank" rel="noreferrer">
          Answer Overlay — optional Chrome prototype ↗
        </a>
      </p>
      <div className="desktop-grid">
        <section className="card">
          <div className="eyebrow">01 / SCREEN SHARING</div>
          <h2>Your screen, your permission</h2>
          <p>
            Edge will ask you to choose a screen, window, or tab. Screenshots
            are processed temporarily by your configured AI provider. Only
            question text and suggestions go to your phone.
          </p>
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => agree(e.target.checked)}
            />{" "}
            I am authorized to share this content and use AI assistance.
          </label>
          <div className="actions">
            <button
              className="primary"
              onClick={start}
              disabled={
                !consent ||
                sharing ||
                !!(
                  s &&
                  !["DISCONNECTED", "EXPIRED"].includes(s.state) &&
                  s.captureActive
                )
              }
            >
              Start Screen Sharing
            </button>
            <button onClick={stop} disabled={!sharing}>
              Stop Screen Sharing
            </button>
          </div>
          {sharing && (
            <div role="status" className="capture-banner">
              ● Screen sharing permission is active. AI runs only when Refresh
              is pressed.
            </div>
          )}
          <dl>
            <dt>Connection Status</dt>
            <dd>{connected ? "Connected" : "Disconnected"}</dd>
            <dt>Screen Capture Status</dt>
            <dd>{sharing ? "Sharing" : "Stopped"}</dd>
            <dt>Mobile</dt>
            <dd>{s?.mobileConnected ? "Connected" : "Not connected"}</dd>
            <dt>Session Duration</dt>
            <dd>
              {s
                ? Math.max(
                    0,
                    Math.floor((3600000 - (s.expiresAt - now)) / 60000),
                  )
                : 0}{" "}
              / 60 minutes
            </dd>
            <dt>Session State</dt>
            <dd>{s?.state || "IDLE"}</dd>
          </dl>
        </section>
        <section className="card pairing">
          <div className="eyebrow">02 / PAIR YOUR PHONE</div>
          <h2>Your answers, on hand</h2>
          <p>
            Scan a temporary, single-use QR code with your phone. Both devices
            must reach this server over trusted HTTPS.
          </p>
          {qr && now < pairExpiry && !s?.mobileConnected ? (
            <>
              <img src={qr} alt="Secure mobile pairing QR code" />
              <p className="muted">
                Expires in {Math.max(0, Math.ceil((pairExpiry - now) / 1000))}{" "}
                seconds
              </p>
            </>
          ) : (
            <div className="qr-placeholder">
              {s?.mobileConnected ? "✓ Phone connected" : "Pairing code"}
            </div>
          )}
          {config()?.localPreview && (
            <p>
              Desktop-only localhost preview. This URL cannot connect a physical
              phone.
            </p>
          )}
          {config()?.localPreview &&
            mobileURL &&
            now < pairExpiry &&
            !s?.mobileConnected && (
              <p>
                <a href={mobileURL} target="_blank" rel="noreferrer">
                  Open mobile preview on this computer
                </a>
              </p>
            )}
          <button
            disabled={!sharing || !connected || s?.mobileConnected}
            onClick={pair}
          >
            {config()?.localPreview
              ? "Create local pairing preview"
              : "Generate Mobile Pairing QR Code"}
          </button>
        </section>
      </div>
      {(error || s?.message) && (
        <p role="status" className="notice">
          {error || s?.message}
        </p>
      )}
      {s?.pendingPair && (
        <section className="card">
          <h2>Approve mobile pairing</h2>
          <p>
            Confirm code {s.pendingPair.code} matches the phone. Request expires
            at {new Date(s.pendingPair.expiresAt).toLocaleTimeString()}.
          </p>
          <button onClick={() => approve(true)}>Approve pairing</button>{" "}
          <button onClick={() => approve(false)}>Reject pairing</button>
        </section>
      )}
      <details className="card">
        <summary>Connection diagnostics</summary>
        <dl>
          <dt>Pairing Mode</dt>
          <dd>{config()?.pairingMode || "Unavailable"}</dd>
          <dt>Desktop Local URL</dt>
          <dd>{location.origin}</dd>
          <dt>Selected LAN IP</dt>
          <dd>{config()?.selectedLanIP || "Not selected"}</dd>
          <dt>Generated Mobile URL</dt>
          <dd>
            {mobileURL
              ? new URL(mobileURL).origin + "/mobile#[temporary token]"
              : "Not generated"}
          </dd>
          <dt>API Connection Status</dt>
          <dd>{apiStatus}</dd>
          <dt>WebSocket Connection Status</dt>
          <dd>
            {connected ? "Authenticated" : connectionError || "Not connected"}
          </dd>
          <dt>Session Pairing Status</dt>
          <dd>
            {s?.mobileConnected
              ? "Connected"
              : s?.pendingPair
                ? "Awaiting approval"
                : "Not paired"}
          </dd>
          <dt>HTTPS / Secure Context</dt>
          <dd>
            {location.protocol === "https:" ? "HTTPS" : "HTTP"} /{" "}
            {window.isSecureContext
              ? "Secure context"
              : "Insecure: capture unavailable"}
          </dd>
          <dt>Session Expiration</dt>
          <dd>{s ? new Date(s.expiresAt).toLocaleString() : "No session"}</dd>
        </dl>
        <p>{config()?.configurationError}</p>
        <p>
          LAN candidates:{" "}
          {config()
            ?.candidates.map(
              (c) =>
                `${c.name}: ${c.address}${c.reviewRequired ? " (manual review required)" : ""}`,
            )
            .join(", ") || "None"}
          . Set LAN_IP explicitly when multiple adapters exist.
        </p>
        <button
          disabled={!mobileURL || now >= pairExpiry}
          onClick={() =>
            navigator.clipboard
              .writeText(mobileURL)
              .catch(() => err("Clipboard unavailable in this context"))
          }
        >
          Copy Mobile URL
        </button>{" "}
        <button onClick={testConnection}>Test Connection</button>
        <p>
          Binding to 0.0.0.0 does not confirm phone access through firewalls,
          VLANs or Wi-Fi client isolation.
        </p>
      </details>
      <p className="disclosure">
        Sharing ends when you stop capture, disconnect, or the session expires.{" "}
        <a href="/practice" target="_blank" rel="noreferrer">
          Open practice assessment ↗
        </a>
      </p>
    </main>
  );
}
