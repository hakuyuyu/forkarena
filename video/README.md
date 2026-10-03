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
| 16.3s | Promote | The crown moves to agent-3 |
| 20.3s | Payoff | 6.1% vs 2.4% signups |
| 24.3s | End card | Name, tagline, repo |

## Claim sources

- **agent-3 promoted at P(better) = 0.956, 6.1% vs 2.4% signup rate (2.5×):** from the `demo` arena run on the live deploy. Six agents forked the seed, then 4,000 visitors came from `scripts/simulate.mjs`. agent-3 converted 122 of 1,984 (6.1%) and the seed 4 of 165 (2.4%). The video's header says "simulated visitors". These are not real users.
- **Per-lane signup counts and particle flow** are illustrative. Each fork's traffic share follows the same ordering as the demo run, but particle counts are scaled down and conversion rates are exaggerated so the sparks are visible.
- **Retirement order** of agents 1, 2, 5 and 6 is staged for rhythm. The rules themselves (promote at P > 0.95; retire below 0.05, or when still tied after 3,000 views) are in the main README.

## Audio

The score is synthesized in `audio/synth.ts`: drums, saw bass and pads, bells, noise risers, impacts and a Schroeder reverb. Mastering uses a tanh soft clip, with its drive found by binary search on a BS.1770 gated loudness meter. The mix was checked by measurement, not by ear: −12.54 LUFS integrated by pyloudnorm, peak −0.27 dBFS, and a spectrogram with risers and impacts at their cue times.
