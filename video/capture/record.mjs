// Records a live arena: dashboard state every second and a dashboard screenshot every two.
// usage: FA_URL=... node capture/record.mjs <arena> <outdir>   (stops when <outdir>/STOP exists)
import { chromium } from "playwright";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";

const [arena, out] = process.argv.slice(2);
mkdirSync(`${out}/dash`, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1.6, colorScheme: "dark" });
await page.goto(`${process.env.FA_URL}/?arena=${arena}`);
const t0 = Date.now();
let i = 0;
while (!existsSync(`${out}/STOP`)) {
  const t = (Date.now() - t0) / 1000;
  const s = await (await fetch(`${process.env.FA_URL}/api/arenas/${arena}`)).json();
  appendFileSync(`${out}/states.jsonl`, JSON.stringify({ t, wall: Date.now(), ...s }) + "\n");
  if (i++ % 2 === 0) await page.screenshot({ path: `${out}/dash/${String(Math.round(t * 10)).padStart(6, "0")}.png` });
  await new Promise((r) => setTimeout(r, 1000 - ((Date.now() - t0) % 1000)));
}
await browser.close();
