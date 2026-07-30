import { deriveSessionMetrics, safeRatio } from "./metrics.mjs";

export const EXTENSION_FIELDS = [
  "live_room_id",
  "直播详情页URL",
  "自然流量观看人数",
  "付费流量观看人数",
  "自然流量观看占比",
  "付费流量观看占比",
  "自然流撬动系数",
  "自然流撬动系数状态",
  "千次观看用户支付金额（罗盘口径）",
  "千次观看支付数据来源",
  "曝光→观看率",
  "观看→商品曝光率",
  "商品曝光→点击率",
  "商品点击→成交率",
  "曝光→成交率",
  "场次分组",
  "工作日/周末",
  "是否纳入同类场次趋势",
  "网页数据匹配状态",
];

export const DEFAULT_FIELD_MAP = {
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
  transaction_orders: "直播间成交订单数",
  transaction_amount: "直播间成交金额",
  user_payment_amount: "直播间用户支付金额",
  transaction_people: "直播间成交人数",
  refund_orders: "直播间退款订单数",
  refund_amount: "直播间退款金额",
  spend_shop_bound: "投放消耗(店铺绑定)",
  spend_shop_promoted: "投放消耗(店铺被投)",
  net_transaction_amount: "净成交金额",
};

function startMinute(value) {
  return String(value ?? "").replaceAll("/", "-").slice(0, 16);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "" || value === "-") {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Non-numeric source value: ${value}`);
  }
  return number;
}

function sessionDate(value) {
  const date = String(value ?? "").replaceAll("/", "-").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid session start time: ${value}`);
  }
  return date;
}

export function normalizeCompassRows({
  headers,
  rows,
  config,
  fieldMap = DEFAULT_FIELD_MAP,
}) {
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    throw new Error("Compass input must contain headers and rows arrays");
  }

  const missing = Object.entries(fieldMap)
    .filter(([, sourceName]) => !headers.includes(sourceName))
    .map(([canonical]) => canonical);
  if (missing.length > 0) {
    throw new Error(`Missing required canonical fields: ${missing.join(", ")}`);
  }

  const accountIdColumn = headers.indexOf(fieldMap.account_id);
  const accountNameColumn = headers.indexOf(fieldMap.account_name);
  const accountIds = new Set(
    rows.map((row) => String(row[accountIdColumn] ?? "")),
  );
  const accountNames = new Set(
    rows.map((row) => String(row[accountNameColumn] ?? "")),
  );
  if (
    accountIds.size !== 1 ||
    !accountIds.has(String(config.douyin_account_id)) ||
    accountNames.size !== 1 ||
    !accountNames.has(String(config.account_name))
  ) {
    throw new Error("Source rows contain a different or mixed account");
  }

  const sessions = rows.map((row, index) => {
    if (!Array.isArray(row) || row.length !== headers.length) {
      throw new Error(`Source row ${index + 2} does not match header length`);
    }

    const canonical = Object.fromEntries(
      Object.entries(fieldMap).map(([canonicalName, sourceName]) => [
        canonicalName,
        row[headers.indexOf(sourceName)],
      ]),
    );
    const date = sessionDate(canonical.start_time);
    if (date < config.period_start || date > config.period_end) {
      throw new Error(`Session ${canonical.start_time} is outside requested period`);
    }

    canonical.account_id = String(canonical.account_id);
    canonical.duration_minutes = numberOrNull(canonical.duration_minutes);
    canonical.total_viewers = numberOrNull(canonical.total_viewers);
    canonical.view_count = numberOrNull(canonical.view_count);
    canonical.room_exposure_people = numberOrNull(
      canonical.room_exposure_people,
    );
    canonical.average_watch_minutes = numberOrNull(
      canonical.average_watch_minutes,
    );
    canonical.product_exposure_people = numberOrNull(
      canonical.product_exposure_people,
    );
    canonical.product_click_people = numberOrNull(
      canonical.product_click_people,
    );
    canonical.user_payment_amount = numberOrNull(
      canonical.user_payment_amount,
    );
    canonical.transaction_people = numberOrNull(
      canonical.transaction_people,
    );
    canonical.total_watch_seconds =
      canonical.average_watch_minutes === null ||
      canonical.total_viewers === null
        ? null
        : canonical.average_watch_minutes * 60 * canonical.total_viewers;

    return {
      ...canonical,
      source_row_number: index + 2,
      source_row: [...row],
      natural_viewers: null,
      live_room_id: null,
      detail_url: null,
      web_match_status: "未匹配",
    };
  });

  return {
    source_headers: [...headers],
    source_rows: rows.map((row) => [...row]),
    sessions,
  };
}

