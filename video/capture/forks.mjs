// Screenshots every variant of an arena from its own Artifacts repo, so retired forks render too.
// usage: FA_URL=... node capture/forks.mjs <arena> <outdir>   (needs `npx cf` logged in)
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const [arena, out] = process.argv.slice(2);
mkdirSync(`${out}/forks`, { recursive: true });
const { variants } = await (await fetch(`${process.env.FA_URL}/api/arenas/${arena}`)).json();
const cf = (...a) => JSON.parse(execFileSync("npx", ["cf", ...a], { encoding: "utf8" }));
const browser = await chromium.launch();
for (const v of variants) {
  const { remote } = cf("artifacts", "namespaces", "repos", "get", v.repo, "--namespace", "forkarena");
  const { plaintext } = cf("artifacts", "namespaces", "tokens", "create", "forkarena", "--repo", v.repo, "--scope", "read", "--ttl", "300");
  const dir = mkdtempSync(`${tmpdir()}/fa-`);
  execFileSync("git", ["clone", "-q", `https://x:${encodeURIComponent(plaintext)}@${remote.slice(8)}`, dir]);
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 1.6 });
  const page = await ctx.newPage();
  await page.goto(`file://${dir}/index.html`);
  await page.screenshot({ path: `${out}/forks/${v.agent}.png` });
  writeFileSync(`${out}/forks/${v.agent}.html`, readFileSync(`${dir}/index.html`));
  await ctx.close();
}
await browser.close();
