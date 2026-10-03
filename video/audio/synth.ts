// Synthesizes the score from src/cues.ts so every hit lands on its picture cue,
// then masters to a target integrated loudness (ITU-R BS.1770 gated, computed here).
import { writeFileSync } from "node:fs";
import { CUES, BEAT, PREROLL, DURATION } from "../src/cues.ts";

const SR = 48000;
const N = Math.ceil((DURATION + 0.5) * SR);
const L = new Float32Array(N),
  R = new Float32Array(N);
const sendL = new Float32Array(N),
  sendR = new Float32Array(N);
const TARGET_LUFS = -12.5;

const b = (beats: number) => PREROLL + beats * BEAT;
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
let seed = 7;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const noise = () => rnd() * 2 - 1;

function put(i: number, v: number, pan = 0, send = 0) {
  if (i < 0 || i >= N) return;
  const gl = Math.cos(((pan + 1) * Math.PI) / 4),
    gr = Math.sin(((pan + 1) * Math.PI) / 4);
  L[i] += v * gl;
  R[i] += v * gr;
  sendL[i] += v * gl * send;
  sendR[i] += v * gr * send;
}

function kick(t: number, g = 1) {
  const s = Math.round(t * SR);
  let ph = 0;
  for (let i = 0; i < SR * 0.45; i++) {
    const x = i / SR,
      f = 45 + 110 * Math.exp(-x * 28);
    ph += (2 * Math.PI * f) / SR;
    put(
      s + i,
      g * 0.9 * Math.sin(ph) * Math.exp(-x * 7) +
        (i < 90 ? g * 0.25 * noise() : 0),
    );
  }
}
function snare(t: number, g = 1) {
  const s = Math.round(t * SR);
  let lp = 0,
    prev = 0;
  for (let i = 0; i < SR * 0.3; i++) {
    const x = i / SR,
      n = noise();
    lp += 0.5 * (n - lp);
    const hp = n - lp;
    prev = hp;
    put(
      s + i,
      g *
        (0.45 * hp * Math.exp(-x * 14) +
          0.3 * Math.sin(2 * Math.PI * 190 * x) * Math.exp(-x * 25)),
      0.05,
      0.25,
    );
  }
}
function hat(t: number, g = 1, pan = 0.3) {
  const s = Math.round(t * SR);
  let a = 0,
    prev = 0;
  for (let i = 0; i < SR * 0.06; i++) {
    const n = noise();
    const hp = n - prev;
    prev = n;
    a = hp;
    put(s + i, g * 0.18 * a * Math.exp((-i / SR) * 70), pan, 0.1);
  }
}
function tone(
  t: number,
  dur: number,
  m: number,
  g: number,
  opt: {
    pan?: number;
    send?: number;
    partials?: number[];
    decay?: number;
    attack?: number;
  } = {},
) {
  const {
    pan = 0,
    send = 0.3,
    partials = [1, 2.01, 3.98, 5.4],
    decay = 3,
    attack = 0.004,
  } = opt;
  const s = Math.round(t * SR),
    f = hz(m);
  for (let i = 0; i < SR * dur; i++) {
    const x = i / SR;
    let v = 0;
    partials.forEach(
      (p, k) =>
        (v +=
          (Math.sin(2 * Math.PI * f * p * x) *
            Math.exp(-x * decay * (1 + k * 0.8))) /
          (k + 1)),
    );
    put(s + i, g * v * Math.min(1, x / attack), pan, send);
  }
}
function saw(
  t: number,
  dur: number,
  m: number,
  g: number,
  cutoff: number,
  opt: {
    pan?: number;
    send?: number;
    attack?: number;
    release?: number;
    drive?: number;
  } = {},
) {
  const { pan = 0, send = 0.2, attack = 0.01, release = 0.1, drive = 1 } = opt;
  const s = Math.round(t * SR),
    f = hz(m),
    n = Math.round((dur + release) * SR);
  let ph = Math.random(),
    lp1 = 0,
    lp2 = 0;
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  for (let i = 0; i < n; i++) {
    const x = i / SR;
    ph = (ph + f / SR) % 1;
    lp1 += a * (ph * 2 - 1 - lp1);
    lp2 += a * (lp1 - lp2);
    const env =
      Math.min(1, x / attack) *
      (x > dur ? Math.max(0, 1 - (x - dur) / release) : 1);
    put(s + i, g * Math.tanh(lp2 * drive) * env, pan, send);
  }
}
function riser(t0: number, t1: number, g = 1) {
  const s = Math.round(t0 * SR),
    n = Math.round((t1 - t0) * SR);
  let lp = 0,
    ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n,
      cut = 300 + 9000 * u * u,
      a = 1 - Math.exp((-2 * Math.PI * cut) / SR);
    lp += a * (noise() - lp);
    ph += (2 * Math.PI * (200 + 1400 * u * u)) / SR;
    const v = g * u ** 2 * (0.5 * lp + 0.12 * Math.sin(ph));
    put(s + i, v, Math.sin(u * 20) * 0.4, 0.4);
  }
}
function impact(t: number, g = 1) {
  kick(t, 1.1 * g);
  const s = Math.round(t * SR);
  let lp = 0,
    ph = 0;
  for (let i = 0; i < SR * 2.2; i++) {
    const x = i / SR;
    lp += 0.15 * (noise() - lp);
    ph += (2 * Math.PI * (38 + 20 * Math.exp(-x * 4))) / SR;
    put(
      s + i,
      g *
        (0.6 * Math.sin(ph) * Math.exp(-x * 2.2) +
          0.5 * lp * Math.exp(-x * 3.5) +
          0.12 * noise() * Math.exp(-x * 9)),
      0,
      0.5,
    );
  }
}
function thud(t: number) {
  // a fork retires: a low drop with a falling blip
  kick(t, 0.7);
  const s = Math.round(t * SR);
  let ph = 0;
  for (let i = 0; i < SR * 0.35; i++) {
    const x = i / SR;
    ph += (2 * Math.PI * (700 * Math.exp(-x * 6))) / SR;
    put(s + i, 0.16 * Math.sin(ph) * Math.exp(-x * 8), -0.3, 0.3);
  }
}

