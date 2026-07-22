// Genera una BODEGA.xls sintética para probar migrar-bodega.ts sin datos reales.
import * as XLSX from 'xlsx';

const libro = XLSX.utils.book_new();

function hoja(nombre: string, unidad: string, filas: unknown[][]) {
  const datos = [['货号', unidad, '码段', '入库', '出库', '实存', '区域'], ...filas];
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(datos), nombre);
}

hoja('nino', '双数', [
  ['B100', 12, '30-35', 10, 3, 7, '1-4'],
  ['B200', 24, '26-30', 5, 2, 3, '1-3 (2)M3(1)'],
  ['B300', 12, '31-36', 9, 2, 7, '1-3 (2)M3(1)'], // no cuadra -> POR-CONFIRMAR
  ['入库总数', '', '', 24, 7, 17, ''],
]);
hoja('juvenli', '双数', [
  ['J100', 36, '36-40', 4, 0, 4, 'M2-4'],
  ['合计', '', '', 4, 0, 4, ''],
]);
hoja('adulto', '双数', [
  ['A100', 12, '40-45', 6, 6, 0, '2-1'], // sin stock: solo catálogo
  ['80013', 24, '39-44', 3, 1, 2, '???'], // zona ilegible -> POR-CONFIRMAR
]);
hoja('ropa', '件数', [['R100', 50, 'M-2XL', 2, 0, 2, '3-8']]);

XLSX.writeFile(libro, process.argv[2] ?? 'datos/BODEGA-prueba.xls', { bookType: 'xls' });
console.log('Planilla de prueba generada');
