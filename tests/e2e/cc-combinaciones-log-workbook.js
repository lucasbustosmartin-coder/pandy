// @ts-check
/**
 * Workbook único para logs E2E de combinaciones CC: `test-results/cc-combinaciones-log.xlsx`.
 * Cada hoja se reemplaza al guardar; las demás hojas del archivo se conservan (p. ej. Pasos/Trans/Caja de 91).
 */
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const CC_COMBINACIONES_LOG = path.join(process.cwd(), 'test-results', 'cc-combinaciones-log.xlsx');

function ensureDir() {
  const d = path.dirname(CC_COMBINACIONES_LOG);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

/**
 * Carga el workbook unificado o devuelve uno vacío.
 * @returns {import('xlsx').WorkBook}
 */
function loadSuiteWorkbook() {
  ensureDir();
  if (fs.existsSync(CC_COMBINACIONES_LOG)) {
    try {
      const wb = XLSX.readFile(CC_COMBINACIONES_LOG);
      if (!Array.isArray(wb.SheetNames)) {
        wb.SheetNames = Object.keys(wb.Sheets || {});
      }
      if (!wb.Sheets) wb.Sheets = Object.create(null);
      return wb;
    } catch (_) {
      /* archivo corrupto: nuevo */
    }
  }
  return XLSX.utils.book_new();
}

/**
 * Reemplaza una hoja por nombre y persiste (mantiene el resto).
 * @param {string} sheetName
 * @param {any[][]} rowsAoa - al menos encabezado + 1 fila de datos
 */
function writeSuiteSheet(sheetName, rowsAoa) {
  if (!sheetName || !rowsAoa || rowsAoa.length < 2) return;
  const wb = loadSuiteWorkbook();
  if (!wb.Sheets) wb.Sheets = Object.create(null);
  if (!Array.isArray(wb.SheetNames)) wb.SheetNames = [];
  wb.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(rowsAoa);
  if (!wb.SheetNames.includes(sheetName)) wb.SheetNames.push(sheetName);
  XLSX.writeFile(wb, CC_COMBINACIONES_LOG);
}

module.exports = {
  CC_COMBINACIONES_LOG,
  loadSuiteWorkbook,
  writeSuiteSheet,
};
