import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const FORBIDDEN_EXTENSIONS = new Set([
  ".xlsx",
  ".xls",
  ".log",
  ".har",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
]);

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".jsonl",
  ".mjs",
  ".js",
  ".cjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
  ".csv",
  ".html",
  ".css",
  ".toml",
]);

const CONTENT_RULES = [
  {
    rule: "local-user-path",
    pattern: /\/(?:Users|home)\/[^/\s]+\/[^\s"'<>]+/i,
  },
  {
    rule: "long-numeric-identifier",
    pattern: /\b\d{16,}\b/,
  },
  {
    rule: "feishu-resource-link",
    pattern:
      /https?:\/\/[^\s"'<>]*(?:feishu\.cn|larksuite\.com)\/(?:docx|doc|sheets|wiki|base|drive\/file)\/[^\s"'<>]+/i,
  },
  {
    rule: "backend-url-with-query",
    pattern:
      /https?:\/\/(?:compass|qianchuan)\.jinritemai\.com\/[^\s"'<>]*\?[^\s"'<>]+/i,
  },
  {
    rule: "secret-assignment",
    pattern:
      /\b(?:cookie|password|app[_-]?secret|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*["'][^"'\n]{4,}["']/i,
  },
];

function isTextFile(filePath) {
  const basename = path.basename(filePath);
  return (
    TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()) ||
    basename === "LICENSE" ||
    basename === ".gitignore"
  );
}

async function listFiles(root) {
  const files = [];

  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  }

  await walk(root);
  return files;
}

async function readDenylist(denylistPath) {
  if (!denylistPath) return [];
  const text = await fs.readFile(denylistPath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function redactLine(line, denylist) {
  let redacted = line;
  for (const { pattern } of CONTENT_RULES) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  for (const literal of denylist) {
    redacted = redacted.split(literal).join("[REDACTED]");
  }
  if (redacted.length > 180) {
    return `${redacted.slice(0, 177)}...`;
  }
  return redacted;
}

function finding({ file, line, rule, preview }) {
  return { file, line, rule, preview };
}

export async function scanRelease({ root, denylistPath }) {
  const absoluteRoot = path.resolve(root);
  const denylist = await readDenylist(denylistPath);
  const files = await listFiles(absoluteRoot);
  const findings = [];

  for (const filePath of files) {
    const relativePath = path
      .relative(absoluteRoot, filePath)
      .split(path.sep)
      .join("/");
    const extension = path.extname(filePath).toLowerCase();

    if (FORBIDDEN_EXTENSIONS.has(extension)) {
      findings.push(
        finding({
          file: relativePath,
          line: 0,
          rule: "forbidden-release-artifact",
          preview: `[REDACTED ${extension} artifact]`,
        }),
      );
    }

    if (!isTextFile(filePath)) continue;
    const text = await fs.readFile(filePath, "utf8");
    const lines = text.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const lineText = lines[index];
      for (const { rule, pattern } of CONTENT_RULES) {
        if (pattern.test(lineText)) {
          findings.push(
            finding({
              file: relativePath,
              line: index + 1,
              rule,
              preview: redactLine(lineText, denylist),
            }),
          );
        }
      }
      for (const literal of denylist) {
        if (lineText.includes(literal)) {
          findings.push(
            finding({
              file: relativePath,
              line: index + 1,
              rule: "private-denylist",
              preview: redactLine(lineText, denylist),
            }),
          );
        }
      }
    }
  }

  return {
    ok: findings.length === 0,
    findings,
  };
}

async function main() {
  const [root, denylistPath] = process.argv.slice(2);
  if (!root) {
    process.stderr.write(
      "Usage: node scan-sensitive.mjs <repository-root> [private-denylist]\n",
    );
    process.exitCode = 2;
    return;
  }
  const result = await scanRelease({ root, denylistPath });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
