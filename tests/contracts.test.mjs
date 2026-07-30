import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmExcelFallback,
  createRunState,
  validateConfig,
} from "../qianchuan-live-weekly-report/scripts/contracts.mjs";

const validConfig = {
  report_level: "complete",
  data_acquisition_mode: "files",
  delivery_target_requested: "feishu",
  account_name: "示例户外直播间",
  douyin_account_id: "TEST-ACCOUNT-001",
  period_start: "2026-08-03",
  period_end: "2026-08-09",
  timezone: "Asia/Shanghai",
  refund_maturity: "D7",
  output_directory: "./outputs",
  session_group_rules: [],
};

test("accepts a valid Feishu request without changing its target", () => {
  const result = validateConfig(validConfig);

  assert.equal(result.ok, true);
  assert.equal(result.value.delivery_target_requested, "feishu");
});

test("keeps long account identifiers as text", () => {
  const result = validateConfig({
    ...validConfig,
    douyin_account_id: 123456789012345,
  });

  assert.equal(result.value.douyin_account_id, "123456789012345");
});

test("rejects an inverted date window", () => {
  const result = validateConfig({
    ...validConfig,
    period_start: "2026-08-10",
    period_end: "2026-08-09",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /period_start/);
});

test("requires Feishu-specific fields only for Feishu delivery", () => {
  const feishu = validateConfig(validConfig);
  const excel = validateConfig({
    ...validConfig,
    delivery_target_requested: "excel",
  });

  assert.equal(feishu.value.feishu.required, true);
  assert.equal(excel.value.feishu.required, false);
});

test("Feishu failure waits for an explicit fallback decision", () => {
  const blocked = {
    ...createRunState(validConfig),
    data_status: "complete",
    local_report_status: "complete",
    feishu_publish_status: "blocked",
    delivery_status: "awaiting_user_decision",
  };

  const unchanged = confirmExcelFallback(blocked, false);

  assert.equal(unchanged.delivery_target_actual, "pending");
  assert.equal(unchanged.delivery_status, "awaiting_user_decision");
});

test("confirmed fallback changes actual delivery to Excel", () => {
  const blocked = {
    ...createRunState(validConfig),
    data_status: "complete",
    local_report_status: "complete",
    feishu_publish_status: "blocked",
    delivery_status: "awaiting_user_decision",
  };

  const confirmed = confirmExcelFallback(blocked, true);

  assert.equal(confirmed.delivery_target_actual, "excel");
  assert.equal(confirmed.delivery_fallback_confirmed, true);
  assert.equal(confirmed.delivery_status, "complete");
});

test("cannot confirm Excel fallback before the local report passes", () => {
  const blocked = {
    ...createRunState(validConfig),
    local_report_status: "failed",
    feishu_publish_status: "blocked",
    delivery_status: "awaiting_user_decision",
  };

  assert.throws(
    () => confirmExcelFallback(blocked, true),
    /local report validation/,
  );
});
