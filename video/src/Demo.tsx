import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
  interpolate,
  Easing,
  random,
} from "remotion";
import { loadFont as loadGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { CH, DFPS, LEAD, type ChapterId } from "./demo-cues";
import STATES from "./demo-states.json";

const display = loadGrotesk("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
}).fontFamily;
const mono = loadMono("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
}).fontFamily;

const C = {
  bg: "#05070a",
  ink: "#eef2f5",
  muted: "#7d8a94",
  orange: "#f6821f",
  blue: "#5aa9ff",
  red: "#ff6b5a",
  mint: "#7cffb2",
  card: "#0d131a",
  line: "#1f2a35",
};
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const io = Easing.inOut(Easing.cubic);
const out = Easing.out(Easing.cubic);
const ramp = (t: number, a: number, b: number, easing = io) =>
  interpolate(t, [a, b], [0, 1], { ...clamp, easing });
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

// Each scene gets t (seconds into its chapter), d (chapter length) and v (0..1 through the narration).
type Scene = React.FC<{
  t: number;
  d: number;
  v: number;
  vt: (f: number) => number;
}>;

const IDEAS: Record<string, string> = {
  "agent-1": "Shorter headline",
  "agent-2": "Email-only form",
  "agent-3": "“Free, no credit card”",
  "agent-4": "Lead with time saved",
  "agent-5": "Testimonial",
  "agent-6": "“Start free today” button",
  "agent-7": "Time saved, on the new champion",
  seed: "Original page",
};
const AGENTS = [
  "seed",
  "agent-1",
  "agent-2",
  "agent-3",
  "agent-4",
  "agent-5",
  "agent-6",
];

type Snap = { t: number; v: Record<string, [number, number, string]> };
const S = STATES as unknown as Snap[];
const snap = (t: number): Snap => {
  let lo = 0;
  for (let i = 0; i < S.length; i++) if (S[i].t <= t) lo = i;
  return S[lo];
};
const total = (s: Snap) => Object.values(s.v).reduce((a, x) => a + x[0], 0);

// ---------------- shared pieces ----------------

const Header: React.FC<{
  n: number;
  title: string;
  t: number;
  extra?: React.ReactNode;
}> = ({ n, title, t, extra }) => {
  const p = ramp(t, 0.1, 0.8, out);
  return (
    <div
      style={{
        position: "absolute",
        left: 96,
        top: 72,
        display: "flex",
        alignItems: "center",
        gap: 22,
        opacity: p,
        transform: `translateX(${(1 - p) * -40}px)`,
      }}
    >
      <div
        style={{ width: 6, height: 44, background: C.orange, borderRadius: 3 }}
      />
      <div style={{ fontFamily: mono, fontSize: 24, color: C.orange }}>
        {String(n).padStart(2, "0")}
      </div>
      <div
        style={{
          fontFamily: display,
          fontWeight: 700,
          fontSize: 40,
          color: C.ink,
          letterSpacing: -0.5,
        }}
      >
        {title}
      </div>
      {extra}
    </div>
  );
};

const Window: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ x, y, w, h, title, children, style }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      height: h,
      background: C.card,
      border: `1px solid ${C.line}`,
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: "0 40px 120px rgba(0,0,0,0.55)",
      ...style,
    }}
  >
    <div
      style={{
        height: 44,
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "0 18px",
        borderBottom: `1px solid ${C.line}`,
        background: "#0a1016",
      }}
    >
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
        <div
          key={c}
          style={{
            width: 13,
            height: 13,
            borderRadius: 7,
            background: c,
            opacity: 0.85,
          }}
        />
      ))}
      <div
        style={{
          fontFamily: mono,
          fontSize: 17,
          color: C.muted,
          marginLeft: 14,
        }}
      >
        {title}
      </div>
    </div>
    <div style={{ position: "relative", height: h - 44 }}>{children}</div>
  </div>
);

const Typed: React.FC<{ text: string; p: number; color?: string }> = ({
  text,
  p,
  color = C.ink,
}) => {
  const n = Math.floor(text.length * Math.min(1, Math.max(0, p)));
  return (
    <span style={{ color }}>
      {text.slice(0, n)}
      {p > 0 && p < 1 ? (
        <span style={{ background: C.ink, color: C.ink }}>_</span>
      ) : null}
    </span>
  );
};

const Shot: React.FC<{
  src: string;
  w: number;
  h: number;
  style?: React.CSSProperties;
}> = ({ src, w, h, style }) => (
  <div
    style={{
      width: w,
      height: h,
      overflow: "hidden",
      borderRadius: 10,
      background: "#fafaf7",
      ...style,
    }}
  >
    <Img
      src={staticFile(src)}
      style={{ width: w, height: (w * 1200) / 1920, display: "block" }}
    />
  </div>
);

const Pill: React.FC<{ status: string; size?: number }> = ({
  status,
  size = 18,
}) => {
  const col =
    status === "champion"
      ? C.mint
      : status === "retired" || status === "dethroned"
        ? C.red
        : C.blue;
  return (
    <span
      style={{
        fontFamily: mono,
        fontSize: size,
        color: col,
        border: `1.5px solid ${col}`,
        borderRadius: 999,
        padding: "3px 12px",
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
};

// ---------------- 01 hook: the review queue ----------------

const Hook: Scene = ({ t, v, vt }) => {
  const collapse = vt(0.6);
  const cp = ramp(t, collapse, collapse + 0.9, Easing.in(Easing.cubic));
  const title = ramp(t, collapse + 0.7, collapse + 1.6, out);
  const fill = ramp(t, 0.3, collapse, Easing.in(Easing.quad));
  const n = Math.floor(fill * 140);
  const prs = Math.round(fill * 1000);
  const push = lerp(1, 1.12, ramp(t, 0, collapse));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        {Array.from({ length: n }, (_, i) => {
          const born = (i / 140) * (collapse - 0.3) + 0.3;
          const drop = ramp(t, born, born + 0.5, out);
          const x = 120 + random(`x${i}`) * 1500,
            y = 160 + random(`y${i}`) * 760;
          const rot = (random(`r${i}`) - 0.5) * 16;
          const cx = 960 + (x - 960) * (1 - cp),
            cy = 540 + (y - 540) * (1 - cp);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: cx - 150,
                top: cy - 30 - (1 - drop) * 120,
                width: 300,
                height: 60,
                opacity: drop * (1 - cp),
                transform: `rotate(${rot * (1 - cp)}deg) scale(${1 - cp * 0.7})`,
                background: C.card,
                border: `1px solid ${C.line}`,
                borderLeft: `4px solid ${random(`c${i}`) > 0.85 ? C.red : C.blue}`,
                borderRadius: 8,
                padding: "8px 14px",
                fontFamily: mono,
                fontSize: 15,
                color: C.muted,
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ color: C.ink }}>
                #{1000 + Math.floor(random(`n${i}`) * 9000)} agent-
                {1 + Math.floor(random(`a${i}`) * 999)}
              </div>
              <div>Review required</div>
            </div>
          );
        })}
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 50,
          textAlign: "center",
          opacity: 1 - cp,
          zIndex: 5,
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "14px 48px 18px",
            borderRadius: 28,
            background: "rgba(5,7,10,0.86)",
            boxShadow: "0 0 80px 40px rgba(5,7,10,0.8)",
          }}
        >
        <div
          style={{
            fontFamily: display,
            fontWeight: 700,
            fontSize: 96,
            color: C.ink,
            letterSpacing: -2,
          }}
        >
          {prs.toLocaleString()}
        </div>
        <div style={{ fontFamily: mono, fontSize: 26, color: C.muted }}>
          open pull requests · 1 reviewer
        </div>
      </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 960 - 40,
          top: 540 - 40,
          width: 80,
          height: 80,
          borderRadius: 40,
          background: C.orange,
          opacity: Math.sin(cp * Math.PI) * 0.9,
          filter: "blur(18px)",
          transform: `scale(${1 + cp * 8})`,
        }}
      />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          opacity: title,
        }}
      >
        <div
          style={{
            transform: `scale(${lerp(0.9, 1, title)})`,
            textAlign: "center",
          }}
        >
          <ForkMark size={120} p={title} />
          <div
            style={{
              fontFamily: display,
              fontWeight: 700,
              fontSize: 150,
              color: C.ink,
              letterSpacing: -4,
              marginTop: 10,
            }}
          >
            Fork Arena
          </div>
          <div
            style={{
              fontFamily: display,
              fontWeight: 500,
              fontSize: 42,
              color: C.muted,
              marginTop: 8,
            }}
          >
            Agents fork, ship, and{" "}
            <span style={{ color: C.orange }}>traffic decides.</span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const ForkMark: React.FC<{ size: number; p: number }> = ({ size, p }) => {
  const len = 400;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ display: "block", margin: "0 auto" }}
    >
      <path
        d="M50 92 V58 C50 40 24 40 24 18 M50 58 C50 40 76 40 76 18 M50 58 V12"
        fill="none"
        stroke={C.orange}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - p)}
      />
      {[
        [24, 14],
        [50, 9],
        [76, 14],
      ].map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={7 * ramp(p, 0.6 + i * 0.1, 0.9 + i * 0.03)}
          fill={i === 1 ? C.mint : C.ink}
        />
      ))}
    </svg>
  );
};

