import { Composition, Still } from "remotion";
import { Video, KeyArt } from "./Video";
import { DURATION, FPS } from "./cues";
import { Demo } from "./Demo";
import { DEMO_DURATION, DFPS } from "./demo-cues";

export const Root = () => (
  <>
    <Composition id="LaunchVideo" component={Video} durationInFrames={Math.round(DURATION * FPS)} fps={FPS} width={1920} height={1080} />
    <Composition id="Demo" component={Demo} durationInFrames={Math.round(DEMO_DURATION * DFPS)} fps={DFPS} width={1920} height={1080} />
    <Still id="KeyArt" component={KeyArt} width={1920} height={1080} />
  </>
);
