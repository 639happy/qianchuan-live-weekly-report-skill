const REPORT_LEVELS = new Set(["basic", "complete", "paid_diagnostics"]);
const DATA_MODES = new Set(["files", "automated"]);
const DELIVERY_TARGETS = new Set(["excel", "feishu"]);
const REQUIRED_FIELDS = [
  "report_level",
  "data_acquisition_mode",
  "delivery_target_requested",
  "account_name",
  "douyin_account_id",
  "period_start",
  "period_end",
  "timezone",
  "refund_maturity",
  "output_directory",
];

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

export function validateConfig(input) {
  const source = input && typeof input === "object" ? input : {};
  const errors = [];

  for (const key of REQUIRED_FIELDS) {
    if (source[key] === undefined || source[key] === null || source[key] === "") {
      errors.push(`${key} is required`);
    }
  }

  if (!REPORT_LEVELS.has(source.report_level)) {
    errors.push("report_level is invalid");
  }
  if (!DATA_MODES.has(source.data_acquisition_mode)) {
    errors.push("data_acquisition_mode is invalid");
  }
  if (!DELIVERY_TARGETS.has(source.delivery_target_requested)) {
    errors.push("delivery_target_requested is invalid");
  }
  if (!isIsoDate(source.period_start)) {
    errors.push("period_start must use YYYY-MM-DD");
  }
  if (!isIsoDate(source.period_end)) {
    errors.push("period_end must use YYYY-MM-DD");
  }
  if (
    isIsoDate(source.period_start) &&
    isIsoDate(source.period_end) &&
    source.period_start > source.period_end
  ) {
    errors.push("period_start must not be later than period_end");
  }

  const value = {
    ...source,
    douyin_account_id: String(source.douyin_account_id ?? ""),
    session_group_rules: Array.isArray(source.session_group_rules)
      ? source.session_group_rules
      : [],
    feishu: {
      ...(source.feishu && typeof source.feishu === "object" ? source.feishu : {}),
      required: source.delivery_target_requested === "feishu",
    },
  };

  return errors.length > 0
    ? { ok: false, errors, value }
    : { ok: true, errors: [], value };
}

export function createRunState(config) {
  const requested = config.delivery_target_requested;
  return {
    data_status: "blocked",
    local_report_status: "not_started",
    feishu_publish_status: requested === "feishu" ? "blocked" : "skipped",
    delivery_target_requested: requested,
    delivery_target_actual: requested === "excel" ? "excel" : "pending",
    delivery_fallback_confirmed: false,
    delivery_status: "blocked",
    completed_stage: "configuration_confirmed",
  };
}

export function confirmExcelFallback(state, confirmed) {
  if (!confirmed) return { ...state };
  if (state.local_report_status !== "complete") {
    throw new Error(
      "Excel fallback cannot complete before local report validation",
    );
  }
  return {
    ...state,
    delivery_target_actual: "excel",
    delivery_fallback_confirmed: true,
    delivery_status: "complete",
  };
}
