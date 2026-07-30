import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateSessions,
  deriveSessionMetrics,
  safeRatio,
} from "../qianchuan-live-weekly-report/scripts/metrics.mjs";

test("safeRatio returns null for a zero denominator", () => {
  assert.equal(safeRatio(10, 0), null);
});

test("derives paid viewers, leverage, pay per thousand and funnel rates", () => {
  const result = deriveSessionMetrics({
    total_viewers: 1000,
    natural_viewers: 600,
    view_count: 1200,
    user_payment_amount: 3600,
    total_watch_seconds: 300000,
    room_exposure_people: 5000,
    product_exposure_people: 900,
    product_click_people: 270,
    transaction_people: 54,
  });

  assert.equal(result.calculated_paid_viewers, 400);
  assert.equal(result.natural_leverage_coefficient, 1.5);
  assert.equal(result.pay_per_thousand_views, 3000);
  assert.equal(result.exposure_to_view_rate, 0.2);
  assert.equal(result.view_to_product_exposure_rate, 0.9);
  assert.equal(result.product_exposure_to_click_rate, 0.3);
  assert.equal(result.product_click_to_transaction_rate, 0.2);
  assert.equal(result.exposure_to_transaction_rate, 0.0108);
});

test("leverage is null when paid viewers are zero", () => {
  const result = deriveSessionMetrics({
    total_viewers: 300,
    natural_viewers: 300,
    view_count: 300,
    user_payment_amount: 0,
  });

  assert.equal(result.calculated_paid_viewers, 0);
  assert.equal(result.natural_leverage_coefficient, null);
  assert.equal(result.natural_leverage_status, "无付费基数");
});

test("missing natural viewers stays missing instead of becoming zero", () => {
  const result = deriveSessionMetrics({
    total_viewers: 300,
    natural_viewers: null,
    view_count: 300,
    user_payment_amount: 900,
  });

  assert.equal(result.calculated_paid_viewers, null);
  assert.equal(result.natural_leverage_coefficient, null);
  assert.equal(result.natural_leverage_status, "自然观看缺失");
});

test("negative calculated paid viewers is a data error", () => {
  assert.throws(
    () => deriveSessionMetrics({ total_viewers: 100, natural_viewers: 101 }),
    /natural_viewers exceeds total_viewers/,
  );
});

test("rejects non-numeric metric text", () => {
  assert.throws(
    () =>
      deriveSessionMetrics({
        total_viewers: "not-a-number",
        natural_viewers: 10,
      }),
    /Non-numeric metric/,
  );
});

test("group metrics use summed numerators and a viewer-weighted watch time", () => {
  const group = aggregateSessions([
    {
      total_viewers: 100,
      natural_viewers: 90,
      view_count: 100,
      user_payment_amount: 100,
      total_watch_seconds: 1000,
      room_exposure_people: 1000,
      product_exposure_people: 80,
      product_click_people: 16,
      transaction_people: 4,
    },
    {
      total_viewers: 900,
      natural_viewers: 450,
      view_count: 900,
      user_payment_amount: 2700,
      total_watch_seconds: 18000,
      room_exposure_people: 3000,
      product_exposure_people: 720,
      product_click_people: 144,
      transaction_people: 36,
    },
  ]);

  assert.equal(group.calculated_paid_viewers, 460);
  assert.equal(group.natural_leverage_coefficient, 540 / 460);
  assert.equal(group.pay_per_thousand_views, 2800);
  assert.equal(group.average_watch_seconds, 19);
  assert.equal(group.exposure_to_view_rate, 0.25);
  assert.equal(group.product_exposure_to_click_rate, 0.2);
});
