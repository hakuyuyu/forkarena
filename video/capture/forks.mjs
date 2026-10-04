// Screenshots every variant of an arena as a visitor sees it, by pinning the arena cookie.
// usage: FA_URL=... node capture/forks.mjs <arena> <outdir>
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const [arena, out] = process.argv.slice(2);
mkdirSync(`${out}/forks`, { recursive: true });
const { variants } = await (await fetch(`${process.env.FA_URL}/api/arenas/${arena}`)).json();
const browser = await chromium.launch();
for (const v of variants) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 1.6 });
  const url = new URL(process.env.FA_URL);
  await ctx.addCookies([{ name: `fa_${arena}`, value: v.repo, domain: url.hostname, path: `/a/${arena}` }]);
  const page = await ctx.newPage();
  await page.goto(`${process.env.FA_URL}/a/${arena}/`);
  await page.screenshot({ path: `${out}/forks/${v.agent}.png` });
  writeFileSync(`${out}/forks/${v.agent}.html`, await page.content());
  await ctx.close();
}
await browser.close();
