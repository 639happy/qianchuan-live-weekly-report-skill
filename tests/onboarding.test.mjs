import fs from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const skillRoot = new URL(
  "../qianchuan-live-weekly-report/",
  import.meta.url,
);
const skillText = await fs.readFile(new URL("SKILL.md", skillRoot), "utf8");

async function readOptional(relativePath) {
  try {
    return await fs.readFile(new URL(relativePath, skillRoot), "utf8");
  } catch {
    return "";
  }
}

const onboarding = await readOptional("references/onboarding.md");
const checklist = await readOptional("references/data-checklist.md");
const automated = await readOptional("references/automated-mode.md");
const feishu = await readOptional("references/feishu-delivery.md");
const quality = await readOptional("references/quality-and-errors.md");

test("SKILL frontmatter contains only name and description", () => {
  const match = skillText.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match);
  const keys = match[1]
    .split("\n")
    .filter((line) => /^[a-zA-Z][a-zA-Z0-9_-]*:/.test(line))
    .map((line) => line.split(":")[0]);
  assert.deepEqual(keys, ["name", "description"]);
});

test("SKILL routes every conditional workflow to one-level references", () => {
  for (const reference of [
    "references/onboarding.md",
    "references/data-checklist.md",
    "references/metrics-and-sources.md",
    "references/automated-mode.md",
    "references/feishu-delivery.md",
    "references/quality-and-errors.md",
  ]) {
    assert.match(skillText, new RegExp(reference.replace(".", "\\.")));
  }
});

test("SKILL is concise and contains no generator placeholders", () => {
  assert.ok(skillText.split("\n").length < 500);
  assert.doesNotMatch(skillText, /\[TODO:|Structuring This Skill/);
});

test("onboarding asks report level then data mode then delivery target", () => {
  const reportIndex = onboarding.indexOf("报告完整度");
  const modeIndex = onboarding.indexOf("数据获取模式");
  const deliveryIndex = onboarding.indexOf("最终交付");
  assert.ok(reportIndex >= 0);
  assert.ok(modeIndex > reportIndex);
  assert.ok(deliveryIndex > modeIndex);
  assert.match(onboarding, /文件模式[\s\S]*Excel[\s\S]*飞书/);
  assert.match(onboarding, /全自动模式[\s\S]*Excel[\s\S]*飞书/);
});

test("Excel delivery does not require Feishu CLI", () => {
  assert.match(onboarding, /选择Excel[\s\S]*不检查[\s\S]*lark-cli/);
});

test("Feishu failure requires the exact explicit fallback question", () => {
  const expected =
    "飞书表格当前无法完成，是否确认将本次最终交付回退为Excel文件？";
  assert.ok(feishu.includes(expected) || quality.includes(expected));
  assert.match(quality, /awaiting_user_decision/);
});

test("file-mode checklist labels required and conditional inputs", () => {
  assert.match(checklist, /必需/);
  assert.match(checklist, /条件必需/);
  assert.match(checklist, /可选/);
  assert.match(checklist, /罗盘直播明细/);
  assert.match(checklist, /逐场直播详情补数/);
  assert.match(checklist, /千川周期经营数据/);
});

test("public onboarding contains no known private project identifiers", () => {
  const all = [
    skillText,
    onboarding,
    checklist,
    automated,
    feishu,
    quality,
  ].join("\n");
  assert.doesNotMatch(
    all,
    /Grey Preparer|83661327016|shanghai-peige|\/Users\/markhe/,
  );
});
