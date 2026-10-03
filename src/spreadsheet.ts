// Reads the residents spreadsheet in the browser and sends the raw cells to the API,
// which detects the layout (privadas and lotes, one or more blocks) and validates it.
export type Cell = string | number | boolean | null;
export type Sheet = { name: string; rows: Cell[][] };

const MAX_COLUMNS = 60;

function clean(rows: unknown[][]): Cell[][] {
  const out = rows.map(row => row.slice(0, MAX_COLUMNS).map(cell => cell instanceof Date ? cell.toISOString().slice(0, 10) : cell === undefined ? null : cell as Cell));
  while (out.length && out[out.length - 1].every(cell => cell === null || cell === '')) out.pop();
  return out;
}

/** Minimal CSV reader (quotes, "" escapes, line breaks inside quotes; comma or semicolon). */
export function parseCsv(text: string): Cell[][] {
  const source = text.replace(/^﻿/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const separator = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: Cell[][] = []; let row: Cell[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === separator) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(value => value === '' ? null : value));
}

export async function readWorkbook(file: File): Promise<Sheet[]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return [{ name: file.name.replace(/\.csv$/i, ''), rows: clean(parseCsv(await file.text())) }];
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Usa un archivo .xlsx o .csv. Si es .xls, ábrelo en Excel y guárdalo como .xlsx.');
  const { default: readExcelFile } = await import('read-excel-file/browser');
  const sheets = await readExcelFile(file);
  return sheets.map(sheet => ({ name: sheet.sheet, rows: clean(sheet.data as unknown[][]) })).filter(sheet => sheet.rows.length);
}

/** The suggested layout, as CSV so Excel opens it without extra libraries. */
export function templateCsv() {
  const rows = [
    ['Tipo', 'Privada o lote', 'Casa', 'Habitante 1', 'Correo 1', 'Habitante 2', 'Correo 2'],
    ['Privada', 'Roble', '12', 'Juan Pérez López', 'juan@correo.com', 'Ana Ruiz Gómez', 'ana@correo.com'],
    ['Lote', '5', '3', 'Luis Mora', 'luis@correo.com', '', ''],
  ];
  return '﻿' + rows.map(row => row.map(value => /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join(',')).join('\r\n');
}
