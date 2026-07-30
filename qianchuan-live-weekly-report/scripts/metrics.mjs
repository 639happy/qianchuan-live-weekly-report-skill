const SUM_FIELDS = [
  "total_viewers",
  "natural_viewers",
  "view_count",
  "user_payment_amount",
  "total_watch_seconds",
  "room_exposure_people",
  "product_exposure_people",
  "product_click_people",
  "transaction_people",
];

function numberOrZero(value) {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Non-numeric metric: ${value}`);
  }
  return number;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  return numberOrZero(value);
}

export function safeRatio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

export function deriveSessionMetrics(session) {
  const totalViewers = numberOrZero(session.total_viewers);
  const naturalViewers = optionalNumber(session.natural_viewers);
  const paidViewers =
    naturalViewers === null ? null : totalViewers - naturalViewers;

  if (paidViewers !== null && paidViewers < 0) {
    throw new Error("natural_viewers exceeds total_viewers");
  }

  const viewCount = numberOrZero(session.view_count);
  const payment = numberOrZero(session.user_payment_amount);
  const roomExposure = numberOrZero(session.room_exposure_people);
  const productExposure = numberOrZero(session.product_exposure_people);
  const productClicks = numberOrZero(session.product_click_people);
  const transactions = numberOrZero(session.transaction_people);
  const totalWatchSeconds = numberOrZero(session.total_watch_seconds);

  let leverageStatus = "可计算";
  if (naturalViewers === null) leverageStatus = "自然观看缺失";
  else if (paidViewers === 0) leverageStatus = "无付费基数";

  return {
    ...session,
    calculated_paid_viewers: paidViewers,
    natural_viewer_share:
      naturalViewers === null ? null : safeRatio(naturalViewers, totalViewers),
    paid_viewer_share:
      paidViewers === null ? null : safeRatio(paidViewers, totalViewers),
    natural_leverage_coefficient:
      naturalViewers === null || paidViewers === null
        ? null
        : safeRatio(naturalViewers, paidViewers),
    natural_leverage_status: leverageStatus,
    pay_per_thousand_views:
      safeRatio(payment, viewCount) === null
        ? null
        : safeRatio(payment, viewCount) * 1000,
    average_watch_seconds: safeRatio(totalWatchSeconds, totalViewers),
    exposure_to_view_rate: safeRatio(totalViewers, roomExposure),
    view_to_product_exposure_rate: safeRatio(productExposure, totalViewers),
    product_exposure_to_click_rate: safeRatio(
      productClicks,
      productExposure,
    ),
    product_click_to_transaction_rate: safeRatio(
      transactions,
      productClicks,
    ),
    exposure_to_transaction_rate: safeRatio(transactions, roomExposure),
  };
}

export function aggregateSessions(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return deriveSessionMetrics(
      Object.fromEntries(SUM_FIELDS.map((field) => [field, 0])),
    );
  }

  const naturalIsComplete = sessions.every(
    (session) =>
      session.natural_viewers !== null &&
      session.natural_viewers !== undefined &&
      session.natural_viewers !== "",
  );
  const totals = Object.fromEntries(
    SUM_FIELDS.map((field) => [
      field,
      field === "natural_viewers" && !naturalIsComplete
        ? null
        : sessions.reduce(
            (sum, session) => sum + numberOrZero(session[field]),
            0,
          ),
    ]),
  );

  return {
    ...deriveSessionMetrics(totals),
    session_count: sessions.length,
  };
}