export function mergeLiveDetails(sessions, details) {
  const detailsByMinute = new Map();
  for (const detail of details) {
    const key = startMinute(detail.start_time);
    const bucket = detailsByMinute.get(key) ?? [];
    bucket.push(detail);
    detailsByMinute.set(key, bucket);
  }

  return sessions.map((session) => {
    const candidates = detailsByMinute.get(startMinute(session.start_time)) ?? [];
    let detail = null;

    if (candidates.length === 1) {
      [detail] = candidates;
    } else if (candidates.length > 1) {
      const durationMatches = candidates.filter(
        (candidate) =>
          Number(candidate.duration_minutes) === Number(session.duration_minutes),
      );
      if (durationMatches.length === 1) {
        [detail] = durationMatches;
      } else {
        throw new Error(`Ambiguous detail match: ${session.start_time}`);
      }
    }

    if (!detail) {
      return deriveSessionMetrics({
        ...session,
        natural_viewers: null,
        live_room_id: null,
        detail_url: null,
        web_match_status: "未匹配",
        pay_per_thousand_source: "原始数据公式补算",
      });
    }

    if (detail.status === "no_data") {
      return deriveSessionMetrics({
        ...session,
        natural_viewers: null,
        live_room_id: String(detail.live_room_id),
        detail_url: detail.detail_url,
        detail_captured_at: detail.captured_at,
        web_match_status: "详情页暂无数据",
        pay_per_thousand_source: "原始数据公式补算",
      });
    }

    return deriveSessionMetrics({
      ...session,
      natural_viewers: numberOrNull(detail.natural_viewers),
      live_room_id: String(detail.live_room_id),
      detail_url: detail.detail_url,
      detail_captured_at: detail.captured_at,
      web_match_status: "已匹配",
      pay_per_thousand_source: "罗盘网页（公式复核）",
    });
  });
}

export function validateQianchuanPeriod(period, config) {
  if (
    String(period.account_id) !== String(config.douyin_account_id) ||
    period.period_start !== config.period_start ||
    period.period_end !== config.period_end
  ) {
    throw new Error(
      "Qianchuan data does not match requested account and period",
    );
  }

  const netTransactionAmount = numberOrNull(period.net_transaction_amount);
  const comprehensiveCost = numberOrNull(period.comprehensive_cost);
  const reportedRoi = numberOrNull(period.reported_roi);
  const reportedRoiLabel = period.reported_roi_label ?? null;
  const allowedRoiLabels = new Set(["综合营销ROI", "综合ROI"]);
  if (reportedRoiLabel && !allowedRoiLabels.has(reportedRoiLabel)) {
    throw new Error(
      `Unsupported Qianchuan ROI label: ${reportedRoiLabel}`,
    );
  }
  if (reportedRoi !== null && !reportedRoiLabel) {
    throw new Error("reported_roi_label is required when reported_roi exists");
  }
  const comprehensiveRoi =
    netTransactionAmount === null || comprehensiveCost === null
      ? null
      : safeRatio(netTransactionAmount, comprehensiveCost);
  if (
    reportedRoi !== null &&
    comprehensiveRoi !== null &&
    Math.abs(reportedRoi - comprehensiveRoi) > 0.02
  ) {
    throw new Error(
      "Reported Qianchuan ROI does not match net transaction amount and comprehensive cost",
    );
  }
  return {
    ...period,
    account_id: String(period.account_id),
    net_transaction_amount: netTransactionAmount,
    comprehensive_cost: comprehensiveCost,
    reported_roi_label: reportedRoiLabel,
    reported_roi: reportedRoi,
    comprehensive_roi: comprehensiveRoi,
  };
}
