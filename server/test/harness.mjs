import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const freePort = () =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

export async function startServer(extraEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), "apex-server-"));
  const webDist = join(dir, "web");
  mkdirSync(join(webDist, "assets"), { recursive: true });
  writeFileSync(join(webDist, "index.html"), '<!doctype html><div id="root"></div>');
  writeFileSync(join(webDist, "assets", "index-abcd1234.js"), "console.log(1)");
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["dist/server.mjs"], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DB_PATH: join(dir, "x.db"),
      WEB_DIST: webDist,
      ...extraEnv,
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${base}/api/health`);
      return { base, dir, stop: () => child.kill() };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  child.kill();
  throw new Error("server did not start");
}
