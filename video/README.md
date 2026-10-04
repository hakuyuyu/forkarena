# Fork Arena launch video

A 29-second launch film built in [Remotion](https://remotion.dev). The picture and the score are both code.

```sh
npm install
npm run audio    # synthesizes public/soundtrack.wav, mastered to -12.5 LUFS
npm run studio   # live preview
npm run draft    # half-scale check render -> out/draft.mp4
npm run render   # 1080p60 H.264, CRF 16, 320k AAC -> out/forkarena-launch.mp4
npm run still -- KeyArt out/keyart.png
```

## One timing source

Every event time lives in `src/cues.ts`, set on a 120 BPM grid. The scenes in `src/Video.tsx` and the synthesizer in `audio/synth.ts` both import it, so each impact, riser and bell lands on its picture cue. To retime the film, edit `cues.ts` and run `npm run audio` again.

The first 0.3s is a still pre-roll of the end card, so feeds that pick an early frame show the name and tagline. The music is shifted by the same amount (`PREROLL`).

## Story beats

| Time | Shot | What it shows |
| --- | --- | --- |
| 0.3s | The queue | 1,000 agent pull requests pile up awaiting review |
| 4.3s | Fork | The pile implodes into one champion; six agents clone it |
| 8.3s | Traffic | Visitors flow through the arena; lane width is each fork's traffic share |
| 16.3s | Promote | The crown moves to agent-2 |
| 20.3s | Payoff | 5.5% vs 2.4% signups |
| 24.3s | End card | Name, tagline, repo |

## Claim sources

- **agent-2 promoted at P(better) = 0.962, 5.5% vs 2.4% signup rate (2.3×):** from the `arena-final` run on the live deploy (the champion keeps a 20% control share). Six agents forked the seed, then 4,000 visitors came from `scripts/simulate.mjs`. At the promote decision agent-2 had converted 12 of 217 (5.5%) and the seed 6 of 252 (2.4%); the Worker's log line reads `12/217 beats 6/252, P(better)=0.962`. The video's header says "simulated visitors". These are not real users.
- **Per-lane signup counts and particle flow** are illustrative. Each fork's traffic share follows the same ordering as the arena-final run, but particle counts are scaled down and conversion rates are exaggerated so the sparks are visible.
- **Retirement order** is staged for rhythm. In the real run all five other forks were retired after the promotion; the film shows four of them retiring before it. The rules themselves (promote at P > 0.95; retire below 0.05, or when still tied after 3,000 views) are in the main README.

## Audio

The score is synthesized in `audio/synth.ts`: drums, saw bass and pads, bells, noise risers, impacts and a Schroeder reverb. Mastering uses a tanh soft clip, with its drive found by binary search on a BS.1770 gated loudness meter. The mix was checked by measurement, not by ear: −12.54 LUFS integrated by pyloudnorm, peak −0.27 dBFS, and a spectrogram with risers and impacts at their cue times.

## Demo (3:44 walkthrough)

A narrated walkthrough of one real run, `arena-final`, for submissions that want a longer video.

```sh
FA_URL=... node capture/record.mjs arena-final public/demo   # dashboard screenshots + states.jsonl while the run happens
FA_URL=... node capture/forks.mjs arena-final public/demo    # each fork's page, cloned from its Artifacts repo
arch -x86_64 <venv>/bin/python audio/tts.py                  # Kokoro VO -> public/demo-vo/*.wav, src/demo-durations.ts
npm run demo-audio   # pad bed + ducked VO, loudnorm to -14 LUFS (needs a full ffmpeg on PATH)
npm run demo         # -> out/forkarena-demo.mp4
```

`src/demo-cues.ts` is the timing source: each chapter lasts lead + its VO length + tail, and both `src/Demo.tsx` and `audio/demo-mix.ts` read it. The narration script is `narration/demo.json`.

Every number on screen comes from that run: the Worker log line `12/217 beats 6/252, P(better)=0.962`, retirements at P < 0.05, and agent-7 (generation 2) at 34/591 vs the champion's 188/3791, P ≈ 0.81 and undecided when the capture ended. Visitors are simulated by `scripts/simulate.mjs`. The traffic chapter is rebuilt from `states.jsonl`; the judge chapter ends on the real dashboard screenshot.
