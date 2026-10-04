// Mixes the Demo soundtrack from src/demo-cues.ts: a soft pad that changes chord on every
// chapter, ducked under the voice, plus the narration at its cue times. Loudness is
// normalized afterwards with ffmpeg (see README).
// usage: node audio/demo-mix.ts
import { readFileSync, writeFileSync } from "node:fs";
import { CH, DEMO_DURATION } from "../src/demo-cues.ts";

const SR = 48000;
const N = Math.ceil(DEMO_DURATION * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

// Mono 16-bit or float WAV at any rate, linearly resampled to SR.
function readWav(path: string): Float32Array {
  const b = readFileSync(path);
  let o = 12, fmt = 1, rate = 24000, bits = 16, data = b.subarray(0, 0);
  while (o < b.length) {
    const id = b.toString("ascii", o, o + 4), size = b.readUInt32LE(o + 4);
    if (id === "fmt ") { fmt = b.readUInt16LE(o + 8); rate = b.readUInt32LE(o + 12); bits = b.readUInt16LE(o + 22); }
    if (id === "data") data = b.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size & 1);
  }
  const n = data.length / (bits / 8);
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) src[i] = fmt === 3 ? data.readFloatLE(i * 4) : data.readInt16LE(i * 2) / 32768;
  const out = new Float32Array(Math.floor((n * SR) / rate));
  for (let i = 0; i < out.length; i++) {
    const x = (i * rate) / SR, j = Math.floor(x), f = x - j;
    out[i] = src[j] * (1 - f) + (src[Math.min(j + 1, n - 1)] ?? 0) * f;
  }
  return out;
}

// Voice gain envelope for ducking: 1 while narrating, easing out over 0.4s.
const duck = new Float32Array(N);
for (const c of CH) {
  const a = Math.floor((c.vo - 0.3) * SR), z = Math.floor((c.vo + c.voLen + 0.4) * SR);
  for (let i = Math.max(0, a); i < Math.min(N, z); i++) duck[i] = 1;
}
for (let i = 1; i < N; i++) duck[i] = Math.max(duck[i], duck[i - 1] - 1 / (0.6 * SR));
for (let i = N - 2; i >= 0; i--) duck[i] = Math.max(duck[i], duck[i + 1] - 1 / (0.3 * SR));

// Pad: one chord per chapter, slow attack and release, detuned sine pairs.
const CHORDS = [[45, 52, 57, 60, 64], [41, 48, 53, 57, 64], [43, 50, 55, 59, 62], [40, 47, 52, 55, 59],
  [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62], [48, 55, 60, 64, 67], [45, 52, 57, 60, 64]];
CH.forEach((c, k) => {
  const a = Math.floor(c.start * SR), z = Math.min(N, Math.floor((c.start + c.dur + 1.2) * SR));
  for (const [v, m] of CHORDS[k % CHORDS.length].entries()) {
    const f = hz(m), pan = (v / 4) * 1.2 - 0.6, g = 0.05 / (1 + v * 0.25);
    for (let i = a; i < z; i++) {
      const t = (i - a) / SR, rem = (z - i) / SR;
      const env = Math.min(1, t / 1.2) * Math.min(1, rem / 1.2);
      const s = (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.003 * t + v)) * 0.5 * g * env;
      const shimmer = 1 + 0.15 * Math.sin(2 * Math.PI * 0.2 * t + v);
      const bed = s * shimmer * (1 - 0.65 * duck[i]);
      L[i] += bed * (1 - pan) * 0.7;
      R[i] += bed * (1 + pan) * 0.7;
    }
  }
});

// Soft pulse under the live traffic chapter.
const tr = CH.find((c) => c.id === "traffic")!;
for (let t = tr.start + 0.5; t < tr.start + tr.dur - 0.5; t += 0.5) {
  const a = Math.floor(t * SR);
  for (let j = 0; j < SR * 0.25 && a + j < N; j++) {
    const s = Math.sin(2 * Math.PI * (55 + 40 * Math.exp(-j / 800)) * (j / SR)) * Math.exp(-j / 4000) * 0.12;
    L[a + j] += s; R[a + j] += s;
  }
}

for (const c of CH) {
  const vo = readWav(`public/demo-vo/${c.id}.wav`);
  const a = Math.floor(c.vo * SR);
  for (let i = 0; i < vo.length && a + i < N; i++) { L[a + i] += vo[i] * 0.9; R[a + i] += vo[i] * 0.9; }
}

const out = Buffer.alloc(44 + N * 8);
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 8, 4); out.write("WAVEfmt ", 8);
out.writeUInt32LE(16, 16); out.writeUInt16LE(3, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24);
out.writeUInt32LE(SR * 8, 28); out.writeUInt16LE(8, 32); out.writeUInt16LE(32, 34); out.write("data", 36); out.writeUInt32LE(N * 8, 40);
for (let i = 0; i < N; i++) { out.writeFloatLE(L[i], 44 + i * 8); out.writeFloatLE(R[i], 48 + i * 8); }
writeFileSync("public/demo-vo/mix-raw.wav", out);
console.log(`mix-raw.wav ${DEMO_DURATION.toFixed(1)}s`);
