import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import { isIP } from "node:net";
export type Candidate = {
  name: string;
  address: string;
  reviewRequired: boolean;
};
export function privateIPv4(ip: string) {
  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}
export function lanCandidates(
  interfaces: Record<
    string,
    NetworkInterfaceInfo[] | undefined
  > = networkInterfaces(),
): Candidate[] {
  return Object.entries(interfaces).flatMap(([name, items]) =>
    (items || [])
      .filter((i) => !i.internal && privateIPv4(i.address))
      .map((i) => ({
        name,
        address: i.address,
        reviewRequired:
          /vpn|tun|tap|utun|virtual|docker|veth|vmnet|bridge|hyper-v|tailscale|zerotier|wsl/i.test(
            name,
          ),
      })),
  );
}
function origin(value: string, label: string, ws = false) {
  const u = new URL(value);
  if (u.username || u.password || u.pathname !== "/" || u.search || u.hash)
    throw Error(`${label} must be an origin without paths or credentials`);
  if (!(ws ? ["wss:"] : ["https:"]).includes(u.protocol))
    throw Error(`${label} requires ${ws ? "WSS" : "HTTPS"}`);
  if (
    ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ||
    u.hostname.endsWith(".localhost")
  )
    throw Error(`${label} cannot use localhost for remote mobile pairing`);
  return u.origin;
}
export type NetworkConfig = {
  mode: "lan" | "cloud";
  localPreview?: boolean;
  appOrigin: string;
  apiOrigin: string;
  wsOrigin: string;
  allowedOrigins: string[];
  selectedLanIP: string;
  candidates: Candidate[];
  error: string;
  bindHost: string;
  port: number;
};
export function networkConfig(
  env: NodeJS.ProcessEnv = process.env,
  interfaces?: Record<string, NetworkInterfaceInfo[] | undefined>,
): NetworkConfig {
  const onRender = env.RENDER === "true";
  const renderOrigin = onRender ? env.RENDER_EXTERNAL_URL : undefined;
  const mode = env.PAIRING_MODE || (onRender ? "cloud" : "lan");
  if (!["lan", "cloud"].includes(mode))
    throw Error("PAIRING_MODE must be lan or cloud");
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("Invalid PORT");
  const candidates = lanCandidates(interfaces);
  if (env.LOCAL_PAIRING_PREVIEW === "true") {
    if (
      mode === "cloud" ||
      env.PUBLIC_APP_URL ||
      env.PUBLIC_API_URL ||
      env.PUBLIC_WS_URL ||
      env.TLS_CERT ||
      env.LAN_ENABLED === "true" ||
      (env.BIND_HOST && env.BIND_HOST !== "127.0.0.1")
    )
      throw Error(
        "Local preview requires loopback-only binding, no public URLs and no TLS; disable LOCAL_PAIRING_PREVIEW for remote pairing",
      );
    return {
      mode: "lan",
      localPreview: true,
      appOrigin: `http://localhost:${port}`,
      apiOrigin: `http://localhost:${port}`,
      wsOrigin: `ws://localhost:${port}`,
      allowedOrigins: [`http://localhost:${port}`],
      selectedLanIP: "",
      candidates,
      error: "",
      bindHost: "127.0.0.1",
      port,
    };
  }

  let selectedLanIP = env.LAN_IP || "";
  let error = "";
  if (
    selectedLanIP &&
    (!privateIPv4(selectedLanIP) ||
      !candidates.some((c) => c.address === selectedLanIP))
  )
    throw Error(
      "LAN_IP must be a private IPv4 address assigned to this server",
    );
  if (
    !selectedLanIP &&
    candidates.length === 1 &&
    !candidates[0].reviewRequired
  )
    selectedLanIP = candidates[0].address;
  let appOrigin = "",
    apiOrigin = "",
    wsOrigin = "";
  try {
    const app =
      env.PUBLIC_APP_URL ||
      (mode === "cloud" ? renderOrigin : env.PUBLIC_ORIGIN || renderOrigin);
    if (mode === "cloud" && !app)
      throw Error(
        "Cloud mode requires a PUBLIC_APP_URL HTTPS origin or Render's RENDER_EXTERNAL_URL",
      );
    if (!app && !selectedLanIP)
      throw Error(
        "Select LAN_IP from the candidate adapters; automatic selection is ambiguous or unavailable",
      );
    if (!app && env.LAN_ENABLED !== "true")
      throw Error("Enable LAN_ENABLED=true explicitly for direct LAN access");
    if (!app && (!env.TLS_CERT || !env.TLS_KEY))
      throw Error(
        "LAN pairing requires trusted TLS_CERT/TLS_KEY or an explicit PUBLIC_APP_URL served by an approved HTTPS proxy",
      );
    appOrigin = origin(
      app || `https://${selectedLanIP}:${port}`,
      "PUBLIC_APP_URL",
    );
    apiOrigin = origin(env.PUBLIC_API_URL || appOrigin, "PUBLIC_API_URL");
    wsOrigin = origin(
      env.PUBLIC_WS_URL || apiOrigin.replace(/^https:/, "wss:"),
      "PUBLIC_WS_URL",
      true,
    );
  } catch (e) {
    error = (e as Error).message;
    if (mode === "cloud") throw e;
  }
  const allowedOrigins = [
    ...new Set([
      appOrigin,
      ...(env.ALLOWED_APP_ORIGINS || `http://localhost:${port}`)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    ]),
  ];
  for (const entry of allowedOrigins.filter(Boolean)) {
    const u = new URL(entry);
    if (
      u.origin !== entry ||
      !["http:", "https:"].includes(u.protocol) ||
      (u.protocol === "http:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
    )
      throw Error(
        "ALLOWED_APP_ORIGINS requires exact HTTPS origins or loopback HTTP",
      );
  }
  const bindHost =
    env.BIND_HOST ||
    (env.LAN_ENABLED === "true" || onRender ? "0.0.0.0" : "127.0.0.1");
  return {
    mode: mode as "lan" | "cloud",
    appOrigin,
    apiOrigin,
    wsOrigin,
    allowedOrigins: allowedOrigins.filter(Boolean),
    selectedLanIP,
    candidates,
    error,
    bindHost,
    port,
  };
}
