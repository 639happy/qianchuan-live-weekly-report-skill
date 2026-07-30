import fs from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import {
  EXTENSION_FIELDS,
  mergeLiveDetails,
  normalizeCompassRows,
  validateQianchuanPeriod,
} from "../qianchuan-live-weekly-report/scripts/normalize-inputs.mjs";

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
  account_name: "示例户外直播间",
  douyin_account_id: "TEST-ACCOUNT-001",
  period_start: "2026-08-03",
  period_end: "2026-08-09",
  timezone: "Asia/Shanghai",
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

test("defines the fixed 19 extension fields in the approved order", () => {
  assert.equal(EXTENSION_FIELDS.length, 19);
  assert.deepEqual(EXTENSION_FIELDS.slice(0, 4), [
    "live_room_id",
    "直播详情页URL",
    "自然流量观看人数",
    "付费流量观看人数",
  ]);
  assert.equal(EXTENSION_FIELDS.at(-1), "网页数据匹配状态");
});

test("preserves source headers and rows while normalizing requested account", () => {
  const result = normalizeCompassRows({
    ...compass,
    config,
    fieldMap,
  });

  assert.deepEqual(result.source_headers, compass.headers);
  assert.deepEqual(result.source_rows, compass.rows);
  assert.equal(result.sessions.length, 3);
  assert.equal(result.sessions[0].account_id, "TEST-ACCOUNT-001");
  assert.equal(result.sessions[0].total_watch_seconds, 300000);
});

test("maps by field name when source columns are reordered", () => {
  const headers = [...compass.headers].reverse();
  const rows = compass.rows.map((row) =>
    headers.map((header) => row[compass.headers.indexOf(header)]),
  );

  const result = normalizeCompassRows({
    headers,
    rows,
    config,
    fieldMap,
  });

  assert.equal(result.sessions[0].total_viewers, 1000);
  assert.deepEqual(result.source_headers, headers);
});

test("rejects a missing canonical field", () => {
  const headers = compass.headers.filter(
    (header) => header !== "直播间观看人数",
  );
  const rows = compass.rows.map((row) =>
    headers.map((header) => row[compass.headers.indexOf(header)]),
  );

  assert.throws(
    () => normalizeCompassRows({ headers, rows, config, fieldMap }),
    /Missing required canonical fields: total_viewers/,
  );
});

test("rejects mixed-account rows instead of silently dropping them", () => {
  const rows = compass.rows.map((row) => [...row]);
  rows[1][compass.headers.indexOf("主播抖音号")] = "OTHER-ACCOUNT";

  assert.throws(
    () =>
      normalizeCompassRows({
        headers: compass.headers,
        rows,
        config,
        fieldMap,
      }),
    /different or mixed account/,
  );
});

test("rejects rows outside the requested week", () => {
  const rows = compass.rows.map((row) => [...row]);
  rows[0][compass.headers.indexOf("直播开始时间")] =
    "2026-08-02 06:30:00";

  assert.throws(
    () =>
      normalizeCompassRows({
        headers: compass.headers,
        rows,
        config,
        fieldMap,
      }),
    /outside requested period/,
  );
});

test("matches details and keeps unmatched webpage values empty", () => {
  const normalized = normalizeCompassRows({
    ...compass,
    config,
    fieldMap,
  });
  const merged = mergeLiveDetails(normalized.sessions, details);

  assert.equal(merged[0].live_room_id, "ROOM-SYNTH-001");
  assert.equal(merged[0].natural_viewers, 600);
  assert.equal(merged[0].web_match_status, "已匹配");
  assert.equal(merged[2].natural_viewers, null);
  assert.equal(merged[2].web_match_status, "未匹配");
  assert.equal(merged[2].calculated_paid_viewers, null);
});

test("rejects ambiguous same-minute detail matches", () => {
  const normalized = normalizeCompassRows({
    ...compass,
    config,
    fieldMap,
  });
  const ambiguous = [
    details[0],
    {
      ...details[0],
      live_room_id: "ROOM-SYNTH-AMBIGUOUS",
    },
  ];

  assert.throws(
    () => mergeLiveDetails(normalized.sessions, ambiguous),
    /Ambiguous detail match/,
  );
});

test("validates exact Qianchuan account and period and computes ROI", () => {
  const result = validateQianchuanPeriod(qianchuan, config);

  assert.equal(result.comprehensive_roi, 3);
});

test("rejects Qianchuan data from a different period", () => {
  assert.throws(
    () =>
      validateQianchuanPeriod(
        { ...qianchuan, period_end: "2026-08-08" },
        config,
      ),
    /does not match requested account and period/,
  );
});
