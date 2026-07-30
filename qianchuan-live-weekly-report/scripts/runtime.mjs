import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export async function loadArtifactTool() {
  try {
    const require = createRequire(import.meta.url);
    const resolved = require.resolve("@oai/artifact-tool");
    return import(pathToFileURL(resolved).href);
  } catch (error) {
    throw new Error(
      "Codex spreadsheet runtime is unavailable. Ask Codex to load workspace dependencies; do not install npm packages manually.",
      { cause: error },
    );
  }
}
