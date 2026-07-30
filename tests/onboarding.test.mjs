import fs from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const skillRoot = new URL(
  "../qianchuan-live-weekly-report/",
  import.meta.url,
);
const skillText = await fs.readFile(new URL("SKILL.md", skillRoot), "utf8");
const repositoryRoot = new URL("../", import.meta.url);

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
const readme = await fs
  .readFile(new URL("README.md", repositoryRoot), "utf8")
  .catch(() => "");
const license = await fs
  .readFile(new URL("LICENSE", repositoryRoot), "utf8")
  .catch(() => "");
const issueForm = await fs
  .readFile(
    new URL(".github/ISSUE_TEMPLATE/bug-report.yml", repositoryRoot),
    "utf8",
  )
  .catch(() => "");

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

test("Feishu delivery documents public installation, user identity, and readback", () => {
  for (const expected of [
    "npx @larksuite/cli@latest install",
    "lark-cli --version",
    "lark-cli config init --new",
    "lark-cli profile list",
    "--as user",
    "同一用户身份",
    "+workbook-import",
    "+workbook-info",
    "+cells-get",
    "回读",
    "飞书表格当前无法完成，是否确认将本次最终交付回退为Excel文件？",
  ]) {
    assert.ok(feishu.includes(expected), `missing: ${expected}`);
  }
  assert.doesNotMatch(feishu, /sheets \+(create|info|write|read)\b/);
  assert.match(feishu, /不得[\s\S]*自动[\s\S]*bot/);
  assert.match(feishu, /不得[\s\S]*自动[\s\S]*Excel/);
});

test("file-mode checklist labels required and conditional inputs", () => {
  assert.match(checklist, /必需/);
  assert.match(checklist, /条件必需/);
  assert.match(checklist, /可选/);
  assert.match(checklist, /罗盘直播明细/);
  assert.match(checklist, /逐场直播详情补数/);
  assert.match(checklist, /千川周期经营数据/);
});

test("automated mode checks every prerequisite and samples before full run", () => {
  for (const expected of [
    "Codex桌面客户端",
    "Chrome插件",
    "同一个Chrome用户配置",
    "compass.jinritemai.com",
    "qianchuan.jinritemai.com",
    "下载权限",
    "2—3场",
    "Cookie",
  ]) {
    assert.ok(automated.includes(expected), `missing: ${expected}`);
  }
  assert.match(automated, /验证码[\s\S]*停止/);
  assert.match(automated, /小样本[\s\S]*完整周/);
  assert.match(automated, /综合营销ROI/);
  assert.match(automated, /账号行[\s\S]*顶部汇总/);
  assert.match(automated, /暂无数据[\s\S]*不补0/);
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
  const privateLiterals = [
    ["Grey", " Preparer"].join(""),
    ["8366", "1327016"].join(""),
    ["shanghai", "-peige"].join(""),
    ["/Users/", "markhe"].join(""),
  ];
  for (const literal of privateLiterals) {
    assert.equal(all.includes(literal), false);
  }
});

test("README explains audience, problem, modes, prerequisites, and delivery before install", () => {
  const orderedSections = [
    "这个 Skill 面向谁",
    "它解决什么问题",
    "两种数据获取模式",
    "每种模式的前提条件",
    "Excel 与飞书两种交付方式",
    "使用边界与不适合情况",
    "## 7. 安装",
  ];
  let previous = -1;
  for (const section of orderedSections) {
    const index = readme.indexOf(section);
    assert.ok(index > previous, `missing or misordered section: ${section}`);
    previous = index;
  }
  for (const expected of [
    "文件模式",
    "全自动模式",
    "Codex桌面客户端",
    "Chrome插件",
    "compass.jinritemai.com",
    "qianchuan.jinritemai.com",
    "Excel",
    "飞书表格",
    "lark-cli",
    "飞书表格当前无法完成，是否确认将本次最终交付回退为Excel文件？",
  ]) {
    assert.ok(readme.includes(expected), `README missing: ${expected}`);
  }
});

test("README contains the resolved public installation URL and no owner placeholder", () => {
  assert.match(
    readme,
    /https:\/\/github\.com\/639happy\/qianchuan-live-weekly-report-skill\/tree\/main\/qianchuan-live-weekly-report/,
  );
  assert.doesNotMatch(readme, /\$OWNER|YOUR[_-]?OWNER|<owner>/i);
});

test("repository uses the exact MIT grant and requested copyright", () => {
  assert.match(license, /^MIT License/);
  assert.match(license, /Copyright \(c\) 2026 Mark He/);
  assert.match(
    license,
    /Permission is hereby granted, free of charge, to any person obtaining a copy/,
  );
  assert.match(license, /THE SOFTWARE IS PROVIDED "AS IS"/);
});

test("issue form asks for reproducible redacted context and rejects private uploads", () => {
  for (const expected of [
    "Skill版本",
    "数据模式",
    "交付方式",
    "结构版本",
    "已脱敏",
    "复现步骤",
    "真实导出",
    "截图",
    "Cookie",
    "token",
    "账号ID",
    "后台URL",
    "飞书链接",
    "经营数据",
  ]) {
    assert.ok(issueForm.includes(expected), `issue form missing: ${expected}`);
  }
});
