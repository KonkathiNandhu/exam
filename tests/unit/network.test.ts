import { test } from "node:test";
import assert from "node:assert/strict";
import { networkConfig, lanCandidates } from "../../apps/server/network";
const iface = (address: string, internal = false): any => ({
  address,
  internal,
  family: "IPv4",
  netmask: "255.255.255.0",
  mac: "00:00:00:00:00:00",
  cidr: address + "/24",
});
const single = {
  en0: [iface("192.168.1.15")],
  lo0: [iface("127.0.0.1", true)],
};
test("macOS and Windows private IPv4 candidate detection excludes loopback, IPv6 and public IPs", () => {
  assert.deepEqual(
    lanCandidates(single).map((c) => c.address),
    ["192.168.1.15"],
  );
  assert.deepEqual(
    lanCandidates({
      Ethernet: [iface("10.0.0.12")],
      WiFi: [iface("169.254.1.2"), iface("8.8.8.8"), iface("::1")],
    }).map((c) => c.address),
    ["10.0.0.12"],
  );
});
test("multiple adapters and virtual adapters require explicit selection", () => {
  const multi = { ...single, utun3: [iface("10.4.0.1")] };
  const c = networkConfig({}, multi);
  assert.equal(c.selectedLanIP, "");
  assert.match(c.error, /Select LAN_IP/);
  assert.equal(c.candidates[1].reviewRequired, true);
  assert.equal(
    networkConfig({}, { utun0: [iface("10.1.2.3")] }).selectedLanIP,
    "",
  );
});
test("explicit LAN IP and trusted HTTPS generate reachable API and WSS hosts", () => {
  const c = networkConfig(
    {
      LAN_ENABLED: "true",
      LAN_IP: "192.168.1.15",
      TLS_CERT: "cert",
      TLS_KEY: "key",
    },
    single,
  );
  assert.equal(c.error, "");
  assert.equal(c.appOrigin, "https://192.168.1.15:3000");
  assert.equal(c.apiOrigin, c.appOrigin);
  assert.equal(c.wsOrigin, "wss://192.168.1.15:3000");
  assert.equal(c.bindHost, "0.0.0.0");
});
test("invalid and unassigned LAN addresses fail validation", () => {
  for (const LAN_IP of ["localhost", "999.1.1.1", "8.8.8.8", "192.168.1.99"])
    assert.throws(() => networkConfig({ LAN_IP }, single));
});
test("remote QR origins never fall back to localhost or insecure HTTP", () => {
  for (const PUBLIC_APP_URL of [
    "http://localhost:3000",
    "https://localhost:3000",
    "http://192.168.1.15:3000",
    "https://user:pass@host.test",
    "https://host.test/path",
  ]) {
    assert.ok(networkConfig({ PUBLIC_APP_URL }, single).error);
    assert.throws(() =>
      networkConfig({ PAIRING_MODE: "cloud", PUBLIC_APP_URL }, single),
    );
  }
});
test("cloud mode validates explicit app/API/WS origins, no mixed content", () => {
  const c = networkConfig(
    {
      PAIRING_MODE: "cloud",
      PUBLIC_APP_URL: "https://mobile.example.test",
      PUBLIC_API_URL: "https://api.example.test",
      PUBLIC_WS_URL: "wss://socket.example.test",
      ALLOWED_APP_ORIGINS: "http://localhost:3000,https://desktop.example.test",
    },
    {},
  );
  assert.equal(c.appOrigin, "https://mobile.example.test");
  assert.equal(c.wsOrigin, "wss://socket.example.test");
  assert.ok(c.allowedOrigins.includes("https://desktop.example.test"));
  assert.throws(() => networkConfig({ PAIRING_MODE: "cloud" }, {}));
  assert.throws(() =>
    networkConfig(
      {
        PAIRING_MODE: "cloud",
        PUBLIC_APP_URL: c.appOrigin,
        PUBLIC_WS_URL: "ws://socket.example.test",
      },
      {},
    ),
  );
});
test("localhost preview is explicitly loopback-only and cannot be combined with remote exposure", () => {
  const c = networkConfig({ LOCAL_PAIRING_PREVIEW: "true" }, single);
  assert.equal(c.localPreview, true);
  assert.equal(c.appOrigin, "http://localhost:3000");
  assert.equal(c.bindHost, "127.0.0.1");
  for (const other of [
    { LAN_ENABLED: "true" },
    { PAIRING_MODE: "cloud" },
    { PUBLIC_APP_URL: "https://remote.example.test" },
    { BIND_HOST: "0.0.0.0" },
  ])
    assert.throws(() =>
      networkConfig({ LOCAL_PAIRING_PREVIEW: "true", ...other }, single),
    );
});
