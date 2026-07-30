import { loadArtifactTool } from "./runtime.mjs";

const EXPECTED_SHEETS = [
  "场次核心明细",
  "周报汇总",
  "数据底表",
  "数据字典",
];
const FORMULA_ERRORS = ["#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#N/A"];

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function verifyWeeklyReport({
  outputPath,
  expectedSourceHeaders,
  expectedSourceRows,
  expectedSessionCount,
}) {
  const errors = [];
  const { FileBlob, SpreadsheetFile } = await loadArtifactTool();
  const input = await FileBlob.load(outputPath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const sheetNames = workbook.worksheets.items.map((sheet) => sheet.name);
  if (!valuesEqual(sheetNames, EXPECTED_SHEETS)) {
    errors.push(`Unexpected sheet order: ${sheetNames.join(", ")}`);
  }

  const dataSheet = workbook.worksheets.getItem("数据底表");
  const used = dataSheet.getUsedRange();
  const values = used.values;
  const formulas = used.formulas;
  const sourceWidth = expectedSourceHeaders.length;
  const actualHeaders = values[0].slice(0, sourceWidth);
  const actualSourceRows = values
    .slice(1, expectedSessionCount + 1)
    .map((row) => row.slice(0, sourceWidth));
  if (!valuesEqual(actualHeaders, expectedSourceHeaders)) {
    errors.push("Source headers changed");
  }
  if (!valuesEqual(actualSourceRows, expectedSourceRows)) {
    errors.push("Source cell values changed");
  }

  const serialized = JSON.stringify({ values, formulas });
  const formulaErrors = FORMULA_ERRORS.filter((token) =>
    serialized.includes(token),
  );
  if (formulaErrors.length > 0) {
    errors.push(`Formula errors: ${formulaErrors.join(", ")}`);
  }
  const formulaCount = formulas.flat().filter(Boolean).length;
  if (formulaCount === 0) {
    errors.push("No data formulas were written");
  }

  return {
    ok: errors.length === 0,
    errors,
    checks: {
      sheet_names: sheetNames,
      data_row_count: values.length - 1,
      data_column_count: values[0]?.length ?? 0,
      data_formula_count: formulaCount,
      formula_error_count: formulaErrors.length,
    },
  };
}
