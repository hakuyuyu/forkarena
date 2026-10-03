// Simulated audience for demos. Each visitor is a fresh browser; it converts with a probability
// set by a hidden rubric the agents never see. Real arenas use real traffic instead.
// usage: FA_URL=... node scripts/simulate.mjs <arena> [visitors=500]
const [arena, n = "500"] = process.argv.slice(2);
const base = `${process.env.FA_URL}/a/${arena}/`;

const rubric = [
  [/free|no credit card/i, 0.015],
  [/<h1[^>]*>[^<]{0,60}<\/h1>/i, 0.01],
  [/minutes?|today|instant/i, 0.01],
  [/(<input[^>]*>[\s\S]*?){4,}/i, -0.015],
];

function rate(html) {
  let p = 0.03;
  for (const [re, d] of rubric) if (re.test(html)) p += d;
  return Math.max(0.005, p);
}

let views = 0, convs = 0;
for (let i = 0; i < Number(n); i++) {
  const r = await fetch(base);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const html = await r.text();
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  views++;
  if (Math.random() < rate(html)) {
    await fetch(base + "e", { method: "POST", headers: { cookie }, body: "conv" });
    convs++;
  }
  if (views % 100 === 0) console.log(`${views} visitors, ${convs} conversions`);
}
console.log(`done: ${views} visitors, ${convs} conversions`);