// ---------- the arrangement ----------
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [55, 60, 64],
  [55, 59, 62],
]; // Am F C G
const ROOTS = [33, 29, 36, 31];
const PENTA = [69, 72, 74, 76, 79, 81];
const endBeat = (DURATION - PREROLL) / BEAT;

// pad under everything, opening up as the arena comes alive
for (let bt = 0; bt < 48; bt += 4) {
  const k = (bt / 4) % 4,
    cut = bt < 8 ? 500 : bt < 16 ? 900 : bt < 32 ? 1500 : 2200;
  CHORDS[k].forEach((m, j) => {
    saw(b(bt), 4 * BEAT, m, 0.05, cut, {
      pan: j - 1,
      send: 0.5,
      attack: 0.3,
      release: 0.4,
    });
    saw(b(bt), 4 * BEAT, m + 0.08, 0.04, cut, {
      pan: 1 - j,
      send: 0.5,
      attack: 0.3,
      release: 0.4,
    });
  });
}
// queue: plucks that crowd in as PRs pile up
for (let bt = 0; bt < 7; bt += bt < 3 ? 1 : bt < 5 ? 0.5 : 0.25)
  tone(b(bt), 0.5, PENTA[Math.floor(rnd() * PENTA.length)] - 12, 0.12, {
    pan: rnd() * 1.2 - 0.6,
    decay: 9,
  });
for (let bt = 0; bt < 7; bt += 0.5) hat(b(bt), 0.4 + bt * 0.08);
riser(b(5), CUES.collapse, 0.9);
impact(CUES.collapse);
// forks: one bell per clone, climbing the chord
[69, 72, 76, 79, 81, 84].forEach((m, k) =>
  tone(CUES.forks[k], 1.6, m, 0.16, { pan: k % 2 ? 0.4 : -0.4, send: 0.6 }),
);
for (let bt = 8; bt < 16; bt += 2)
  saw(b(bt), 1.6 * BEAT, ROOTS[((bt / 4) % 4) | 0], 0.22, 220, { drive: 2 });
riser(b(13), CUES.traffic, 0.9);
impact(CUES.traffic);
// traffic + promotion: full groove, a breath on beat 31, then the crown
for (let bt = 16; bt < 40; bt++) {
  if (bt === 31) continue;
  kick(b(bt));
  if (bt % 2) snare(b(bt), bt >= 32 ? 1 : 0.85);
  hat(b(bt + 0.5), 1, 0.35);
  hat(b(bt + 0.25), 0.45, -0.35);
  hat(b(bt + 0.75), 0.45, -0.35);
}
for (let bt = 16; bt < 40; bt += 0.5)
  if (bt < 31 || bt >= 32)
    saw(
      b(bt),
      0.4 * BEAT,
      ROOTS[((bt / 4) % 4) | 0] + (bt % 1 ? 12 : 0),
      0.2,
      bt >= 32 ? 600 : 380,
      { drive: 2.5, send: 0.05 },
    );
for (let bt = 16; bt < 31; bt += 0.5)
  if ((bt * 2) % 3 === 0)
    tone(b(bt), 0.3, PENTA[Math.floor(rnd() * 6)], 0.05, {
      pan: rnd() - 0.5,
      decay: 12,
      send: 0.5,
    });
CUES.retire.forEach(thud);
riser(b(28), CUES.promote, 1);
for (let k = 0; k < 8; k++) snare(b(30 + k * 0.125), 0.25 + k * 0.08);
impact(CUES.promote, 1.1);
[81, 84, 88, 93].forEach((m, k) =>
  tone(CUES.promote + k * 0.06, 2.5, m, 0.1, {
    pan: (k - 1.5) * 0.4,
    send: 0.7,
    decay: 1.4,
  }),
);
riser(b(37), CUES.payoff, 0.8);
impact(CUES.payoff);
// payoff: half-time, the 2.5× hit on beat 44
for (let bt = 40; bt < 48; bt++) {
  if (bt % 4 === 0 || bt % 4 === 2.5) kick(b(bt));
  if (bt % 4 === 2) snare(b(bt));
  hat(b(bt + 0.5), 0.8);
}
for (let bt = 40; bt < 48; bt += 1)
  saw(b(bt), 0.8 * BEAT, ROOTS[((bt / 4) % 4) | 0], 0.2, 500, { drive: 2 });
