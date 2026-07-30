import fs from "node:fs/promises";
import path from "node:path";
import { aggregateSessions } from "./metrics.mjs";
import { EXTENSION_FIELDS } from "./normalize-inputs.mjs";
import { loadArtifactTool } from "./runtime.mjs";

const COLORS = {
  deep: "#123B57",
  blue: "#176B87",
  pale: "#EAF3F7",
  text: "#20313D",
  muted: "#5E7380",
  border: "#D9E3E8",
  formula: "#FFF8E5",
};

function columnName(zeroBasedIndex) {
  let number = zeroBasedIndex + 1;
  let result = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }
  return result;
}

function fieldColumn(headers, fieldName) {
  const index = headers.indexOf(fieldName);
  if (index < 0) return null;
  return columnName(index);
}

function minuteOfDay(startTime) {
  const match = String(startTime).match(/[ T](\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function applyGrouping(session, rules) {
  const minute = minuteOfDay(session.start_time);
  const duration = Number(session.duration_minutes);
  if (minute === null || !Number.isFinite(duration)) {
    return { group: "数据异常", trend: "否" };
  }

  for (const rule of rules ?? []) {
    if (
      minute >= rule.start_minute &&
      minute <= rule.end_minute &&
      duration >= rule.duration_min &&
      duration <= rule.duration_max
    ) {
      return {
        group: rule.name,
        trend: rule.trend_status ?? "是",
      };
    }
  }
  return {
    group: duration < 180 ? "短场/异常场" : "其他场次",
    trend: "否",
  };
}

function dayType(startTime) {
  const date = String(startTime).replace(" ", "T").slice(0, 19);
  const day = new Date(`${date}+08:00`).getUTCDay();
  return day === 0 || day === 6 ? "周末" : "工作日";
}

function setHeaderStyle(range) {
  range.format = {
    fill: COLORS.blue,
    font: {
      name: "Microsoft YaHei",
      size: 9,
      bold: true,
      color: "#FFFFFF",
    },
    wrapText: true,
    horizontalAlignment: "center",
    verticalAlignment: "center",
    borders: { bottom: { style: "thin", color: COLORS.deep } },
  };
  range.format.rowHeight = 38;
}

function setBodyStyle(range) {
  range.format = {
    font: { name: "Microsoft YaHei", size: 9, color: COLORS.text },
    verticalAlignment: "center",
    borders: {
      insideHorizontal: { style: "thin", color: COLORS.border },
    },
  };
  range.format.rowHeight = 22;
}

function extensionValues(session, grouping) {
  return [
    session.live_room_id,
    session.detail_url,
    session.natural_viewers,
    null,
    null,
    null,
    null,
    session.natural_leverage_status,
    null,
    session.pay_per_thousand_source,
    null,
    null,
    null,
    null,
    null,
    grouping.group,
    dayType(session.start_time),
    grouping.trend,
    session.web_match_status,
  ];
}

function dictionaryRows() {
  return [
    ["live_room_id", "网页原生", "罗盘场次列表/详情入口", "按文本保存", "未匹配留空"],
    ["自然流量观看人数", "网页原生", "单场详情页核心数据", "去重人数", "未匹配留空"],
    ["付费流量观看人数", "项目计算", "总观看－自然观看", "不是千川原生归因", "自然缺失时留空"],
    ["自然流撬动系数", "项目计算", "自然观看÷项目计算付费观看", "不证明因果", "付费为0时留空"],
    ["千次观看用户支付金额（罗盘口径）", "项目计算", "用户支付÷观看次数×1000", "不等于广告GPM", "观看次数为0时留空"],
    ["曝光→观看率", "项目计算", "观看人数÷曝光人数", "人数口径", "分母为0时留空"],
    ["观看→商品曝光率", "项目计算", "商品曝光人数÷观看人数", "人数口径", "分母为0时留空"],
    ["商品曝光→点击率", "项目计算", "商品点击人数÷商品曝光人数", "人数口径", "分母为0时留空"],
    ["商品点击→成交率", "项目计算", "成交人数÷商品点击人数", "人数口径", "分母为0时留空"],
    ["曝光→成交率", "项目计算", "成交人数÷曝光人数", "人数口径", "分母为0时留空"],
    ["人均观看时长", "汇总计算", "观看人数加权", "不直接平均单场均值", "观看人数为0时留空"],
    ["综合ROI", "千川周期", "净成交金额÷综合成本", "同账号同周期", "成本为0时留空"],
  ];
}

export async function buildWeeklyReport({
  config,
  sourceHeaders,
  sourceRows,
  sessions,
  qianchuanPeriod,
  outputPath,
}) {
  if (sourceRows.length !== sessions.length) {
    throw new Error("Source row count and session count must match");
  }

  const { SpreadsheetFile, Workbook } = await loadArtifactTool();
  const workbook = Workbook.create();
  const coreSheet = workbook.worksheets.add("场次核心明细");
  const summarySheet = workbook.worksheets.add("周报汇总");
  const dataSheet = workbook.worksheets.add("数据底表");
  const dictionarySheet = workbook.worksheets.add("数据字典");
  const title = `${config.account_name}｜${config.period_start}～${config.period_end}直播周报`;

  const coreHeaders = [
    "主播昵称",
    "主播抖音号",
    "直播开始时间",
    "直播时长(分钟)",
    "场次分组",
    "工作日/周末",
    "直播间观看人数",
    "人均观看时长(分钟)",
    "自然流量观看人数",
    "付费流量观看人数",
    "自然流撬动系数",
    "千次观看用户支付金额（罗盘口径）",
    "曝光→观看率",
    "观看→商品曝光率",
    "商品曝光→点击率",
    "商品点击→成交率",
    "曝光→成交率",
    "网页数据匹配状态",
  ];
  const coreLastColumn = columnName(coreHeaders.length - 1);
  coreSheet.mergeCells(`A1:${coreLastColumn}1`);
  coreSheet.getRange("A1").values = [[title]];
  coreSheet.getRange(`A1:${coreLastColumn}1`).format = {
    fill: COLORS.deep,
    font: {
      name: "Microsoft YaHei",
      size: 15,
      bold: true,
      color: "#FFFFFF",
    },
    verticalAlignment: "center",
  };
  coreSheet.mergeCells(`A2:${coreLastColumn}2`);
  coreSheet.getRange("A2").values = [[
    `账号：${config.account_name}｜周期：${config.period_start}～${config.period_end}｜退款成熟度：${config.refund_maturity}｜抓取时间：${config.data_captured_at ?? "未提供"}`,
  ]];
  coreSheet.getRange(`A2:${coreLastColumn}2`).format = {
    fill: COLORS.pale,
    font: { name: "Microsoft YaHei", size: 9, color: COLORS.muted },
  };
  coreSheet.getRange(`A4:${coreLastColumn}4`).values = [coreHeaders];
  setHeaderStyle(coreSheet.getRange(`A4:${coreLastColumn}4`));

  const groupedSessions = sessions.map((session) => ({
    session,
    grouping: applyGrouping(session, config.session_group_rules),
  }));
  const coreRows = groupedSessions.map(({ session, grouping }) => [
    session.account_name,
    String(session.account_id),
    session.start_time,
    session.duration_minutes,
    grouping.group,
    dayType(session.start_time),
    session.total_viewers,
    session.average_watch_minutes,
    session.natural_viewers,
    session.calculated_paid_viewers,
    session.natural_leverage_coefficient,
    session.pay_per_thousand_views,
    session.exposure_to_view_rate,
    session.view_to_product_exposure_rate,
    session.product_exposure_to_click_rate,
    session.product_click_to_transaction_rate,
    session.exposure_to_transaction_rate,
    session.web_match_status,
  ]);
  const coreEndRow = coreRows.length + 4;
  coreSheet.getRange(`A5:${coreLastColumn}${coreEndRow}`).values = coreRows;
  setBodyStyle(coreSheet.getRange(`A5:${coreLastColumn}${coreEndRow}`));
  coreSheet.getRange(`B5:B${coreEndRow}`).format.numberFormat = "@";
  coreSheet.getRange(`H5:H${coreEndRow}`).format.numberFormat = "0.00";
  coreSheet.getRange(`K5:K${coreEndRow}`).format.numberFormat = "0.00";
  coreSheet.getRange(`L5:L${coreEndRow}`).format.numberFormat = '"¥"#,##0.00';
  coreSheet.getRange(`M5:Q${coreEndRow}`).format.numberFormat = "0.00%";
  coreSheet.freezePanes.freezeRows(4);

  const total = aggregateSessions(sessions);
  summarySheet.mergeCells("A1:N1");
  summarySheet.getRange("A1").values = [[`${title}｜周报汇总`]];
  summarySheet.getRange("A1:N1").format = coreSheet.getRange(`A1:${coreLastColumn}1`).format;
  const summaryHeaders = [
    "场次分组",
    "场次数",
    "观看人数",
    "人均观看时长(分钟)",
    "自然观看人数",
    "付费观看人数",
    "自然流撬动系数",
    "千次观看用户支付金额",
    "曝光→观看率",
    "观看→商品曝光率",
    "商品曝光→点击率",
    "商品点击→成交率",
    "曝光→成交率",
    "退款成熟度",
  ];
  summarySheet.getRange("A3:N3").values = [summaryHeaders];
  setHeaderStyle(summarySheet.getRange("A3:N3"));
  const summaryRows = [[
    "全部场次",
    sessions.length,
    total.total_viewers,
    total.average_watch_seconds === null
      ? null
      : total.average_watch_seconds / 60,
    total.natural_viewers,
    total.calculated_paid_viewers,
    total.natural_leverage_coefficient,
    total.pay_per_thousand_views,
    total.exposure_to_view_rate,
    total.view_to_product_exposure_rate,
    total.product_exposure_to_click_rate,
    total.product_click_to_transaction_rate,
    total.exposure_to_transaction_rate,
    config.refund_maturity,
  ]];
  const groupNames = [
    ...new Set(groupedSessions.map(({ grouping }) => grouping.group)),
  ];
  for (const groupName of groupNames) {
    const groupSessions = groupedSessions
      .filter(({ grouping }) => grouping.group === groupName)
      .map(({ session }) => session);
    const group = aggregateSessions(groupSessions);
    summaryRows.push([
      groupName,
      groupSessions.length,
      group.total_viewers,
      group.average_watch_seconds === null
        ? null
        : group.average_watch_seconds / 60,
      group.natural_viewers,
      group.calculated_paid_viewers,
      group.natural_leverage_coefficient,
      group.pay_per_thousand_views,
      group.exposure_to_view_rate,
      group.view_to_product_exposure_rate,
      group.product_exposure_to_click_rate,
      group.product_click_to_transaction_rate,
      group.exposure_to_transaction_rate,
      config.refund_maturity,
    ]);
  }
  const summaryEndRow = summaryRows.length + 3;
  summarySheet.getRange(`A4:N${summaryEndRow}`).values = summaryRows;
  setBodyStyle(summarySheet.getRange(`A4:N${summaryEndRow}`));
  summarySheet.getRange(`D4:D${summaryEndRow}`).format.numberFormat = "0.00";
  summarySheet.getRange(`G4:G${summaryEndRow}`).format.numberFormat = "0.00";
  summarySheet.getRange(`H4:H${summaryEndRow}`).format.numberFormat = '"¥"#,##0.00';
  summarySheet.getRange(`I4:M${summaryEndRow}`).format.numberFormat = "0.00%";
  summarySheet.getRange("A10:C13").values = [
    ["千川周期指标", "数值", "来源"],
    ["净成交金额", qianchuanPeriod?.net_transaction_amount ?? null, qianchuanPeriod?.source ?? "未提供"],
    ["综合成本", qianchuanPeriod?.comprehensive_cost ?? null, qianchuanPeriod?.source ?? "未提供"],
    ["综合ROI", qianchuanPeriod?.comprehensive_roi ?? null, qianchuanPeriod?.source ?? "未提供"],
  ];
  summarySheet.freezePanes.freezeRows(3);

  const dataHeaders = [...sourceHeaders, ...EXTENSION_FIELDS];
  const dataLastColumn = columnName(dataHeaders.length - 1);
  dataSheet.getRange(`A1:${dataLastColumn}1`).values = [dataHeaders];
  setHeaderStyle(dataSheet.getRange(`A1:${dataLastColumn}1`));
  const dataRows = groupedSessions.map(({ session, grouping }, index) => [
    ...sourceRows[index],
    ...extensionValues(session, grouping),
  ]);
  const dataEndRow = dataRows.length + 1;
  dataSheet.getRange(`A2:${dataLastColumn}${dataEndRow}`).values = dataRows;
  setBodyStyle(dataSheet.getRange(`A2:${dataLastColumn}${dataEndRow}`));

  const extensionStart = sourceHeaders.length;
  const extensionColumns = Object.fromEntries(
    EXTENSION_FIELDS.map((field, offset) => [
      field,
      columnName(extensionStart + offset),
    ]),
  );
  const sourceColumns = {
    totalViewers: fieldColumn(sourceHeaders, "直播间观看人数"),
    viewCount: fieldColumn(sourceHeaders, "直播间观看次数"),
    payment: fieldColumn(sourceHeaders, "直播间用户支付金额"),
    exposure: fieldColumn(sourceHeaders, "直播间曝光人数"),
    productExposure: fieldColumn(sourceHeaders, "直播间商品曝光人数"),
    productClicks: fieldColumn(sourceHeaders, "直播间商品点击人数"),
    transactions: fieldColumn(sourceHeaders, "直播间成交人数"),
  };

  for (let row = 2; row <= dataEndRow; row += 1) {
    const natural = extensionColumns["自然流量观看人数"];
    const paid = extensionColumns["付费流量观看人数"];
    dataSheet.getRange(`${paid}${row}`).formulas = [[
      `=IF(OR(${sourceColumns.totalViewers}${row}="",${natural}${row}=""),"",${sourceColumns.totalViewers}${row}-${natural}${row})`,
    ]];
    dataSheet.getRange(`${extensionColumns["自然流量观看占比"]}${row}`).formulas = [[
      `=IFERROR(${natural}${row}/${sourceColumns.totalViewers}${row},"")`,
    ]];
    dataSheet.getRange(`${extensionColumns["付费流量观看占比"]}${row}`).formulas = [[
      `=IFERROR(${paid}${row}/${sourceColumns.totalViewers}${row},"")`,
    ]];
    dataSheet.getRange(`${extensionColumns["自然流撬动系数"]}${row}`).formulas = [[
      `=IF(OR(${paid}${row}="",${paid}${row}=0),"",${natural}${row}/${paid}${row})`,
    ]];
    dataSheet.getRange(`${extensionColumns["千次观看用户支付金额（罗盘口径）"]}${row}`).formulas = [[
      `=IFERROR(${sourceColumns.payment}${row}/${sourceColumns.viewCount}${row}*1000,"")`,
    ]];
    const formulaPairs = [
      ["曝光→观看率", sourceColumns.totalViewers, sourceColumns.exposure],
      ["观看→商品曝光率", sourceColumns.productExposure, sourceColumns.totalViewers],
      ["商品曝光→点击率", sourceColumns.productClicks, sourceColumns.productExposure],
      ["商品点击→成交率", sourceColumns.transactions, sourceColumns.productClicks],
      ["曝光→成交率", sourceColumns.transactions, sourceColumns.exposure],
    ];
    for (const [field, numerator, denominator] of formulaPairs) {
      dataSheet.getRange(`${extensionColumns[field]}${row}`).formulas = [[
        `=IFERROR(${numerator}${row}/${denominator}${row},"")`,
      ]];
    }
  }
  dataSheet
    .getRange(
      `${columnName(extensionStart)}2:${dataLastColumn}${dataEndRow}`,
    )
    .format.fill = COLORS.formula;
  dataSheet
    .getRange(`${extensionColumns.live_room_id}2:${extensionColumns.live_room_id}${dataEndRow}`)
    .format.numberFormat = "@";
  dataSheet.freezePanes.freezeRows(1);
  dataSheet.freezePanes.freezeColumns(3);

  const dictionaryHeaders = ["字段", "层级", "来源/公式", "定义", "空值规则"];
  dictionarySheet.getRange("A1:E1").values = [dictionaryHeaders];
  setHeaderStyle(dictionarySheet.getRange("A1:E1"));
  const rows = dictionaryRows();
  dictionarySheet.getRange(`A2:E${rows.length + 1}`).values = rows;
  setBodyStyle(dictionarySheet.getRange(`A2:E${rows.length + 1}`));
  dictionarySheet.freezePanes.freezeRows(1);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(outputPath);
  return {
    outputPath,
    checks: {
      session_count: sessions.length,
      source_column_count: sourceHeaders.length,
      data_column_count: dataHeaders.length,
    },
  };
}
