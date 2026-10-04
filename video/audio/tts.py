# Narration for the Demo composition: one wav per chapter plus src/demo-durations.ts, from narration/demo.json.
# usage: <kokoro venv>/bin/python audio/tts.py
import json, soundfile as sf, numpy as np
from kokoro import KPipeline

chapters = json.load(open("narration/demo.json"))
pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
out = {}
for c in chapters:
    audio = np.concatenate([a for _, _, a in pipe(c["text"], voice="af_heart", speed=1.0)])
    sf.write(f"public/demo-vo/{c['id']}.wav", audio, 24000)
    out[c["id"]] = round(len(audio) / 24000, 3)
open("src/demo-durations.ts", "w").write("// Written by audio/tts.py: narration length per chapter, in seconds.\nexport const VO: Record<string, number> = " + json.dumps(out, indent=1) + ";\n")
print(out, round(sum(out.values()), 1))
