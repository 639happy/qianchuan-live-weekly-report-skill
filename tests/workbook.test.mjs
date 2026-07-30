import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeLiveDetails,
  normalizeCompassRows,
  validateQianchuanPeriod,
} from "../qianchuan-live-weekly-report/scripts/normalize-inputs.mjs";
import {
  buildWeeklyReport,
} from "../qianchuan-live-weekly-report/scripts/build-weekly-report.mjs";
import {
  verifyWeeklyReport,
} from "../qianchuan-live-weekly-report/scripts/verify-weekly-report.mjs";

const fixtureRoot = new URL("./fixtures/", import.meta.url);
const compass = JSON.parse(
  await fs.readFile(new URL("compass-synthetic.json", fixtureRoot), "utf8"),
);
const details = JSON.parse(
  await fs.readFile(
    new URL("live-detail-synthetic.json", fixtureRoot),
    "utf8",
  ),
);
const qianchuan = JSON.parse(
  await fs.readFile(
    new URL("qianchuan-period-synthetic.json", fixtureRoot),
    "utf8",
  ),
);

const config = {
  report_level: "complete",
  data_acquisition_mode: "files",
  delivery_target_requested: "excel",
  account_name: "示例户外直播间",
  douyin_account_id: "TEST-ACCOUNT-001",
  period_start: "2026-08-03",
  period_end: "2026-08-09",
  timezone: "Asia/Shanghai",
  refund_maturity: "D7",
  output_directory: "./outputs",
  session_group_rules: [],
  data_captured_at: "2026-08-10T09:00:00+08:00",
};

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

test("builds and reads back the four-sheet weekly report", async () => {
  const normalized = normalizeCompassRows({
    ...compass,
    config,
    fieldMap,
  });
  const sessions = mergeLiveDetails(normalized.sessions, details);
  const period = validateQianchuanPeriod(qianchuan, config);
  const outputPath = path.join(
    os.tmpdir(),
    `qianchuan-synthetic-${process.pid}.xlsx`,
  );

  await buildWeeklyReport({
    config,
    sourceHeaders: normalized.source_headers,
    sourceRows: normalized.source_rows,
    sessions,
    qianchuanPeriod: period,
    outputPath,
  });
  const result = await verifyWeeklyReport({
    outputPath,
    expectedSourceHeaders: normalized.source_headers,
    expectedSourceRows: normalized.source_rows,
    expectedSessionCount: sessions.length,
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.deepEqual(result.checks.sheet_names, [
    "场次核心明细",
    "周报汇总",
    "数据底表",
    "数据字典",
  ]);
  assert.equal(result.checks.data_row_count, 3);
  assert.equal(result.checks.data_column_count, compass.headers.length + 19);
  assert.equal(result.checks.formula_error_count, 0);
  assert.ok(result.checks.data_formula_count > 0);

  await fs.unlink(outputPath);
});
