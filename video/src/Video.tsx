import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  staticFile,
  useCurrentFrame,
  interpolate,
  Easing,
  random,
  spring,
} from "remotion";
import { loadFont as loadGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { CUES, FPS, BEAT, PREROLL, at } from "./cues";

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
  gray: "#3a444d",
  mint: "#7cffb2",
  card: "#0d131a",
  cardLine: "#1f2a35",
};
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const io = Easing.inOut(Easing.cubic);
const ramp = (t: number, a: number, b: number, easing = io) =>
  a === Infinity ? 0 : interpolate(t, [a, b], [0, 1], { ...clamp, easing });
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const mixHex = (a: string, b: string, p: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], p))).join(",")})`;
};

// ---------- the arena layout (world coords = screen coords at scale 1) ----------
const ROUTER = { x: 440, y: 540 };
const NODE_X = 1340;
const LANES = [
  "agent-1",
  "agent-2",
  "agent-3",
  "main",
  "agent-4",
  "agent-5",
  "agent-6",
];
const MAIN = 3,
  WINNER = 2;
const laneY = (i: number) => 540 + (i - 3) * 112;
const FORK_ORDER = [2, 4, 1, 5, 0, 6];
const RETIRE_ORDER = [5, 0, 6, 1];
const born = (i: number) =>
  i === MAIN ? CUES.collapse : CUES.forks[FORK_ORDER.indexOf(i)];
const retiredAt = (i: number) => {
  const k = RETIRE_ORDER.indexOf(i);
  return k < 0 ? Infinity : CUES.retire[k];
};
const isChamp = (i: number, t: number) =>
  t < CUES.promote ? i === MAIN : i === WINNER;
const IMPACTS = [
  CUES.collapse,
  CUES.traffic,
  ...CUES.retire,
  CUES.promote,
  CUES.payoff,
  CUES.end,
];

const bez = (y: number, u: number) => {
  const m = 1 - u,
    p = [
      [ROUTER.x, 540],
      [760, 540],
      [1000, y],
      [NODE_X, y],
    ];
  const k = [m * m * m, 3 * m * m * u, 3 * m * u * u, u * u * u];
  return [0, 1].map((d) => k.reduce((s, kk, j) => s + kk * p[j][d], 0));
};
const pathD = (y: number) =>
  `M${ROUTER.x} 540 C760 540 1000 ${y} ${NODE_X} ${y}`;

const nodeY = (i: number, t: number) => {
  if (i === MAIN) return 540;
  const s = spring({
    frame: Math.max(0, (t - born(i)) * FPS),
    fps: FPS,
    config: { damping: 11, stiffness: 140, mass: 0.8 },
  });
  return lerp(540, laneY(i), s);
};

// Thompson sampling, visualized: each fork's share of new visitors drifts toward the one that converts.
const weight = (i: number, t: number) => {
  if (t < born(i) || t >= retiredAt(i)) return 0;
  const p = ramp(t, CUES.traffic, CUES.promote, Easing.linear);
  const post = ramp(t, CUES.promote, CUES.promote + 4 * BEAT);
  const before =
    i === WINNER
      ? 1 + 5 * p ** 1.5
      : i === MAIN
        ? 1 - 0.3 * p
        : i === 4
          ? 1 + 1.2 * p
          : 1 - 0.5 * p;
  const after = i === WINNER ? 8 : i === MAIN ? 0.4 : i === 4 ? 1.2 : 0;
  return lerp(before, after, post);
};
const shares = (t: number) => {
  const w = LANES.map((_, i) => weight(i, t));
  const s = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((v) => v / s);
};

const RATE = 34,
  ENTRY = 0.5,
  RIDE = 0.8;
const VIS_CONV = [0.05, 0.05, 0.3, 0.07, 0.15, 0.04, 0.05];
type Visitor = {
  spawn: number;
  arm: number;
  conv: boolean;
  jy: number;
  arrive: number;
};
const useVisitors = () =>
  useMemo(() => {
    const out: Visitor[] = [];
    for (let k = 0; ; k++) {
      const spawn = CUES.traffic - ENTRY + k / RATE;
      if (spawn > CUES.payoff - 1) break;
      const sh = shares(spawn + ENTRY);
      let r = random(`arm${k}`),
        arm = 0;
      while (arm < 6 && r > sh[arm]) {
        r -= sh[arm];
        arm++;
      }
      out.push({
        spawn,
        arm,
        conv: random(`cv${k}`) < VIS_CONV[arm],
        jy: (random(`y${k}`) - 0.5) * 700,
        arrive: spawn + ENTRY + RIDE,
      });
    }
    return out;
  }, []);

// ---------- scene A: the PR queue ----------
const COLS = 26,
  ROWS = 39,
  CW = 150,
  CH = 40,
  GAP = 12;
const WALL_W = COLS * (CW + GAP),
  WALL_H = ROWS * (CH + GAP);
const useWall = () =>
  useMemo(() => {
    const cells = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const x = c * (CW + GAP) - WALL_W / 2 + CW / 2,
          y = r * (CH + GAP) - WALL_H / 2 + CH / 2;
        cells.push({
          x,
          y,
          d: Math.hypot(x, y * 1.6) + random(`d${r}-${c}`) * 140,
        });
      }
    return cells
      .sort((a, b) => a.d - b.d)
      .slice(0, 1000)
      .map((c, k) => ({
        ...c,
        k,
        appear: at(0.25) + 3.1 * (k / 999) ** 0.6,
        leave: at(7) + 0.35 * random(`l${k}`),
      }));
  }, []);

const Wall: React.FC<{ t: number }> = ({ t }) => {
  const cells = useWall();
  const s = interpolate(t, [at(0), at(7)], [2.4, 0.45], {
    ...clamp,
    easing: Easing.inOut(Easing.quad),
  });
  const visible = cells.filter((c) => t >= c.appear).length;
  return (
    <g>
      {cells.map((c) => {
        if (t < c.appear) return null;
        const pop = ramp(
          t,
          c.appear,
          c.appear + 0.18,
          Easing.out(Easing.back(2)),
        );
        const u = ramp(t, c.leave, CUES.collapse, Easing.in(Easing.cubic));
        const sx = 960 + c.x * s,
          sy = 540 + c.y * s;
        const x = lerp(sx, 960, u),
          y = lerp(sy, 540, u);
        const w = lerp(CW * s * pop, 6, u),
          h = lerp(CH * s * pop, 6, u);
        if (u >= 1) return null;
        return (
          <g
            key={c.k}
            transform={`translate(${x} ${y})`}
            opacity={lerp(1, 0.9, u)}
          >
            <rect
              x={-w / 2}
              y={-h / 2}
              width={w}
              height={h}
              rx={lerp(6 * s, 3, u)}
              fill={mixHex(C.card, C.orange, u)}
              stroke={u > 0 ? C.orange : mixHex(C.cardLine, "#4d6275", 1 - ramp(s, 0.3, 1.2))}
              strokeWidth={Math.max(1, 1.5 * s * (1 - u))}
            />
            {u === 0 && s > 0.6 && (
              <>
                <circle cx={-w / 2 + 14 * s} cy={0} r={4 * s} fill="#3fb950" />
                <text
                  x={-w / 2 + 26 * s}
                  y={5 * s}
                  fontFamily={mono}
                  fontSize={14 * s}
                  fill={C.muted}
                >
                  #{1000 + c.k} agent-{c.k + 1}
                </text>
              </>
            )}
          </g>
        );
      })}
      <Header
        t={t}
        from={at(0)}
        to={at(7.5)}
        text="Every agent opens a pull request"
        counter={`${visible.toLocaleString()} awaiting review`}
      />
    </g>
  );
};

// ---------- scenes B–D: the arena ----------
const treeCam = (t: number) => {
  const T = [CUES.collapse, at(13), CUES.traffic, at(30.5), CUES.promote, at(35.5), at(39), CUES.payoff];
  const o = { easing: io, ...clamp };
  return {
    s: interpolate(t, T, [1.7, 1.12, 1.12, 1.25, 1.42, 1.15, 1.2, 9], o),
    cx: interpolate(t, T, [NODE_X, 900, 900, 1010, 1260, 1000, 1060, NODE_X], o),
    cy: interpolate(t, T, [540, 520, 520, 480, laneY(WINNER), 520, 500, laneY(WINNER)], o),
  };
};

const Crown: React.FC<{ x: number; y: number; rot: number; glow: number }> = ({
  x,
  y,
  rot,
  glow,
}) => (
  <g transform={`translate(${x} ${y}) rotate(${rot})`} filter="url(#glow)">
    <path
      d="M-20 10 L-24 -12 L-10 0 L0 -18 L10 0 L24 -12 L20 10 Z"
      fill={C.orange}
      stroke="#ffd2a6"
      strokeWidth={1.5}
      opacity={0.85 + 0.15 * glow}
    />
  </g>
);

const Arena: React.FC<{ t: number }> = ({ t }) => {
  const visitors = useVisitors();
  const sh = shares(t);
  const routerIn = ramp(
    t,
    CUES.collapse,
    CUES.collapse + 0.6,
    Easing.out(Easing.back(1.6)),
  );
  const mainDraw = ramp(t, CUES.collapse + 0.1, at(9.5));
  const flip = ramp(t, CUES.promote - 0.04, CUES.promote + 0.12);

  // crown: rests on main, lifts on the anticipation beat, lands on agent-3 on the promote hit
  const cu = ramp(t, at(31), CUES.promote, Easing.inOut(Easing.cubic));
  const crownX = NODE_X + 150 * Math.sin(Math.PI * cu);
  const crownY =
    lerp(540, laneY(WINNER), cu) - 52 - 60 * Math.sin(Math.PI * cu);
  const crownIn = spring({
    frame: Math.max(0, (t - CUES.collapse) * FPS),
    fps: FPS,
    config: { damping: 9 },
  });

  const convCount = (i: number) =>
    visitors.filter((v) => v.arm === i && v.conv && v.arrive <= t).length;

  return (
    <g>
      {/* lanes */}
      {LANES.map((name, i) => {
        if (t < born(i)) return null;
        const y = nodeY(i, t);
        const draw = i === MAIN ? mainDraw : ramp(t, born(i), born(i) + 0.4);
        const retired = ramp(t, retiredAt(i), retiredAt(i) + 0.3);
        const champ = i === WINNER ? flip : i === MAIN ? 1 - flip : 0;
        const col =
          retired > 0
            ? mixHex(C.blue, C.gray, retired)
            : mixHex(
                i === MAIN && flip > 0.5 ? C.gray : C.blue,
                C.orange,
                champ,
              );
        const width =
          2 + 22 * (t >= CUES.traffic - 0.2 ? sh[i] : i === MAIN ? 0.4 : 0.1);
        return (
          <path
            key={name}
            d={pathD(y)}
            fill="none"
            stroke={col}
            strokeWidth={width}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={1 - draw}
            opacity={lerp(i === MAIN || champ > 0 ? 0.9 : 0.55, 0.18, retired)}
            filter={champ > 0.5 ? "url(#glow)" : undefined}
          />
        );
      })}

      {/* visitors */}
      {visitors.map((v, k) => {
        if (t < v.spawn || t > v.arrive + 0.6) return null;
        const els = [];
        if (t <= v.arrive) {
          let x, y;
          if (t < v.spawn + ENTRY) {
            const u = (t - v.spawn) / ENTRY;
            x = lerp(-40, ROUTER.x, u);
            y = lerp(540 + v.jy, 540, Easing.out(Easing.quad)(u));
          } else {
            [x, y] = bez(nodeY(v.arm, t), (t - v.spawn - ENTRY) / RIDE);
          }
          els.push(
            <circle
              key="p"
              cx={x}
              cy={y}
              r={4.5}
              fill={isChamp(v.arm, t) ? "#ffd2a6" : "#cfe6ff"}
              opacity={0.9}
            />,
          );
        } else if (v.conv) {
          const u = (t - v.arrive) / 0.6;
          els.push(
            <circle
              key="s"
              cx={NODE_X}
              cy={nodeY(v.arm, t)}
              r={22 + 46 * Easing.out(Easing.cubic)(u)}
              fill="none"
              stroke={C.mint}
              strokeWidth={3 * (1 - u)}
              opacity={1 - u}
            />,
          );
        }
        return <g key={k}>{els}</g>;
      })}

      {/* router: the arena's Durable Object */}
      <g transform={`translate(${ROUTER.x} ${ROUTER.y}) scale(${routerIn})`}>
        <rect
          x={-34}
          y={-34}
          width={68}
          height={68}
          rx={14}
          fill={C.card}
          stroke={C.ink}
          strokeOpacity={0.5}
          strokeWidth={2}
          transform="rotate(45)"
        />
        <circle
          r={8 + 3 * Math.sin(t * Math.PI * 4)}
          fill={C.ink}
          opacity={0.85}
          filter="url(#glow)"
        />
      </g>

      {/* nodes */}
      {LANES.map((name, i) => {
        if (t < born(i)) return null;
        const y = nodeY(i, t);
        const pop = spring({
          frame: Math.max(0, (t - born(i)) * FPS),
          fps: FPS,
          config: { damping: 10, stiffness: 160 },
        });
        const retired = ramp(t, retiredAt(i), retiredAt(i) + 0.3);
        const champ = i === WINNER ? flip : i === MAIN ? 1 - flip : 0;
        const col =
          retired > 0
            ? mixHex(C.blue, C.gray, retired)
            : mixHex(
                i === MAIN && flip > 0.5 ? C.gray : C.blue,
                C.orange,
                champ,
              );
        const hit =
          i === WINNER
            ? Math.exp(-Math.max(0, t - CUES.promote) * 5) *
              (t >= CUES.promote ? 1 : 0)
            : 0;
        const cc = convCount(i);
        return (
          <g key={name} transform={`translate(${NODE_X} ${y})`}>
            {hit > 0.01 && (
              <circle
                r={30 + 260 * (1 - hit)}
                fill="none"
                stroke={C.orange}
                strokeWidth={8 * hit}
                opacity={hit}
              />
            )}
            <circle
              r={(champ > 0.5 ? 24 : 17) * pop * (1 - 0.3 * retired)}
              fill={col}
              filter={retired < 1 ? "url(#glow)" : undefined}
            />
            <text
              x={44}
              y={-2}
              fontFamily={mono}
              fontSize={32}
              fontWeight={700}
              fill={retired > 0.5 ? "#4a555e" : C.ink}
              opacity={pop}
            >
              {name}
            </text>
            <text
              x={44}
              y={36}
              fontFamily={mono}
              fontSize={25}
              fill={
                retired > 0.5 ? "#4a555e" : champ > 0.5 ? C.orange : C.muted
              }
              opacity={pop}
            >
              {retired > 0.5
                ? "retired"
                : t >= CUES.traffic
                  ? `${cc} signups`
                  : i === MAIN
                    ? "champion"
                    : "fork of main"}
            </text>
            {retired > 0 && (
              <line
                x1={-24}
                y1={0}
                x2={-24 + 48 * retired}
                y2={0}
                stroke="#4a555e"
                strokeWidth={4}
                transform="rotate(-35)"
              />
            )}
          </g>
        );
      })}

      {t >= CUES.collapse && (
        <Crown x={crownX} y={crownY} rot={360 * cu} glow={crownIn} />
      )}

    </g>
  );
};

// The arena's headers sit flat on screen while the camera moves underneath.
const ArenaHeaders: React.FC<{ t: number }> = ({ t }) => {
  const shown = Math.round(
    4000 * ramp(t, CUES.traffic, CUES.promote, Easing.linear),
  );
  const forks = CUES.forks.filter((f) => t >= f).length;
  return (
    <g>
      <Header
        t={t}
        from={CUES.collapse}
        to={CUES.traffic - 0.15}
        text="Agents fork the champion"
        counter={`${forks} forks · 0 merges`}
      />
      <Header
        t={t}
        from={CUES.traffic}
        to={at(31.2)}
        text="Live traffic picks the winner"
        counter={`${shown.toLocaleString()} visitors`}
      />
      <Header
        t={t}
        from={CUES.promote}
        to={at(35.3)}
        text="agent-3 takes the crown"
        counter="95.6% likely better"
      />
      <Header
        t={t}
        from={at(35.5)}
        to={at(39.4)}
        text="Swapped, not merged"
        counter="main → agent-3"
      />
    </g>
  );
};

// ---------- scene E: payoff ----------
const Payoff: React.FC<{ t: number }> = ({ t }) => {
  const p0 = CUES.payoff;
  const grow = (d: number) =>
    spring({
      frame: Math.max(0, (t - p0 - d) * FPS),
      fps: FPS,
      config: { damping: 14, stiffness: 70 },
    });
  const bars = [
    { name: "seed", v: 2.4, x: 700, col: C.gray, g: grow(0.15) },
    { name: "agent-3", v: 6.1, x: 1060, col: C.orange, g: grow(0.4) },
  ];
  const big = spring({
    frame: Math.max(0, (t - at(44)) * FPS),
    fps: FPS,
    config: { damping: 8, stiffness: 120 },
  });
  const out = ramp(t, CUES.end - 0.35, CUES.end);
  const push = 1 + 0.05 * ramp(t, p0, CUES.end, Easing.linear);
  return (
    <g opacity={1 - out} transform={`translate(1010 600) scale(${push}) translate(-1010 ${-600 - 60 * out})`}>
      {bars.map((b) => {
        const h = 560 * (b.v / 6.1) * b.g;
        return (
          <g key={b.name}>
            <rect
              x={b.x}
              y={880 - h}
              width={220}
              height={h}
              rx={10}
              fill={b.col}
              filter={b.name === "seed" ? undefined : "url(#glow)"}
            />
            <text
              x={b.x + 110}
              y={860 - h}
              textAnchor="middle"
              fontFamily={display}
              fontWeight={700}
              fontSize={72}
              fill={C.ink}
              opacity={ramp(b.g, 0.6, 1)}
            >
              {b.v.toFixed(1)}%
            </text>
            <text
              x={b.x + 110}
              y={930}
              textAnchor="middle"
              fontFamily={mono}
              fontSize={28}
              fill={C.muted}
            >
              {b.name}
            </text>
          </g>
        );
      })}
      <line
        x1={620}
        y1={880}
        x2={1360}
        y2={880}
        stroke={C.cardLine}
        strokeWidth={3}
      />
      <g
        transform={`translate(1600 560) scale(${big})`}
        opacity={Math.min(1, big)}
      >
        <text
          textAnchor="middle"
          y={60}
          fontFamily={display}
          fontWeight={700}
          fontSize={220}
          fill={C.orange}
          filter="url(#glow)"
        >
          2.5×
        </text>
        <text
          textAnchor="middle"
          y={130}
          fontFamily={mono}
          fontSize={30}
          fill={C.ink}
        >
          more signups
        </text>
      </g>
      <Header
        t={t}
        from={p0}
        to={CUES.end - 0.3}
        text="Demo arena · 4,000 simulated visitors"
        counter="signup rate"
      />
    </g>
  );
};

// ---------- scene F: end card (also the pre-roll thumbnail and key art) ----------
const Logo: React.FC<{ p: number; x: number; y: number; s: number }> = ({
  p,
  x,
  y,
  s,
}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {[-1, 0, 1].map((d, j) => {
      const draw = Math.min(1, Math.max(0, p * 3 - j * 0.4));
      return (
        <path
          key={d}
          d={`M0 0 C40 0 50 ${d * 60} 100 ${d * 60}`}
          fill="none"
          stroke={d === 0 ? C.orange : C.blue}
          strokeWidth={9}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - draw}
          opacity={d === 0 ? 1 : 0.7}
        />
      );
    })}
    {[-1, 0, 1].map((d, j) => (
      <circle
        key={d}
        cx={100}
        cy={d * 60}
        r={15 * Math.min(1, Math.max(0, p * 3 - j * 0.4 - 0.6) * 2.5)}
        fill={d === 0 ? C.orange : C.blue}
        filter="url(#glow)"
      />
    ))}
    <rect
      x={-17}
      y={-17}
      width={34}
      height={34}
      rx={7}
      fill={C.ink}
      transform={`rotate(45) scale(${Math.min(1, p * 4)})`}
    />
  </g>
);

const EndCard: React.FC<{ t: number; t0: number }> = ({ t, t0 }) => {
  const p = (d: number, len = 0.5) =>
    ramp(t, t0 + d, t0 + d + len, Easing.out(Easing.cubic));
  const rise = (d: number) => ({
    opacity: p(d),
    transform: `translate(0 ${30 * (1 - p(d))})`,
  });
  const push = 1 + 0.04 * ramp(t, t0, t0 + 5, Easing.out(Easing.quad));
  return (
    <g transform={`translate(960 560) scale(${push}) translate(-1190 -560)`}>
      <Logo p={p(0, 0.9)} x={600} y={430} s={1.5} />
      <text
        x={830}
        y={470}
        fontFamily={display}
        fontWeight={700}
        fontSize={150}
        fill={C.ink}
        letterSpacing={-4}
        {...rise(0.25)}
      >
        Fork Arena
      </text>
      <text
        x={600}
        y={640}
        fontFamily={display}
        fontWeight={500}
        fontSize={46}
        fill="#aeb9c2"
        {...rise(0.6)}
      >
        Git for thousands of agents, where nothing gets merged.
      </text>
      <g {...rise(1.1)}>
        <text x={600} y={770} fontFamily={mono} fontSize={42} fill={C.orange}>
          github.com/hakuyuyu/forkarena
        </text>
        <text x={600} y={836} fontFamily={mono} fontSize={30} fill={C.muted}>
          Built on Cloudflare Artifacts
        </text>
      </g>
    </g>
  );
};

// ---------- shared pieces ----------
const Header: React.FC<{
  t: number;
  from: number;
  to: number;
  text: string;
  counter?: string;
}> = ({ t, from, to, text, counter }) => {
  if (t < from || t > to + 0.4) return null;
  const words = text.split(" ");
  const out = ramp(t, to, to + 0.3, Easing.in(Easing.cubic));
  return (
    <g>
      <rect width={1920} height={230} fill="url(#scrim)" opacity={1 - out} />
      <foreignObject x={0} y={60} width={1500} height={110}>
        <div style={{ display: "flex", gap: 18, paddingLeft: 96, paddingTop: 12, overflow: "hidden", height: 110, fontFamily: display, fontWeight: 700, fontSize: 64, color: C.ink, whiteSpace: "nowrap" }}>
          {words.map((w, i) => {
            const u = ramp(t, from + i * 0.05, from + i * 0.05 + 0.4, Easing.out(Easing.cubic));
            return (
              <span key={i} style={{ display: "inline-block", transform: `translateY(${90 * (1 - u) - 90 * out}px)` }}>
                {w}
              </span>
            );
          })}
        </div>
      </foreignObject>
      {counter && (
        <text
          x={1824}
          y={128}
          textAnchor="end"
          fontFamily={mono}
          fontSize={30}
          fill={C.orange}
          opacity={ramp(t, from + 0.2, from + 0.5) * (1 - out)}
        >
          {counter}
        </text>
      )}
    </g>
  );
};

const Defs = () => (
  <defs>
    <filter id="glow" filterUnits="userSpaceOnUse" x="-4000" y="-4000" width="12000" height="12000">
      <feGaussianBlur stdDeviation="9" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={C.bg} stopOpacity="0.95" />
      <stop offset="100%" stopColor={C.bg} stopOpacity="0" />
    </linearGradient>
    <radialGradient id="vig" cx="50%" cy="50%" r="75%">
      <stop offset="55%" stopColor="#000" stopOpacity="0" />
      <stop offset="100%" stopColor="#000" stopOpacity="0.75" />
    </radialGradient>
    <radialGradient id="haze" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stopColor={C.orange} stopOpacity="0.16" />
      <stop offset="100%" stopColor={C.orange} stopOpacity="0" />
    </radialGradient>
    <pattern id="dots" width="48" height="48" patternUnits="userSpaceOnUse">
      <circle cx="24" cy="24" r="1.4" fill="#1a232c" />
    </pattern>
    <filter id="grain">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.9"
        numOctaves="2"
        seed="1"
      />
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
    </filter>
  </defs>
);

const Backdrop: React.FC<{
  t: number;
  px: number;
  py: number;
  hazeX: number;
  hazeY: number;
}> = ({ t, px, py, hazeX, hazeY }) => (
  <g>
    <rect width={1920} height={1080} fill={C.bg} />
    <rect
      x={-200 + (px % 48)}
      y={-200 + (py % 48)}
      width={2400}
      height={1500}
      fill="url(#dots)"
    />
    <circle
      cx={hazeX}
      cy={hazeY}
      r={700 + 40 * Math.sin(t * 2)}
      fill="url(#haze)"
    />
  </g>
);

const Finish: React.FC<{ frame: number; flash: number }> = ({
  frame,
  flash,
}) => (
  <g pointerEvents="none">
    <rect width={1920} height={1080} fill="url(#vig)" />
    <rect width={1920} height={1080} fill="#fff" opacity={flash} />
    <rect
      width={1920}
      height={1080}
      filter="url(#grain)"
      opacity={0.05}
      transform={`translate(${((frame * 37) % 50) - 25} ${((frame * 53) % 50) - 25})`}
    />
  </g>
);

export const Video: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;

  const kick = IMPACTS.reduce(
    (a, i) => a + (t >= i ? Math.exp(-(t - i) * 9) : 0),
    0,
  );
  const shake = 12 * kick;
  const sx = shake * (random(`sx${frame}`) - 0.5),
    sy = shake * (random(`sy${frame}`) - 0.5);
  const flash =
    0.22 *
    IMPACTS.reduce((a, i) => a + (t >= i ? Math.exp(-(t - i) * 14) : 0), 0);

  let scene: React.ReactNode,
    cam = { s: 1, cx: 960, cy: 540 },
    haze = [960, 540];
  if (t < PREROLL) scene = <EndCard t={99} t0={0} />;
  else if (t < CUES.collapse) {
    scene = <Wall t={t} />;
    haze = [960, 540];
  } else if (t < CUES.payoff) {
    cam = treeCam(t);
    haze = [960 + (NODE_X - cam.cx) * cam.s, 540 + (540 - cam.cy) * cam.s];
    const fade = ramp(t, CUES.payoff - 0.3, CUES.payoff);
    scene = (
      <g opacity={1 - fade}>
        <g
          transform={`translate(960 540) scale(${cam.s}) translate(${-cam.cx} ${-cam.cy})`}
        >
          <Arena t={t} />
        </g>
        <ArenaHeaders t={t} />
      </g>
    );
  } else if (t < CUES.end) {
    scene = <Payoff t={t} />;
    haze = [1170, 640];
  } else {
    const out = ramp(t, CUES.done - 0.6, CUES.done);
    scene = (
      <g opacity={1 - out}>
        <EndCard t={t} t0={CUES.end} />
      </g>
    );
    haze = [800, 480];
  }

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <Audio src={staticFile("soundtrack.wav")} />
      <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
        <Defs />
        <Backdrop
          t={t}
          px={-(cam.cx - 960) * 0.35 * cam.s}
          py={-(cam.cy - 540) * 0.35 * cam.s}
          hazeX={haze[0]}
          hazeY={haze[1]}
        />
        <g transform={`translate(${sx} ${sy})`}>
          {scene}
        </g>
        <Finish frame={frame} flash={flash} />
      </svg>
    </AbsoluteFill>
  );
};

export const KeyArt: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.bg }}>
    <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
      <Defs />
      <Backdrop t={0} px={0} py={0} hazeX={800} hazeY={480} />
      <EndCard t={99} t0={0} />
      <Finish frame={0} flash={0} />
    </svg>
  </AbsoluteFill>
);
