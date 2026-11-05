import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import staticPlugin from "@fastify/static";
import { buildApp } from "./app";
import { networkConfig } from "./network";
const network = networkConfig();
const tls =
  process.env.TLS_CERT && process.env.TLS_KEY
    ? {
        https: {
          cert: readFileSync(process.env.TLS_CERT),
          key: readFileSync(process.env.TLS_KEY),
        },
      }
    : {};
const { app } = await buildApp(undefined, tls, network);
if (process.env.NODE_ENV === "development" || process.argv.includes("--dev")) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.setNotFoundHandler((req, reply) => {
    reply.hijack();
    vite.middlewares(req.raw as any, reply.raw as any, () => {
      reply.raw.statusCode = 404;
      reply.raw.end();
    });
  });
  app.addHook("onClose", async () => {
    await vite.close();
  });
} else {
  await app.register(staticPlugin, { root: resolve("dist/web") });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api/")
      ? reply.code(404).send({ error: "Not found" })
      : reply.sendFile("index.html"),
  );
}
await app.listen({
  port: network.port,
  host: network.bindHost,
});
console.log(
  `Assistant listening on ${network.bindHost}:${network.port}. Mobile origin: ${network.appOrigin || "not configured"}`,
);
if (network.error) console.warn(network.error);
