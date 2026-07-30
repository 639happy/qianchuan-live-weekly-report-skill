import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateConfig } from "./contracts.mjs";

export async function validateConfigFile(configPath) {
  const raw = await fs.readFile(configPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      errors: [`Invalid JSON: ${error.message}`],
    };
  }
  return validateConfig(parsed);
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error("Usage: node validate-config.mjs path/to/report-config.json");
    process.exitCode = 2;
    return;
  }

  try {
    const result = await validateConfigFile(configPath);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({ ok: false, errors: [error.message] }, null, 2),
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
