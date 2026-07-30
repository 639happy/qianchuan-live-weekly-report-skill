import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const skillRoot = path.resolve(
  process.env.QIANCHUAN_SKILL_ROOT ??
    path.join(repositoryRoot, "qianchuan-live-weekly-report"),
);
const fixtureRoot = path.resolve(
  process.env.QIANCHUAN_FIXTURE_ROOT ??
    path.join(repositoryRoot, "tests", "fixtures"),
);

async function importScript(filename) {
  return import(
    pathToFileURL(path.join(skillRoot, "scripts", filename)).href
  );
}

async function readJson(filename) {
  return JSON.parse(
    await fs.readFile(path.join(fixtureRoot, filename), "utf8"),
  );
}

const fieldMap = {
  account_name: "主播昵称",
  account_id: "主播抖音号",
  start_time: "直播开始时间",
  end_time: "直播结束时间",
  duration_minutes: "直播时长(分钟)",
  room_exposure_people: "直播间曝光人数",
  total_viewers: "直播间观看人数",
  view_count: "直播间观看次数",
  average_watch_minutes: "人均观看时长(分钟)",
  product_exposure_people: "直播间商品曝光人数",
  product_click_people: "直播间商品点击人数",
  user_payment_amount: "直播间用户支付金额",
  transaction_people: "直播间成交人数",
};

const outputPath = path.join(
  os.tmpdir(),
  `qianchuan-acceptance-${process.pid}-${Date.now()}.xlsx`,
);

const gates = {
  config_valid: false,
  rows_normalized: false,
  metrics_calculated: false,
  qianchuan_period_valid: false,
  workbook_built: false,
  workbook_readback: false,
  missing_cli_detected: false,
  feishu_waits_user_decision: false,
  explicit_fallback_complete: false,
};

try {
  const [
    contracts,
    normalizer,
    workbookBuilder,
    workbookVerifier,
    feishuState,
  ] = await Promise.all([
    importScript("contracts.mjs"),
    importScript("normalize-inputs.mjs"),
    importScript("build-weekly-report.mjs"),
    importScript("verify-weekly-report.mjs"),
    importScript("feishu-state.mjs"),
  ]);
  const [configInput, compass, details, qianchuan] = await Promise.all([
    readJson("report-config-synthetic.json"),
    readJson("compass-synthetic.json"),
    readJson("live-detail-synthetic.json"),
    readJson("qianchuan-period-synthetic.json"),
  ]);

  const validated = contracts.validateConfig(configInput);
  gates.config_valid = validated.ok;
  if (!validated.ok) {
    throw new Error(validated.errors.join("; "));
  }
  const config = {
    ...validated.value,
    data_captured_at: "2026-08-10T09:00:00+08:00",
  };

  const normalized = normalizer.normalizeCompassRows({
    ...compass,
    config,
    fieldMap,
  });
  gates.rows_normalized =
    normalized.sessions.length === compass.rows.length &&
    normalized.source_rows.length === compass.rows.length;

  const sessions = normalizer.mergeLiveDetails(
    normalized.sessions,
    details,
  );
  gates.metrics_calculated =
    sessions.length === 3 &&
    sessions[0].calculated_paid_viewers === 400 &&
    sessions[0].natural_leverage_coefficient === 1.5 &&
    sessions[2].natural_viewers === null;

  const period = normalizer.validateQianchuanPeriod(qianchuan, config);
  gates.qianchuan_period_valid = period.comprehensive_roi === 3;

  await workbookBuilder.buildWeeklyReport({
    config,
    sourceHeaders: normalized.source_headers,
    sourceRows: normalized.source_rows,
    sessions,
    qianchuanPeriod: period,
    outputPath,
  });
  const stat = await fs.stat(outputPath);
  gates.workbook_built = stat.isFile() && stat.size > 0;

  const workbookResult = await workbookVerifier.verifyWeeklyReport({
    outputPath,
    expectedSourceHeaders: normalized.source_headers,
    expectedSourceRows: normalized.source_rows,
    expectedSessionCount: sessions.length,
  });
  gates.workbook_readback =
    workbookResult.ok &&
    workbookResult.checks.data_row_count === sessions.length &&
    workbookResult.checks.formula_error_count === 0;

  const feishuConfig = {
    ...config,
    delivery_target_requested: "feishu",
  };
  const missingCli = feishuState.nextFeishuAction({
    cli_available: false,
    initialized: false,
    user_profile: null,
    identity_kind: "user",
    bot_explicitly_allowed: false,
    authorized: false,
    can_write: false,
  });
  gates.missing_cli_detected =
    missingCli.action === "install_cli" && missingCli.status === "blocked";

  const localCompleteState = {
    ...contracts.createRunState(feishuConfig),
    data_status: "complete",
    local_report_status: "complete",
  };
  const preflightFailed = feishuState.markFeishuPreflightFailure(
    localCompleteState,
    "Synthetic missing CLI",
  );
  gates.feishu_waits_user_decision =
    preflightFailed.delivery_status === "awaiting_user_decision" &&
    preflightFailed.delivery_target_actual === "pending";

  const fallback = contracts.confirmExcelFallback(preflightFailed, true);
  gates.explicit_fallback_complete =
    fallback.delivery_status === "complete" &&
    fallback.delivery_target_actual === "excel" &&
    fallback.delivery_fallback_confirmed === true;

  const allPassed = Object.values(gates).every(Boolean);
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: allPassed,
        gates,
        workbook_checks: workbookResult.checks,
      },
      null,
      2,
    )}\n`,
  );
  if (!allPassed) process.exitCode = 1;
} catch (error) {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: false,
        gates,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
} finally {
  await fs.rm(outputPath, { force: true });
}
