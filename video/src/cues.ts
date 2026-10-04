// The one timing source. Scenes and audio/synth.mjs both read this, so picture hits land on music hits.
export const FPS = 60;
export const BPM = 120;
export const BEAT = 60 / BPM;
export const PREROLL = 0.3; // thumbnail hold; music is shifted by the same amount
export const at = (beats: number) => PREROLL + beats * BEAT;

export const CUES = {
  queue: at(0), // PR tickets pile up
  collapse: at(8), // the pile implodes into one champion
  forks: [at(10), at(10.5), at(11), at(11.5), at(12), at(12.5)], // six clones peel off
  traffic: at(16), // visitors start flowing, drums in
  retire: [at(22), at(24), at(26), at(28)], // agent-5, agent-1, agent-6, agent-4
  promote: at(32), // agent-2 takes the crown
  payoff: at(40), // conversion numbers
  end: at(48), // logo + repo
  done: at(58),
};

export const DURATION = CUES.done;