tone(b(44), 2.5, 76, 0.14, { send: 0.7, decay: 1.2 });
tone(b(44), 2.5, 81, 0.12, { send: 0.7, decay: 1.2 });
kick(b(44), 1.1);
impact(CUES.end, 0.9);
// end card: Am(add9) rings out while the logo draws
[57, 60, 64, 71].forEach((m, j) =>
  saw(CUES.end, (endBeat - 50) * BEAT, m, 0.05, 1200, {
    pan: (j - 1.5) * 0.5,
    send: 0.6,
    attack: 0.05,
    release: 1.5,
  }),
);
[69, 76, 81, 83, 88].forEach((m, k) =>
  tone(CUES.end + (k * BEAT) / 2, 3, m, 0.11, {
    pan: (k - 2) * 0.3,
    send: 0.7,
    decay: 1,
  }),
);
saw(CUES.end, 6 * BEAT, 33, 0.25, 160, { drive: 1.5, release: 1.5 });

// ---------- reverb (Schroeder) on the send bus ----------
function reverb(inp: Float32Array, out: Float32Array, offs: number) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({
    d: d + offs,
    buf: new Float32Array(d + offs),
    i: 0,
  }));
  const aps = [225, 556].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
  for (let n = 0; n < N; n++) {
    let y = 0;
    for (const c of combs) {
      const v = c.buf[c.i];
      c.buf[c.i] = inp[n] + v * 0.84;
      c.i = (c.i + 1) % c.d;
      y += v;
    }
    y *= 0.25;
    for (const a of aps) {
      const v = a.buf[a.i];
      const w = y + v * 0.5;
      a.buf[a.i] = w;
      a.i = (a.i + 1) % a.d;
      y = v - w * 0.5;
    }
    out[n] += y * 0.6;
  }
}
reverb(sendL, L, 0);
reverb(sendR, R, 23);

// fade at the very end
for (let i = Math.round((DURATION - 1.2) * SR); i < N; i++) {
  const g = Math.max(0, 1 - (i / SR - (DURATION - 1.2)) / 1.2);
  L[i] *= g;
  R[i] *= g;
}

// ---------- master: find the drive that hits the loudness target ----------
function biquad(
  x: Float32Array,
  b0: number,
  b1: number,
  b2: number,
  a1: number,
  a2: number,
) {
  const y = new Float32Array(x.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}
function lufs(l: Float32Array, r: Float32Array) {
  const kw = (x: Float32Array) =>
    biquad(
      biquad(
        x,
        1.53512485958697,
        -2.69169618940638,
        1.19839281085285,
        -1.69065929318241,
        0.73248077421585,
      ),
      1,
      -2,
      1,
      -1.99004745483398,
      0.99007225036621,
    );
  const kl = kw(l),
    kr = kw(r),
    blk = 0.4 * SR,
    hop = 0.1 * SR,
    z: number[] = [];
  for (let s = 0; s + blk <= N; s += hop) {
    let a = 0;
    for (let i = s; i < s + blk; i++) a += kl[i] * kl[i] + kr[i] * kr[i];
    z.push(a / blk);
  }
  const ld = (m: number) => -0.691 + 10 * Math.log10(m);
  const abs = z.filter((m) => ld(m) > -70);
  const rel = ld(abs.reduce((a, m) => a + m, 0) / abs.length) - 10;
  const g = abs.filter((m) => ld(m) > rel);
  return ld(g.reduce((a, m) => a + m, 0) / g.length);
}
const master = (drive: number) => {
  const ml = new Float32Array(N),
    mr = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    ml[i] = 0.98 * Math.tanh(L[i] * drive);
    mr[i] = 0.98 * Math.tanh(R[i] * drive);
  }
  return [ml, mr];
};
let lo = 0.1,
  hi = 20,
  best = master(1);
for (let it = 0; it < 18; it++) {
  const mid = Math.sqrt(lo * hi);
  best = master(mid);
  if (lufs(best[0], best[1]) < TARGET_LUFS) lo = mid;
  else hi = mid;
}
const [ml, mr] = best;
console.log(
  `integrated ${lufs(ml, mr).toFixed(2)} LUFS (target ${TARGET_LUFS}), drive ${lo.toFixed(2)}`,
);

const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(
    Math.round(Math.max(-1, Math.min(1, ml[i])) * 32767),
    44 + i * 4,
  );
  buf.writeInt16LE(
    Math.round(Math.max(-1, Math.min(1, mr[i])) * 32767),
    46 + i * 4,
  );
}
writeFileSync(new URL("../public/soundtrack.wav", import.meta.url), buf);
