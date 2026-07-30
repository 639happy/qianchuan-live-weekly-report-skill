import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { scanRelease } from "../qianchuan-live-weekly-report/scripts/scan-sensitive.mjs";

async function makeTempRoot(name) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

test("flags sensitive content, private literals, and forbidden artifacts", async () => {
  const root = await makeTempRoot("sensitive-release");
  const denylistPath = path.join(root, "..", `${path.basename(root)}.denylist`);
  const localPath = ["/", "Users", "/", "example", "/", "private.xlsx"].join("");
  const longId = "9".repeat(18);
  const feishuLink = [
    "https://example.",
    "feishu.cn",
    "/docx/",
    "private",
  ].join("");
  const backendUrl = [
    "https://compass.",
    "jinritemai.com/shop/live-detail",
    "?live_room_id=",
    longId,
  ].join("");
  const secretAssignment = ["access_", "token", '="', "secret-value", '"'].join(
    "",
  );
  const privateLiteral = ["PRIVATE", "_ACCOUNT", "_NAME"].join("");

  await fs.writeFile(
    path.join(root, "notes.md"),
    [localPath, longId, feishuLink, backendUrl, secretAssignment].join("\n"),
  );
  for (const file of [
    "report.xlsx",
    "legacy.xls",
    "run.log",
    "session.har",
    "screenshot.png",
    "video.mp4",
  ]) {
    await fs.writeFile(path.join(root, file), "");
  }
  await fs.writeFile(path.join(root, "private.txt"), privateLiteral);
  await fs.writeFile(denylistPath, `${privateLiteral}\n`);

  const result = await scanRelease({ root, denylistPath });
  const rules = new Set(result.findings.map((finding) => finding.rule));

  assert.equal(result.ok, false);
  for (const expected of [
    "local-user-path",
    "long-numeric-identifier",
    "feishu-resource-link",
    "backend-url-with-query",
    "secret-assignment",
    "forbidden-release-artifact",
    "private-denylist",
  ]) {
    assert.ok(rules.has(expected), `missing rule: ${expected}`);
  }
  assert.ok(
    result.findings.every(
      (finding) =>
        !finding.preview.includes(privateLiteral) &&
        !finding.preview.includes("secret-value"),
    ),
  );
});

test("allows source, synthetic fixtures, templates, README, and LICENSE", async () => {
  const root = await makeTempRoot("clean-release");
  const denylistPath = path.join(root, ".release-denylist.local");
  const privateLiteral = ["DO", "_NOT", "_PUBLISH"].join("");
  await fs.mkdir(path.join(root, "scripts"), { recursive: true });
  await fs.mkdir(path.join(root, "tests", "fixtures"), { recursive: true });
  await fs.mkdir(path.join(root, "assets"), { recursive: true });
  await fs.writeFile(
    path.join(root, "scripts", "metrics.mjs"),
    'export const safeRatio = (a, b) => (b === 0 ? null : a / b);\n',
  );
  await fs.writeFile(
    path.join(root, "tests", "fixtures", "synthetic.json"),
    JSON.stringify({ account_id: "SYNTHETIC_ACCOUNT", viewers: 1000 }),
  );
  await fs.writeFile(
    path.join(root, "assets", "template.csv"),
    "field_name,value\naccount_id,SYNTHETIC_ACCOUNT\n",
  );
  await fs.writeFile(path.join(root, "README.md"), "# Public Skill\n");
  await fs.writeFile(path.join(root, "LICENSE"), "MIT License\n");
  await fs.writeFile(denylistPath, `${privateLiteral}\n`);

  const result = await scanRelease({ root, denylistPath });
  assert.deepEqual(result, { ok: true, findings: [] });
});
