import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../packages/shared/index";
export type Credentials = { id: string; token: string };
export type AppConfig = {
  localPreview?: boolean;
  pairingMode: string;
  appOrigin: string;
  apiOrigin: string;
  wsOrigin: string;
  selectedLanIP: string;
  candidates: { name: string; address: string; reviewRequired: boolean }[];
  configurationError: string;
};
declare global {
  interface Window {
    __APP_CONFIG__?: AppConfig;
  }
}
export const config = () => window.__APP_CONFIG__;
export function apiURL(path: string) {
  return (config()?.apiOrigin || location.origin) + "/api/" + path;
}
export function socketURL() {
  return (
    (config()?.wsOrigin || location.origin.replace(/^http/, "ws")) +
    "/api/socket"
  );
}
export async function api(path: string, body: unknown = {}, c?: Credentials) {
  let r: Response;
  try {
    r = await fetch(apiURL(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(c ? { Authorization: "Bearer " + c.token } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw Error(
      "Cannot reach the API. Check the configured address, trusted HTTPS certificate, and firewall or network isolation. Different networks require a public HTTPS endpoint.",
    );
  }
  const b = await r.json();
  if (!r.ok) throw Error(b.error || "Request failed");
  return b;
}
export function useSession(
  c: Credentials | null,
  role: "desktop" | "mobile",
  refresh?: (requestId: string) => void,
) {
  const refreshHandler = useRef(refresh);
  refreshHandler.current = refresh;
  const [snapshot, set] = useState<Snapshot | null>(null);
  const [connected, connection] = useState(false);
  const [connectionError, setError] = useState("");
  useEffect(() => {
    set(null);
    connection(false);
    if (!c) return;
    let disposed = false;
    let ws: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let ended = false;
    let attempts = 0;
    const open = () => {
      ws = new WebSocket(socketURL());
      ws.onopen = () => {
        ws.send(JSON.stringify({ ...c, role }));
      };
      ws.onmessage = (e) => {
        const b = JSON.parse(e.data);
        if (b.type === "snapshot") {
          attempts = 0;
          setError("");
          connection(true);
          set(b);
          if (["EXPIRED", "DISCONNECTED"].includes(b.state)) {
            ended = true;
            sessionStorage.removeItem(role);
          }
        }
        if (b.type === "refresh" && typeof b.requestId === "string")
          refreshHandler.current?.(b.requestId);
      };
      ws.onclose = (e) => {
        connection(false);
        setError(
          e.code === 1008
            ? "Session unauthorized, already disconnected, or expired. Pair again."
            : "WebSocket connection failed. Check WSS URL, certificate trust, and network access.",
        );
        if (e.code === 1008) {
          ended = true;
          sessionStorage.removeItem(role);
        }
        if (!disposed && !ended && attempts < 6)
          timer = setTimeout(open, Math.min(1000 * 2 ** attempts++, 8000));
      };
    };
    open();
    return () => {
      disposed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [c?.id, c?.token, role]);
  return { snapshot, connected, connectionError };
}
export function saved(role: string): Credentials | null {
  try {
    return JSON.parse(sessionStorage.getItem(role) || "null");
  } catch {
    return null;
  }
}
