import { defineConfig, bindings, exports } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "forkarena",
    entrypoint,
    compatibilityDate: "2026-10-01",
    exports: { Arena: exports.durableObject({ storage: "sqlite" }) },
    env: {
      ARTIFACTS: bindings.artifacts({ namespace: "forkarena" }),
      ADMIN_TOKEN: bindings.secret(),
      AGENT_TOKEN: bindings.secret(),
      ARENA: bindings.durableObject({ worker: "forkarena", exportName: "Arena" }),
    },
  },
});