// ---------------- 02 idea: GitHub vs Fork Arena ----------------

const ROWS: [string, string][] = [
  ["Pull request", "A live fork of the champion"],
  ["Code review", "Visitors, split by Thompson sampling"],
  ["Merge", "Better conversion gets promoted"],
  ["Merge conflict", "Impossible: forks compete, never merge"],
];

const Idea: Scene = ({ t, vt }) => {
  const at = [vt(0.07), vt(0.3), vt(0.55), vt(0.78)];
  const push = lerp(1, 1.06, ramp(t, 0, 24, Easing.linear));
  return (
    <AbsoluteFill>
      <Header n={2} title="Replace review with selection" t={t} />
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        <div
          style={{
            position: "absolute",
            left: 180,
            top: 230,
            display: "flex",
            fontFamily: mono,
            fontSize: 24,
            color: C.muted,
            gap: 0,
          }}
        >
          <div style={{ width: 520 }}>GitHub</div>
          <div style={{ width: 120 }} />
          <div style={{ color: C.orange }}>Fork Arena</div>
        </div>
        {ROWS.map(([a, b], i) => {
          const p = ramp(t, at[i], at[i] + 0.6, out);
          const sweep = ramp(t, at[i] + 0.4, at[i] + 1.0);
          const typed = ramp(t, at[i] + 0.8, at[i] + 2.0, Easing.linear);
          const strike = ramp(t, at[i] + 0.9, at[i] + 1.3);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 180,
                top: 300 + i * 150,
                height: 120,
                width: 1560,
                display: "flex",
                alignItems: "center",
                opacity: p,
                transform: `translateY(${(1 - p) * 30}px)`,
                borderTop: `1px solid ${C.line}`,
              }}
            >
              <div
                style={{
                  width: 520,
                  position: "relative",
                  fontFamily: display,
                  fontWeight: 500,
                  fontSize: 48,
                  color: lerp(1, 0.4, strike) > 0.7 ? C.ink : C.muted,
                }}
              >
                {a}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "52%",
                    height: 4,
                    width: `${strike * 100}%`,
                    maxWidth: a.length * 26,
                    background: C.red,
                    borderRadius: 2,
                  }}
                />
              </div>
              <svg width={120} height={40}>
                <path
                  d="M10 20 H100 M86 8 L104 20 L86 32"
                  stroke={C.orange}
                  strokeWidth={4}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={140}
                  strokeDashoffset={140 * (1 - sweep)}
                />
              </svg>
              <div
                style={{
                  fontFamily: display,
                  fontWeight: 700,
                  fontSize: 48,
                  color: C.ink,
                }}
              >
                <Typed text={b} p={typed} />
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------- 03 architecture ----------------

const P = {
  visitor: { x: 250, y: 600 },
  worker: { x: 800, y: 600 },
  dobj: { x: 1420, y: 330 },
  art: { x: 1420, y: 820 },
};

const Packet: React.FC<{
  path: string;
  t: number;
  from: number;
  period: number;
  color: string;
  n?: number;
}> = ({ path, t, from, period, color, n = 3 }) => {
  if (t < from) return null;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const u = ((t - from) / period + i / n) % 1;
        return (
          <circle
            key={i}
            r={9}
            fill={color}
            style={
              {
                offsetPath: `path("${path}")`,
                offsetDistance: `${u * 100}%`,
                filter: `drop-shadow(0 0 10px ${color})`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </>
  );
};

const Node: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  p: number;
  title: string;
  sub: string;
  color: string;
  children?: React.ReactNode;
}> = ({ x, y, w, h, p, title, sub, color, children }) => (
  <div
    style={{
      position: "absolute",
      left: x - w / 2,
      top: y - h / 2,
      width: w,
      height: h,
      opacity: p,
      transform: `scale(${lerp(0.85, 1, p)})`,
      background: C.card,
      border: `2px solid ${color}`,
      borderRadius: 18,
      padding: "20px 26px",
      boxShadow: `0 0 60px ${color}22`,
    }}
  >
    <div
      style={{
        fontFamily: display,
        fontWeight: 700,
        fontSize: 34,
        color: C.ink,
      }}
    >
      {title}
    </div>
    <div
      style={{ fontFamily: mono, fontSize: 18, color: C.muted, marginTop: 6 }}
    >
      {sub}
    </div>
    {children}
  </div>
);

const Arch: Scene = ({ t, vt }) => {
  const doP = ramp(t, vt(0.03), vt(0.03) + 0.7, out);
  const artP = ramp(t, vt(0.3), vt(0.3) + 0.7, out);
  const visP = ramp(t, vt(0.56), vt(0.56) + 0.6, out);
  const zeroP = ramp(t, vt(0.76), vt(0.76) + 0.6, out);
  const beacon = vt(0.86);
  const judge = vt(0.93);
  const workerP = ramp(t, 0.3, 1.0, out);
  const flash = Math.max(0, 1 - Math.abs(t - judge - 0.4) / 0.6);
  const reqPath = `M${P.visitor.x + 110} ${P.visitor.y - 20} L${P.worker.x - 150} ${P.worker.y - 20}`;
  const backPath = `M${P.worker.x - 150} ${P.worker.y + 20} L${P.visitor.x + 110} ${P.visitor.y + 20}`;
  const doPath = `M${P.worker.x + 60} ${P.worker.y - 80} C${P.worker.x + 120} ${P.dobj.y} ${P.dobj.x - 300} ${P.dobj.y} ${P.dobj.x - 230} ${P.dobj.y}`;
  const artPath = `M${P.worker.x + 60} ${P.worker.y + 80} C${P.worker.x + 120} ${P.art.y} ${P.art.x - 300} ${P.art.y} ${P.art.x - 230} ${P.art.y}`;
  const beaconPath = `M${P.visitor.x} ${P.visitor.y - 90} C${P.visitor.x + 200} 160 ${P.dobj.x - 500} 160 ${P.dobj.x - 230} ${P.dobj.y - 60}`;
  const tiles = AGENTS;
  return (
    <AbsoluteFill>
      <Header n={3} title="Everything runs on Cloudflare" t={t} />
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <g opacity={visP}>
          <path d={reqPath} stroke={C.line} strokeWidth={3} fill="none" />
          <path d={backPath} stroke={C.line} strokeWidth={3} fill="none" />
        </g>
        <path
          d={doPath}
          stroke={C.line}
          strokeWidth={3}
          fill="none"
          opacity={doP}
        />
        <path
          d={artPath}
          stroke={C.line}
          strokeWidth={3}
          fill="none"
          opacity={artP}
        />
        <path
          d={beaconPath}
          stroke={C.mint}
          strokeWidth={2.5}
          strokeDasharray="10 10"
          fill="none"
          opacity={ramp(t, beacon, beacon + 0.5)}
        />
        <Packet
          path={reqPath}
          t={t}
          from={vt(0.58)}
          period={1.6}
          color={C.blue}
        />
        <Packet
          path={doPath}
          t={t}
          from={vt(0.62)}
          period={1.6}
          color={C.blue}
          n={2}
        />
        <Packet
          path={artPath}
          t={t}
          from={vt(0.66)}
          period={1.6}
          color={C.orange}
          n={2}
        />
        <Packet
          path={backPath}
          t={t}
          from={vt(0.7)}
          period={1.6}
          color={C.orange}
        />
        <Packet
          path={beaconPath}
          t={t}
          from={beacon + 0.3}
          period={2.2}
          color={C.mint}
          n={2}
        />
      </svg>
      <Node
        x={P.worker.x}
        y={P.worker.y}
        w={300}
        h={170}
        p={workerP}
        title="Worker"
        sub="picks a fork, serves it"
        color={C.orange}
      />
      <Node
        x={P.dobj.x}
        y={P.dobj.y}
        w={460}
        h={230}
        p={doP}
        title="Durable Object"
        sub="one per arena · SQLite"
        color={C.blue}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: 17,
            color: C.ink,
            marginTop: 16,
            lineHeight: 1.6,
            opacity: 0.85,
          }}
        >
          champion → agent-2
          <br />
          challengers · views · conversions
        </div>
        <div
          style={{
            position: "absolute",
            inset: -2,
            borderRadius: 18,
            border: `3px solid ${C.mint}`,
            opacity: flash,
            boxShadow: `0 0 80px ${C.mint}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 22,
            top: 22,
            fontFamily: mono,
            fontSize: 18,
            color: C.mint,
            opacity: ramp(t, judge, judge + 0.4),
          }}
        >
          judge()
        </div>
      </Node>
      <Node
        x={P.art.x}
        y={P.art.y}
        w={460}
        h={250}
        p={artP}
        title="Artifacts"
        sub="one git repo per fork"
        color={C.orange}
      >
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}
        >
          {tiles.map((a, i) => (
            <div
              key={a}
              style={{
                fontFamily: mono,
                fontSize: 15,
                color: C.ink,
                border: `1px solid ${C.line}`,
                borderRadius: 6,
                padding: "4px 10px",
                opacity: ramp(
                  t,
                  vt(0.3) + 0.3 + i * 0.12,
                  vt(0.3) + 0.6 + i * 0.12,
                ),
              }}
            >
              {a}
            </div>
          ))}
        </div>
      </Node>
      <div
        style={{
          position: "absolute",
          left: P.visitor.x - 90,
          top: P.visitor.y - 90,
          width: 180,
          textAlign: "center",
          opacity: visP,
        }}
      >
        <svg width={120} height={120} viewBox="0 0 100 100">
          <circle cx={50} cy={32} r={18} fill={C.ink} />
          <path d="M14 96 C14 66 86 66 86 96 Z" fill={C.ink} />
        </svg>
        <div style={{ fontFamily: mono, fontSize: 20, color: C.muted }}>
          visitor
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: P.worker.x - 170,
          top: P.worker.y + 110,
          width: 340,
          textAlign: "center",
          opacity: zeroP,
          transform: `scale(${lerp(1.3, 1, zeroP)})`,
        }}
      >
        <span
          style={{
            fontFamily: display,
            fontWeight: 700,
            fontSize: 36,
            color: C.mint,
          }}
        >
          0 deploys
        </span>
        <span style={{ fontFamily: display, fontSize: 30, color: C.muted }}>
          {" "}
          per fork
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ---------------- 04 create ----------------

const Create: Scene = ({ t, vt }) => {
  const cmd = "scripts/new-arena.sh arena-final seed";
  const typed = ramp(t, vt(0.3), vt(0.3) + 1.6, Easing.linear);
  const outP = ramp(t, vt(0.3) + 2.0, vt(0.3) + 2.3);
  const page = ramp(t, vt(0.62), vt(0.62) + 0.9, out);
  const crown = ramp(t, vt(0.9), vt(0.9) + 0.5, Easing.out(Easing.back(2)));
  const cam = lerp(0, -120, ramp(t, vt(0.6), vt(0.6) + 1.5));
  return (
    <AbsoluteFill>
      <Header n={4} title="Live: create an arena" t={t} />
      <AbsoluteFill style={{ transform: `translateX(${cam}px)` }}>
        <Window x={140} y={300} w={980} h={330} title="zsh — forkarena">
          <div
            style={{
              fontFamily: mono,
              fontSize: 24,
              padding: 28,
              lineHeight: 1.7,
              color: C.ink,
            }}
          >
            <span style={{ color: C.mint }}>$ </span>
            <Typed text={cmd} p={typed} />
            <div
              style={{
                opacity: outP,
                color: C.muted,
                fontSize: 21,
                marginTop: 10,
              }}
            >
              arena <span style={{ color: C.ink }}>arena-final</span> live at
              <br />
              forkarena.fordidofour.workers.dev/a/arena-final/
            </div>
          </div>
        </Window>
        <div
          style={{
            position: "absolute",
            left: 1220,
            top: 220,
            opacity: page,
            transform: `translateY(${(1 - page) * 80}px) rotate(${(1 - page) * 3}deg)`,
          }}
        >
          <Window x={0} y={0} w={760} h={560} title="/a/arena-final/">
            <Shot
              src="demo/forks/seed.png"
              w={760}
              h={516}
              style={{ borderRadius: 0 }}
            />
          </Window>
          <div
            style={{
              position: "absolute",
              right: 30,
              top: 70,
              opacity: crown,
              transform: `scale(${crown})`,
            }}
          >
            <Pill status="champion" size={24} />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------- 05 swarm ----------------

const SWARM_OUT = [
  ["agent-2", "9daec7", 12.21],
  ["agent-3", "cef59b", 14.86],
  ["agent-1", "f6a28a", 14.86],
  ["agent-4", "b0952b", 15.74],
  ["agent-5", "e0e2d4", 16.08],
  ["agent-6", "e6c8e6", 17.56],
] as const;

const Swarm: Scene = ({ t, vt }) => {
  const cmdP = ramp(t, vt(0.02), vt(0.02) + 1.3, Easing.linear);
  const ideaAt = [0.37, 0.43, 0.49, 0.54, 0.58, 0.63].map(vt);
  const forkAt = vt(0.2);
  const doneAt = vt(0.8);
  const live = SWARM_OUT.filter(
    ([, , s]) => t > lerp(vt(0.68), doneAt, (s - 12.21) / 5.35),
  ).length;
  return (
    <AbsoluteFill>
      <Header
        n={5}
        title="Live: six agents, six ideas"
        t={t}
        extra={
          <div
            style={{
              fontFamily: mono,
              fontSize: 26,
              color: live === 6 ? C.mint : C.muted,
              marginLeft: 26,
            }}
          >
            {live}/6 forks live · 0 conflicts
          </div>
        }
      />
      <Window x={96} y={200} w={720} h={500} title="zsh — forkarena">
        <div
          style={{
            fontFamily: mono,
            fontSize: 20,
            padding: 24,
            lineHeight: 1.75,
            color: C.ink,
          }}
        >
          <span style={{ color: C.mint }}>$ </span>
          <Typed text="scripts/swarm.sh arena-final ideas.txt" p={cmdP} />
          {SWARM_OUT.map(([a, h, s]) => {
            const at = lerp(vt(0.68), doneAt, (s - 12.21) / 5.35);
            return (
              <div
                key={a}
                style={{ opacity: ramp(t, at, at + 0.15), color: C.muted }}
              >
                <span style={{ color: C.ink }}>{a}</span> → arena-final--{a}-
                <span style={{ color: C.orange }}>{h}</span>
              </div>
            );
          })}
        </div>
      </Window>
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 740,
          width: 720,
          fontFamily: mono,
          fontSize: 19,
          color: C.muted,
          lineHeight: 1.8,
          opacity: ramp(t, vt(0.08), vt(0.08) + 0.6),
        }}
      >
        {[
          "POST /challengers → fork + git token",
          "git clone · claude -p “one idea” · git push",
          "POST /ready → enters the arena",
        ].map((s, i) => (
          <div
            key={i}
            style={{
              opacity: ramp(t, vt(0.1 + i * 0.09), vt(0.1 + i * 0.09) + 0.5),
            }}
          >
            <span style={{ color: C.orange }}>{i + 1}</span> {s}
          </div>
        ))}
      </div>
      {AGENTS.slice(1).map((a, i) => {
        const col = i % 3,
          row = Math.floor(i / 3);
        const fx = 900 + col * 335,
          fy = 230 + row * 330;
        const peel = ramp(t, forkAt + i * 0.12, forkAt + 0.9 + i * 0.12, out);
        const x = lerp(1240, fx, peel),
          y = lerp(560, fy, peel);
        const swap = ramp(t, ideaAt[i], ideaAt[i] + 0.5);
        const glow = Math.max(0, 1 - Math.abs(t - ideaAt[i] - 0.3) / 0.7);
        const n = Number(a.split("-")[1]);
        const landed =
          t >
          lerp(
            vt(0.68),
            doneAt,
            (SWARM_OUT.find((o) => o[0] === a)![2] - 12.21) / 5.35,
          );
        return (
          <div
            key={a}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 310,
              opacity: peel,
            }}
          >
            <div
              style={{
                position: "relative",
                width: 310,
                height: 194,
                borderRadius: 10,
                overflow: "hidden",
                border: `2px solid ${glow > 0.1 ? C.orange : landed ? C.mint : C.line}`,
                boxShadow: `0 0 ${40 * glow}px ${C.orange}`,
              }}
            >
              <Shot
                src="demo/forks/seed.png"
                w={310}
                h={194}
                style={{ position: "absolute", borderRadius: 0 }}
              />
              <Shot
                src={`demo/forks/${a}.png`}
                w={310}
                h={194}
                style={{ position: "absolute", borderRadius: 0, opacity: swap }}
              />
            </div>
            <div
              style={{
                fontFamily: mono,
                fontSize: 17,
                color: C.muted,
                marginTop: 10,
              }}
            >
              agent-{n}
            </div>
            <div
              style={{
                fontFamily: display,
                fontWeight: 500,
                fontSize: 22,
                color: C.ink,
                opacity: swap,
              }}
            >
              {IDEAS[a]}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------------- 06 traffic: rebuilt live dashboard from states.jsonl ----------------

const T0 = 30,
  T1 = 150; // traffic start, last retirement (seconds into the capture)

const Traffic: Scene = ({ t, d }) => {
  const frame = useCurrentFrame();
  const p = ramp(t, 1.2, d - 2.5, Easing.linear);
  const T = lerp(T0, T1, p);
  const s = snap(T),
    prev = snap(T - 4);
  const max = 2000;
  const promoteT = 78;
  const flash = Math.max(0, 1 - Math.abs(T - promoteT - 1) / 4);
  return (
    <AbsoluteFill>
      <Header
        n={8}
        title="Live: traffic picks the winner"
        t={t}
        extra={
          <div
            style={{
              fontFamily: mono,
              fontSize: 28,
              color: C.ink,
              marginLeft: 26,
            }}
          >
            <span style={{ color: C.muted }}>visitors </span>
            {total(s).toLocaleString()}
          </div>
        }
      />
      {AGENTS.map((a, i) => {
        const [views, conv, status] = s.v[a] ?? [0, 0, "challenger"];
        const rate = views ? (conv / views) * 100 : 0;
        const y = 210 + i * 112;
        const flow = Math.max(
          0,
          ((s.v[a]?.[0] ?? 0) - (prev.v[a]?.[0] ?? 0)) / 4,
        );
        const dots = Math.min(10, Math.ceil(flow / 2.5));
        const dead = status === "retired" || status === "dethroned";
        const champ = status === "champion";
        const barW = Math.min(1, views / max) * 760;
        return (
          <div
            key={a}
            style={{
              position: "absolute",
              left: 96,
              top: y,
              width: 1728,
              height: 96,
              opacity: dead ? 0.38 : 1,
              display: "flex",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 150,
                fontFamily: mono,
                fontSize: 24,
                color: C.ink,
              }}
            >
              {a}
            </div>
            <div
              style={{
                width: 380,
                fontFamily: display,
                fontSize: 24,
                color: C.muted,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {IDEAS[a]}
            </div>
            <div style={{ position: "relative", width: 800, height: 34 }}>
              {Array.from({ length: dots }, (_, k) => {
                const u = ((frame / DFPS) * 1.4 + k / dots + i * 0.13) % 1;
                return (
                  <div
                    key={k}
                    style={{
                      position: "absolute",
                      left: -380 + u * (barW + 380),
                      top: 12,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      background: champ ? C.mint : C.blue,
                      opacity: Math.sin(u * Math.PI),
                    }}
                  />
                );
              })}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 4,
                  height: 26,
                  width: barW,
                  borderRadius: 6,
                  background: champ ? C.mint : dead ? C.red : C.blue,
                  boxShadow: champ
                    ? `0 0 ${30 + 60 * flash}px ${C.mint}`
                    : "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: barW + 14,
                  top: 0,
                  fontFamily: mono,
                  fontSize: 22,
                  color: C.ink,
                  whiteSpace: "nowrap",
                }}
              >
                {views.toLocaleString()}{" "}
                <span style={{ color: C.muted }}>views</span>
              </div>
            </div>
            <div
              style={{
                width: 190,
                fontFamily: display,
                fontWeight: 700,
                fontSize: 34,
                color: champ ? C.mint : C.ink,
                textAlign: "right",
              }}
            >
              {rate.toFixed(1)}%
            </div>
            <div style={{ width: 200, textAlign: "right" }}>
              <Pill status={status} />
            </div>
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: 96,
          bottom: 64,
          fontFamily: mono,
          fontSize: 21,
          color: C.muted,
          opacity: ramp(t, 3, 4),
        }}
      >
        Thompson sampling · champion keeps a 20% control share · simulated
        audience, hidden preferences
      </div>
    </AbsoluteFill>
  );
};

// ---------------- 07 judging ----------------

const CODE = [
  "for (const v of challengers) {",
  "  if (v.views < MIN_VIEWS) continue;",
  "  const p = pBetter(v, champ); // 4,000 Beta draws",
  "  if (p > 0.95) promote(v);",
  '  else if (p < 0.05) retire(v, "loses");',
  "  else if (v.views >= MAX_VIEWS)",
  '    retire(v, "no clear edge");',
  "}",
];

const betaPath = (a: number, b: number, w: number, h: number, xmax: number) => {
  const pts: [number, number][] = [];
  let top = -Infinity;
  const lp = (x: number) => (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x);
  for (let i = 1; i <= 200; i++) top = Math.max(top, lp((i / 200) * xmax));
  for (let i = 1; i <= 200; i++) {
    const x = (i / 200) * xmax;
    pts.push([(i / 200) * w, h - Math.exp(lp(x) - top) * h]);
  }
  return (
    `M0 ${h} ` +
    pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") +
    ` L${w} ${h}`
  );
};

const Judge: Scene = ({ t, vt }) => {
  const hl = (() => {
    if (t < vt(0.06)) return -1;
    if (t < vt(0.3)) return 2;
    if (t < vt(0.4)) return 3;
    if (t < vt(0.5)) return 4;
    if (t < vt(0.6)) return 5;
    return -1;
  })();
  const codeP = ramp(t, 0.2, 1.0, out);
  const evid = ramp(t, vt(0.5), vt(0.5) + 1.0, out);
  const curves = ramp(t, vt(0.58), vt(0.58) + 2.0);
  const pCount = ramp(t, vt(0.72), vt(0.72) + 1.6, out);
  const stamp = ramp(
    t,
    vt(0.84),
    vt(0.84) + 0.35,
    Easing.out(Easing.back(2.5)),
  );
  const real = ramp(t, vt(0.92), vt(0.92) + 1.0, out);
  const W = 760,
    H = 230,
    XMAX = 0.12;
  return (
    <AbsoluteFill>
      <Header n={9} title="Live: the judge is 40 lines" t={t} />
      <div style={{ opacity: 1 - real }}>
        <Window
          x={96}
          y={220}
          w={860}
          h={470}
          title="src/select.ts — decide()"
          style={{ opacity: codeP }}
        >
          <div
            style={{
              fontFamily: mono,
              fontSize: 23,
              padding: "22px 0",
              lineHeight: 1.85,
            }}
          >
            {CODE.map((l, i) => {
              const on = hl === i || (hl === 5 && i === 6);
              return (
                <div
                  key={i}
                  style={{
                    padding: "0 28px",
                    whiteSpace: "pre",
                    color: on ? C.ink : C.muted,
                    background: on ? "rgba(246,130,31,0.14)" : "transparent",
                    borderLeft: `4px solid ${on ? C.orange : "transparent"}`,
                  }}
                >
                  {l}
                </div>
              );
            })}
          </div>
        </Window>
        <div
          style={{
            position: "absolute",
            left: 1040,
            top: 220,
            width: 800,
            opacity: evid,
          }}
        >
          <div style={{ display: "flex", gap: 60, fontFamily: display }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 20, color: C.mint }}>
                agent-2 · email-only form
              </div>
              <div style={{ fontWeight: 700, fontSize: 72, color: C.ink }}>
                12<span style={{ color: C.muted, fontSize: 48 }}> / 217</span>
              </div>
            </div>
            <div>
              <div style={{ fontFamily: mono, fontSize: 20, color: C.muted }}>
                seed · champion
              </div>
              <div style={{ fontWeight: 700, fontSize: 72, color: C.muted }}>
                6<span style={{ fontSize: 48 }}> / 252</span>
              </div>
            </div>
          </div>
          <svg width={W} height={H + 40} style={{ marginTop: 20 }}>
            <line x1={0} y1={H} x2={W} y2={H} stroke={C.line} strokeWidth={2} />
            <path
              d={betaPath(7, 247, W, H, XMAX)}
              fill={`${C.muted}33`}
              stroke={C.muted}
              strokeWidth={3}
              strokeDasharray={3000}
              strokeDashoffset={3000 * (1 - curves)}
            />
            <path
              d={betaPath(13, 206, W, H, XMAX)}
              fill={`${C.mint}33`}
              stroke={C.mint}
              strokeWidth={3}
              strokeDasharray={3000}
              strokeDashoffset={3000 * (1 - curves)}
            />
            {[0, 4, 8, 12].map((x) => (
              <text
                key={x}
                x={(x / 100 / XMAX) * W}
                y={H + 30}
                fill={C.muted}
                fontFamily={mono}
                fontSize={18}
                textAnchor="middle"
              >
                {x}%
              </text>
            ))}
          </svg>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 30,
              marginTop: 10,
            }}
          >
            <div
              style={{
                fontFamily: display,
                fontWeight: 700,
                fontSize: 64,
                color: C.ink,
                opacity: pCount,
              }}
            >
              P(better) = {(0.962 * pCount).toFixed(3)}
            </div>
            <div
              style={{
                fontFamily: display,
                fontWeight: 700,
                fontSize: 38,
                color: C.bg,
                background: C.mint,
                padding: "8px 22px",
                borderRadius: 10,
                transform: `scale(${stamp}) rotate(-4deg)`,
                opacity: stamp > 0.01 ? 1 : 0,
              }}
            >
              PROMOTED
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 160,
          top: 190,
          width: 1600,
          height: 820,
          overflow: "hidden",
          borderRadius: 16,
          border: `1px solid ${C.line}`,
          opacity: real,
          transform: `scale(${lerp(0.94, 1, real)})`,
        }}
      >
        <Img
          src={staticFile("demo/dash/002000.png")}
          style={{
            width: 1920 * 1.1,
            position: "absolute",
            left:
              -980 *
              lerp(1, 1.05, ramp(t, vt(0.92), vt(1) + 1.5, Easing.linear)),
            top: -340,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// ---------------- 08 generation 2 ----------------

const Gen2: Scene = ({ t, d, vt }) => {
  const fork = ramp(t, vt(0.06), vt(0.06) + 1.2, out);
  const nums = ramp(t, vt(0.4), vt(0.4) + 0.6);
  const T = lerp(206, 274, ramp(t, vt(0.4), vt(0.85), Easing.linear));
  const s = snap(T);
  const champ = s.v["agent-2"],
    ch = s.v["agent-7"] ?? [0, 0, "challenger"];
  const meter = ramp(t, vt(0.75), vt(0.75) + 1.2, out) * 0.81;
  const cam = lerp(0, -260, ramp(t, 0, vt(0.3)));
  const cards: [string, string, number][] = [
    ["seed", "dethroned", 160],
    ["agent-2", "champion", 700],
    ["agent-7", "challenger", 1240],
  ];
  return (
    <AbsoluteFill>
      <Header n={10} title="Generation 2 forks the new champion" t={t} />
      <AbsoluteFill style={{ transform: `translateX(${cam}px)` }}>
        <svg width={2400} height={1080} style={{ position: "absolute" }}>
          <path d="M620 470 H700" stroke={C.line} strokeWidth={4} />
          <path
            d={`M1160 470 H${lerp(1160, 1240, fork)}`}
            stroke={C.orange}
            strokeWidth={4}
          />
        </svg>
        {cards.map(([a, st, x], i) => {
          const isNew = i === 2;
          const p = isNew ? fork : 1;
          const cx = isNew ? lerp(700, x, p) : x;
          return (
            <div
              key={a}
              style={{
                position: "absolute",
                left: cx,
                top: 250,
                width: 460,
                opacity: isNew ? Math.min(1, p * 2) : i === 0 ? 0.45 : 1,
              }}
            >
              <Shot
                src={`demo/forks/${a}.png`}
                w={460}
                h={288}
                style={{
                  border: `2px solid ${st === "champion" ? C.mint : isNew ? C.blue : C.line}`,
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  marginTop: 16,
                }}
              >
                <span style={{ fontFamily: mono, fontSize: 22, color: C.ink }}>
                  {a}
                </span>
                <Pill status={st} />
              </div>
              <div
                style={{
                  fontFamily: display,
                  fontSize: 24,
                  color: C.muted,
                  marginTop: 8,
                }}
              >
                {IDEAS[a]}
              </div>
              {i > 0 && (
                <div
                  style={{
                    fontFamily: display,
                    fontWeight: 700,
                    fontSize: 52,
                    color: i === 1 ? C.mint : C.blue,
                    marginTop: 14,
                    opacity: nums,
                  }}
                >
                  {(() => {
                    const [v, c] = i === 1 ? champ : ch;
                    return v ? ((c / v) * 100).toFixed(1) : "0.0";
                  })()}
                  %
                  <span
                    style={{
                      fontFamily: mono,
                      fontWeight: 400,
                      fontSize: 20,
                      color: C.muted,
                    }}
                  >
                    {" "}
                    {(i === 1 ? champ : ch)[1]}/
                    {(i === 1 ? champ : ch)[0].toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        <div
          style={{
            position: "absolute",
            left: 1240,
            top: 830,
            width: 640,
            opacity: ramp(t, vt(0.75), vt(0.75) + 0.5),
          }}
        >
          <div
            style={{
              fontFamily: mono,
              fontSize: 20,
              color: C.muted,
              marginBottom: 10,
            }}
          >
            P(better) {meter.toFixed(2)} · promote at 0.95
          </div>
          <div
            style={{
              position: "relative",
              height: 16,
              background: C.line,
              borderRadius: 8,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${meter * 100}%`,
                background: C.blue,
                borderRadius: 8,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "95%",
                top: -8,
                width: 3,
                height: 32,
                background: C.mint,
              }}
            />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------- 09 close ----------------

const Close: Scene = ({ t, vt }) => {
  const logo = ramp(t, 0.2, 1.4, out);
  const cmds = [
    "cf deploy --secrets-file .dev.vars",
    "scripts/new-arena.sh myproduct seed",
    "scripts/swarm.sh myproduct ideas.txt",
  ];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          textAlign: "center",
          transform: `translateY(${lerp(30, -60, ramp(t, vt(0.45), vt(0.45) + 1.2))}px)`,
        }}
      >
        <ForkMark size={110} p={logo} />
        <div
          style={{
            fontFamily: display,
            fontWeight: 700,
            fontSize: 120,
            color: C.ink,
            letterSpacing: -3,
            opacity: logo,
          }}
        >
          Fork Arena
        </div>
        <div
          style={{
            fontFamily: mono,
            fontSize: 32,
            color: C.orange,
            marginTop: 8,
            opacity: ramp(t, vt(0.05), vt(0.05) + 0.6),
          }}
        >
          github.com/hakuyuyu/forkarena · MIT
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 720,
          fontFamily: mono,
          fontSize: 26,
          lineHeight: 1.8,
          color: C.ink,
        }}
      >
        {cmds.map((c, i) => (
          <div
            key={i}
            style={{
              opacity: ramp(t, vt(0.45 + i * 0.1), vt(0.45 + i * 0.1) + 0.5),
            }}
          >
            <span style={{ color: C.mint }}>$ </span>
            {c}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ---------------- 06 agent: one agent, start to finish ----------------

const AGENT_LINES: [string, string, number][] = [
  ["out=$(api challengers '{agent, note}')", "fork the champion · get a git token", 0.12],
  ["git clone https://x:$token@$remote $dir", "its own repo, its own working tree", 0.34],
  ["$AGENT_CMD \"Your one idea: $idea\"", "one idea, nothing else", 0.42],
  ["git commit -am \"$agent: $idea\"", "one readable commit", 0.52],
  ["git push origin HEAD:main", "ship", 0.58],
  ["api challengers/$repo/ready", "enter the arena", 0.64],
];

const AgentRun: Scene = ({ t, vt }) => {
  const at = AGENT_LINES.map(([, , f]) => vt(f));
  const step = at.filter((a) => t > a).length - 1;
  const check = ramp(t, vt(0.7), vt(0.7) + 0.6, out);
  const anyone = ramp(t, vt(0.84), vt(0.84) + 0.8, out);
  const cam = lerp(1, 1.04, ramp(t, 0, vt(1)));
  return (
    <AbsoluteFill>
      <Header n={6} title="Inside one agent" t={t} />
      <AbsoluteFill style={{ transform: `scale(${cam})` }}>
        <Window x={96} y={190} w={1000} h={560} title="scripts/agent.sh">
          <div style={{ fontFamily: mono, fontSize: 21, padding: "26px 0" }}>
            {AGENT_LINES.map(([code, why], i) => {
              const on = i === step;
              const done = i < step;
              const p = ramp(t, at[i] - 0.4, at[i]);
              return (
                <div
                  key={i}
                  style={{
                    position: "relative",
                    padding: "14px 28px 14px 36px",
                    opacity: lerp(0.25, done ? 0.6 : 1, p),
                    background: on ? "rgba(246,130,31,0.10)" : "transparent",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 5,
                      background: C.orange,
                      opacity: on ? 1 : 0,
                    }}
                  />
                  <div style={{ color: C.ink }}>{code}</div>
                  <div
                    style={{
                      color: on ? C.orange : C.muted,
                      fontSize: 17,
                      marginTop: 4,
                    }}
                  >
                    # {why}
                  </div>
                </div>
              );
            })}
          </div>
        </Window>
        <Window
          x={1150}
          y={300}
          w={680}
          h={340}
          title="src/index.ts — Worker"
          style={{
            opacity: ramp(t, at[5], at[5] + 0.5),
            transform: `translateY(${(1 - ramp(t, at[5], at[5] + 0.6, out)) * 40}px)`,
          }}
        >
          <div
            style={{
              fontFamily: mono,
              fontSize: 19,
              padding: 26,
              lineHeight: 1.7,
              color: C.muted,
            }}
          >
            <div>head = log(main)[0].hash</div>
            <div>
              <span style={{ color: C.blue }}>if</span> (head === v.head)
            </div>
            <div style={{ paddingLeft: 28, color: C.red }}>
              409 No new commit on main
            </div>
            <div style={{ color: C.ink }}>setStatus(repo, "challenger")</div>
            <div
              style={{
                marginTop: 22,
                display: "flex",
                alignItems: "center",
                gap: 16,
                opacity: check,
                transform: `scale(${lerp(0.8, 1, check)})`,
                transformOrigin: "left center",
              }}
            >
              <span style={{ color: C.mint, fontSize: 30 }}>✓</span>
              <span style={{ color: C.ink }}>main moved</span>
              <Pill status="challenger" />
            </div>
          </div>
        </Window>
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 830,
          textAlign: "center",
          fontFamily: display,
          fontWeight: 700,
          fontSize: 54,
          color: C.ink,
          opacity: anyone,
          transform: `translateY(${(1 - anyone) * 30}px)`,
        }}
      >
        If it can <span style={{ fontFamily: mono, color: C.orange }}>git push</span>, it can compete.
      </div>
    </AbsoluteFill>
  );
};

// ---------------- 07 diffs: what the agents wrote ----------------

const DIFFS: [string, number, [string, string][]][] = [
  ["agent-1", 0.18, [["-", "<h1>Bookkeeping software that automatically categorizes every transaction for freelancers…</h1>"], ["+", "<h1>Bookkeeping that categorizes itself</h1>"]]],
  ["agent-2", 0.25, [["-", "<label>Name<input name=\"name\" required></label>"], ["-", "<label>Company<input name=\"company\"></label>"], ["-", "<label>Annual revenue<input name=\"revenue\"></label>"]]],
  ["agent-3", 0.33, [["+", "<small>Free, no credit card</small>"]]],
  ["agent-4", 0.4, [["-", "<h1>Bookkeeping software that automatically…</h1>"], ["+", "<h1>Your books done in 10 minutes a week</h1>"]]],
  ["agent-6", 0.47, [["-", "<button>Request early access</button>"], ["+", "<button>Start free today</button>"]]],
  ["agent-5", 0.54, [["+", "<blockquote>“[Paste a real quote from your"], ["+", "  freelance designer customer here.]”"], ["+", "  — [Name], freelance designer</blockquote>"]]],
];

const Diffs: Scene = ({ t, vt }) => {
  const focus = ramp(t, vt(0.62), vt(0.62) + 1, io);
  const human = ramp(t, vt(0.88), vt(0.88) + 0.6, out);
  return (
    <AbsoluteFill>
      <Header
        n={7}
        title="Six forks, six one-commit diffs"
        t={t}
        extra={
          <div
            style={{
              fontFamily: mono,
              fontSize: 26,
              color: C.mint,
              marginLeft: 26,
              opacity: human,
            }}
          >
            0 human reviews
          </div>
        }
      />
      {DIFFS.map(([a, f, lines], i) => {
        const col = i % 2,
          row = Math.floor(i / 2);
        const p = ramp(t, vt(f) - 0.2, vt(f) + 0.5, out);
        const isQuote = a === "agent-5";
        const dim = isQuote ? 1 : lerp(1, 0.3, focus);
        const s = isQuote ? lerp(1, 1.12, focus) : 1;
        return (
          <div
            key={a}
            style={{
              position: "absolute",
              left: 96 + col * 880,
              top: 180 + row * 260,
              width: 848,
              height: 230,
              background: C.card,
              border: `1px solid ${isQuote && focus > 0.1 ? C.orange : C.line}`,
              borderRadius: 14,
              overflow: "hidden",
              opacity: p * dim,
              transform: `translateY(${(1 - p) * 40}px) scale(${s})`,
              transformOrigin: col ? "right center" : "left center",
              zIndex: isQuote ? 2 : 1,
              boxShadow: isQuote
                ? `0 0 ${60 * focus}px rgba(246,130,31,0.35)`
                : "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 16,
                padding: "14px 22px",
                borderBottom: `1px solid ${C.line}`,
                fontFamily: mono,
                fontSize: 18,
                background: "#0a1016",
              }}
            >
              <span style={{ color: C.ink }}>{a}</span>
              <span style={{ color: C.muted }}>index.html</span>
              <span style={{ color: C.orange, marginLeft: "auto" }}>
                {IDEAS[a]}
              </span>
            </div>
            <div style={{ padding: "12px 0", fontFamily: mono, fontSize: 17 }}>
              {lines.map(([sign, code], j) => (
                <div
                  key={j}
                  style={{
                    padding: "5px 22px",
                    background:
                      sign === "+"
                        ? "rgba(124,255,178,0.08)"
                        : "rgba(255,107,90,0.08)",
                    color: sign === "+" ? C.mint : C.red,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    opacity: ramp(t, vt(f) + 0.1 + j * 0.15, vt(f) + 0.4 + j * 0.15),
                  }}
                >
                  {sign} {code}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------------- 11 scale: many agents, one judge ----------------

const LANES = 10;
const TREE: [string, number, number, string][] = [
  ["seed", 1280, 250, "dethroned"],
  ["agent-1", 1130, 420, "retired"],
  ["agent-2", 1290, 420, "champion"],
  ["agent-3", 1450, 420, "retired"],
  ["agent-4", 1610, 420, "retired"],
  ["agent-5", 1770, 420, "retired"],
  ["agent-6", 970, 420, "retired"],
  ["agent-7", 1290, 590, "challenger"],
];
const LOG = [
  "promote agent-2   12/217 beats 6/252, P=0.962",
  "retire  agent-5   3/139 vs 25/434, P=0.046",
  "retire  agent-6   4/154 vs 37/600, P=0.048",
  "retire  agent-1   1/100 vs 41/664, P=0.014",
  "retire  agent-3   13/376 vs 90/1627, P=0.050",
  "fork    agent-7   from agent-2",
];

const Scale: Scene = ({ t, vt }) => {
  const lanes = ramp(t, vt(0.05), vt(0.25), out);
  const doIn = ramp(t, vt(0.3), vt(0.3) + 0.8, out);
  const serial = ramp(t, vt(0.4), vt(0.58), Easing.linear);
  const tree = ramp(t, vt(0.58), vt(0.58) + 1, out);
  const vs = ramp(t, vt(0.66), vt(0.66) + 0.8, out);
  const log = ramp(t, vt(0.76), vt(0.76) + 0.8, out);
  const DX = 640,
    DY = 560;
  return (
    <AbsoluteFill>
      <Header n={11} title="Many agents, one judge" t={t} />
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        {Array.from({ length: LANES }, (_, i) => {
          const y = 210 + i * 76;
          return (
            <path
              key={i}
              d={`M300 ${y} C 470 ${y}, 470 ${DY}, ${DX - 90} ${DY}`}
              stroke={C.line}
              strokeWidth={2.5}
              fill="none"
              opacity={doIn}
            />
          );
        })}
      </svg>
      {Array.from({ length: LANES }, (_, i) => {
        const y = 210 + i * 76;
        const p = ramp(t, vt(0.05) + i * 0.12, vt(0.05) + i * 0.12 + 0.5, out);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 96,
              top: y - 26,
              display: "flex",
              alignItems: "center",
              gap: 14,
              opacity: p * lanes,
              transform: `translateX(${(1 - p) * -40}px)`,
              fontFamily: mono,
              fontSize: 17,
              color: C.muted,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                border: `2px solid ${C.blue}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.ink,
              }}
            >
              {i + 1}
            </div>
            <div
              style={{
                width: 120,
                height: 38,
                borderRadius: 8,
                background: C.card,
                border: `1px solid ${C.line}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              repo-{i + 1}
            </div>
          </div>
        );
      })}
      {/* requests reach the Durable Object one at a time */}
      {Array.from({ length: 14 }, (_, k) => {
        const start = k / 14;
        const q = Math.min(1, Math.max(0, (serial - start) * 6));
        if (q <= 0 || q >= 1) return null;
        const i = k % LANES;
        const y0 = 210 + i * 76;
        const x = lerp(300, DX - 90, q);
        const y = lerp(y0, DY, io(q));
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              left: x - 8,
              top: y - 8,
              width: 16,
              height: 16,
              borderRadius: 8,
              background: C.orange,
              boxShadow: `0 0 18px ${C.orange}`,
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          left: DX - 90,
          top: DY - 110,
          width: 260,
          height: 220,
          borderRadius: 22,
          background: C.card,
          border: `2px solid ${C.orange}`,
          boxShadow: `0 0 ${80 * doIn}px rgba(246,130,31,0.35)`,
          opacity: doIn,
          transform: `scale(${lerp(0.8, 1, doIn)})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          fontFamily: mono,
        }}
      >
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 30, color: C.ink }}>
          Durable Object
        </div>
        <div style={{ fontSize: 18, color: C.muted }}>single-threaded</div>
        <div style={{ fontSize: 18, color: C.muted }}>sync SQLite judge</div>
        <div style={{ fontSize: 20, color: C.mint, opacity: ramp(t, vt(0.5), vt(0.5) + 0.5) }}>
          no races
        </div>
      </div>
      {/* lineage */}
      <svg
        width={1920}
        height={1080}
        style={{ position: "absolute", opacity: tree }}
      >
        {TREE.slice(1).map(([a, x, y]) => {
          const [px, py] = a === "agent-7" ? [1290, 420] : [1280, 250];
          return (
            <path
              key={a}
              d={`M${px + 60} ${py + 40} C ${px + 60} ${(py + y) / 2 + 20}, ${x + 60} ${(py + y) / 2 + 20}, ${x + 60} ${y}`}
              stroke={C.line}
              strokeWidth={2.5}
              fill="none"
            />
          );
        })}
        <path
          d="M1510 450 C 1480 520, 1400 520, 1385 452"
          stroke={C.orange}
          strokeWidth={3}
          strokeDasharray="8 8"
          fill="none"
          opacity={vs}
        />
      </svg>
      {TREE.map(([a, x, y, st]) => (
        <div
          key={a}
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: 120,
            height: 40,
            borderRadius: 8,
            background: C.card,
            border: `2px solid ${st === "champion" ? C.mint : st === "challenger" ? C.blue : C.line}`,
            fontFamily: mono,
            fontSize: 17,
            color: st === "retired" || st === "dethroned" ? C.muted : C.ink,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: tree,
            transform: `translateY(${(1 - tree) * 20}px)`,
          }}
        >
          {a}
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          left: 1370,
          top: 520,
          fontFamily: mono,
          fontSize: 17,
          color: C.orange,
          opacity: vs,
        }}
      >
        judged vs today's champion
      </div>
      <Window
        x={960}
        y={700}
        w={870}
        h={300}
        title="arena log"
        style={{ opacity: log, transform: `translateY(${(1 - log) * 40}px)` }}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: 18,
            padding: "16px 24px",
            lineHeight: 1.75,
            whiteSpace: "pre",
          }}
        >
          {LOG.map((l, i) => (
            <div
              key={i}
              style={{
                color: l.startsWith("promote") ? C.mint : l.startsWith("fork") ? C.blue : C.muted,
                opacity: ramp(t, vt(0.78 + i * 0.03), vt(0.78 + i * 0.03) + 0.3),
              }}
            >
              {l}
            </div>
          ))}
        </div>
      </Window>
    </AbsoluteFill>
  );
};

// ---------------- 12 run: run it yourself ----------------

const RUN: [string, number][] = [
  ["npm install", 0.22],
  ["printf 'ADMIN_TOKEN=…\\nAGENT_TOKEN=…' > .dev.vars", 0.3],
  ["cf deploy --secrets-file .dev.vars", 0.4],
  ["scripts/new-arena.sh tallybook seed", 0.52],
  ["scripts/swarm.sh tallybook ideas.txt", 0.64],
  ["node scripts/simulate.mjs tallybook 2000", 0.8],
  ["open \"$FA_URL/?arena=tallybook\"", 0.9],
];

const Run: Scene = ({ t, vt }) => {
  const dash = ramp(t, vt(0.92), vt(0.92) + 1.2, out);
  return (
    <AbsoluteFill>
      <Header n={12} title="Run it yourself" t={t} />
      <Window
        x={96}
        y={190}
        w={1100}
        h={640}
        title="zsh — forkarena"
        style={{
          transform: `translateX(${lerp(0, -40, dash)}px) scale(${lerp(1, 0.92, dash)})`,
          transformOrigin: "left top",
          opacity: lerp(1, 0.55, dash),
        }}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: 21,
            padding: 26,
            lineHeight: 1.65,
          }}
        >
          {RUN.map(([c, f], i) => {
            const p = ramp(t, vt(f), vt(f) + 0.9, Easing.linear);
            if (p <= 0) return null;
            return (
              <div key={i} style={{ marginBottom: 6 }}>
                <span style={{ color: C.mint }}>$ </span>
                <Typed text={c} p={p} />
              </div>
            );
          })}
        </div>
      </Window>
      <div
        style={{
          position: "absolute",
          left: 760,
          top: 300,
          width: 1060,
          height: 596,
          borderRadius: 14,
          overflow: "hidden",
          border: `1px solid ${C.line}`,
          boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
          opacity: dash,
          transform: `translateY(${(1 - dash) * 80}px) rotate(${(1 - dash) * 2}deg)`,
        }}
      >
        <Img
          src={staticFile("demo/dash/002000.png")}
          style={{ width: 1060, height: 596, display: "block" }}
        />
      </div>
    </AbsoluteFill>
  );
};

const SCENES: Record<ChapterId, Scene> = {
  hook: Hook,
  idea: Idea,
  arch: Arch,
  create: Create,
  swarm: Swarm,
  agent: AgentRun,
  diffs: Diffs,
  traffic: Traffic,
  judge: Judge,
  gen2: Gen2,
  scale: Scale,
  run: Run,
  close: Close,
};

export const Demo: React.FC = () => {
  const frame = useCurrentFrame();
  const now = frame / DFPS;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 700px at 70% 30%, #0f1a24 0%, ${C.bg} 70%)`,
        }}
      />
      {CH.map((c, i) => {
        const S = SCENES[c.id];
        const t = now - c.start;
        if (t < -0.5 || t > c.dur + 0.5) return null;
        const fadeIn = i === 0 ? 1 : ramp(t, -0.25, 0.35);
        const fadeOut =
          i === CH.length - 1 ? 1 : 1 - ramp(t, c.dur - 0.35, c.dur + 0.25);
        const vt = (f: number) => LEAD + f * c.voLen;
        return (
          <AbsoluteFill
            key={c.id}
            style={{ opacity: Math.min(fadeIn, fadeOut) }}
          >
            <S t={t} d={c.dur} v={(t - LEAD) / c.voLen} vt={vt} />
          </AbsoluteFill>
        );
      })}
      <Sequence from={0}>
        <Audio src={staticFile("demo-vo/mix.wav")} />
      </Sequence>
    </AbsoluteFill>
  );
};
