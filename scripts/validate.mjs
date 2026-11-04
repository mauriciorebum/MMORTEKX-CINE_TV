import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const metadata = JSON.parse(await readFile("webos/appinfo.json", "utf8"));
assert.equal(metadata.id, "com.mmortekx.cine.tv");
assert.equal(metadata.type, "web");
assert.equal(metadata.main, "index.html");
assert.equal(metadata.icon, "icon.png");
assert.match(metadata.version, /^\d+\.\d+\.\d+$/);

for (const file of [
  "webos/index.html",
  "webos/app.js",
  "webos/core.js",
  "webos/styles.css",
  "webos/logo-transparent-fixed.gif",
  "webos/loading-1.gif",
  "webos/loading-2.gif",
  "webos/loading-3.gif"
]) {
  await access(file);
}

const app = await readFile("webos/app.js", "utf8");
const core = await readFile("webos/core.js", "utf8");
const combined = app + "\\n" + core;
for (const required of [
  "AuthenticateByName",
  "/api/profiles",
  "Continue assistindo",
  "master.m3u8",
  "loadEpisodes",
  "saveProgress",
  "moveFocus",
  "favorites",
  "history",
  "PROFILE",
]) {
  assert.ok(combined.toLowerCase().includes(required.toLowerCase()), "Recurso esperado ausente: " + required);
}
console.log("Estrutura, metadados e recursos essenciais validados.");
