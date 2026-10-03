import { Composition, Still } from "remotion";
import { Video, KeyArt } from "./Video";
import { DURATION, FPS } from "./cues";

export const Root = () => (
  <>
    <Composition id="LaunchVideo" component={Video} durationInFrames={Math.round(DURATION * FPS)} fps={FPS} width={1920} height={1080} />
    <Still id="KeyArt" component={KeyArt} width={1920} height={1080} />
  </>
);
