import * as XLSX from 'xlsx';

/**
 * Recibe un objeto con hojas y genera/descarga el archivo Excel.
 * @param {string} nombreArchivo
 * @param {Object} hojasObj - Diccionario de clave (nombre hoja) a valor (array of arrays, AOA).
 */
export function generarArchivoExcel(nombreArchivo, hojasObj) {
  const wb = XLSX.utils.book_new();
  for (const [nombreHoja, aoa] of Object.entries(hojasObj)) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  }
  XLSX.writeFile(wb, nombreArchivo);
}
