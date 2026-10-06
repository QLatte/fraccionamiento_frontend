import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { api, errorText } from '../api';
import { Button, ErrorBox, Info, Success } from '../components/ui';
import { readWorkbook, templateCsv, type Sheet } from '../spreadsheet';
import type { ImportResult, Preview } from './platformTypes';

// Superadmins load the residents spreadsheet each fraccionamiento sends. The API
// detects the layout and shows a preview; nothing is written until "Importar".
export function PlatformImport({ communityId, emailEnabled, onImported }: { communityId: string; emailEnabled: boolean; onImported: (queued: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState(''); const [sheets, setSheets] = useState<Sheet[] | null>(null); const [preview, setPreview] = useState<Preview | null>(null);
  const [sendInvites, setSendInvites] = useState(emailEnabled); const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [result, setResult] = useState<ImportResult | null>(null);

  async function choose(selected: File | undefined) {
    if (!selected) return;
    setBusy('read'); setError(''); setPreview(null); setResult(null); setFile(selected.name);
    try {
      const read = await readWorkbook(selected);
      setSheets(read);
      setPreview(await api<Preview>(`/platform/communities/${communityId}/import/preview`, { method: 'POST', body: { sheets: read } }));
    } catch (e) { setError(errorText(e)); setSheets(null); } finally { setBusy(''); if (input.current) input.current.value = ''; }
  }
  async function commit() {
    if (!sheets) return;
    setBusy('import'); setError('');
    try {
      const imported = await api<ImportResult>(`/platform/communities/${communityId}/import`, { method: 'POST', body: { sheets, sendInvites: sendInvites && emailEnabled } });
      setResult(imported); setPreview(null); setSheets(null); onImported(imported.queued);
    } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  }
  function template() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' })); a.download = 'plantilla-residentes-zentry.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  const errors = preview?.issues.filter(i => i.level === 'error') ?? [];
  const warnings = preview?.issues.filter(i => i.level === 'warning') ?? [];
  const s = preview?.summary;
  return <div className="platform-import">
    <div className="platform-section-heading"><div><h3>Importar residentes desde Excel</h3><p className="small">Acepta el formato del fraccionamiento (privada o lote, número de casa, nombres y correos de los habitantes, aunque vengan varios en una celda) o la plantilla de Zentry. Privadas y lotes pueden venir mezclados, en bloques o en varias hojas. Solo agrega: no borra casas ni personas que falten en el archivo.</p></div>
      <Button className="secondary" onClick={template}><Download size={17}/> Descargar plantilla</Button></div>
    <input ref={input} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={e => void choose(e.target.files?.[0])}/>
    <Button busy={busy === 'read'} disabled={!!busy} onClick={() => input.current?.click()}><Upload size={17}/> {file && !result ? 'Elegir otro archivo' : 'Elegir archivo .xlsx o .csv'}</Button>
    {file && busy !== 'read' && !result && <p className="small"><FileSpreadsheet size={15}/> {file}</p>}
    <ErrorBox message={error}/>
    {result && <Success>Importado: {result.counts.newHouses} casas nuevas, {result.counts.newPeople} personas nuevas{result.counts.newSections ? `, ${result.counts.newSections} privadas o lotes nuevos` : ''}. {result.queued ? `Enviando ${result.queued} invitaciones por correo; el avance aparece abajo.` : result.pending ? `${result.pending} personas aún no tienen invitación.` : ''}</Success>}
    {preview && s && <div className="import-preview">
      <div className="import-stats">
        <div><strong>{s.privadas}</strong><small>{s.privadas === 1 ? 'privada' : 'privadas'}</small></div>
        <div><strong>{s.lotes}</strong><small>{s.lotes === 1 ? 'lote' : 'lotes'}</small></div>
        <div><strong>{s.houses}</strong><small>casas · {preview.counts.newHouses} nuevas</small></div>
        <div><strong>{s.residents}</strong><small>residentes · {preview.counts.newPeople} nuevos</small></div>
        <div className={s.extraResidents ? 'extra' : ''}><strong>{s.extraResidents}</strong><small>extra en {s.extraHouses} {s.extraHouses === 1 ? 'casa' : 'casas'}</small></div>
      </div>
      {!!errors.length && <div className="error-box" role="alert"><div><strong>Corrige estos errores en el archivo y vuelve a elegirlo:</strong><ul>{errors.map((issue, i) => <li key={i}>{where(issue)}{issue.message}</li>)}</ul></div></div>}
      {!!warnings.length && <details className="import-warnings"><summary>{warnings.length} {warnings.length === 1 ? 'aviso' : 'avisos'}</summary><ul>{warnings.map((issue, i) => <li key={i}>{where(issue)}{issue.message}</li>)}</ul></details>}
      <div className="platform-table import-table"><table><thead><tr><th>Vivienda</th><th>Residentes</th><th>Teléfonos</th></tr></thead><tbody>
        {preview.sections.flatMap(section => section.houses.map(house => <tr key={house.label}>
          <td data-label="Vivienda"><strong>{house.label}</strong>{!house.propertyId && <><br/><span className="badge used"><span/>Nueva</span></>}</td>
          <td data-label="Residentes">{house.residents.map(r => <div key={r.email}>{r.fullName} · <span className="muted">{r.email}</span>{!r.member && <span className="muted"> · alta nueva</span>}</div>)}{house.extra > 0 && <span className="badge expired"><span/>+{house.extra} extra</span>}</td>
          <td data-label="Teléfonos">{house.deviceLimit}</td>
        </tr>))}
      </tbody></table></div>
      <label className="checkbox-label"><input type="checkbox" checked={sendInvites && emailEnabled} disabled={!emailEnabled} onChange={e => setSendInvites(e.target.checked)}/> Enviar al importar la invitación por correo a quien aún no tiene acceso (vence en 72 horas).</label>
      {!emailEnabled && <Info>Los correos no están configurados: podrás enviarlos después desde la lista de residentes.</Info>}
      <Button busy={busy === 'import'} disabled={!preview.canImport || !!busy} onClick={() => void commit()}>Importar {s.houses} {s.houses === 1 ? 'casa' : 'casas'}</Button>
    </div>}
  </div>;
}

const where = (issue: { sheet: string; row: number }) => issue.row ? `${issue.sheet ? `${issue.sheet}, ` : ''}fila ${issue.row}: ` : issue.sheet ? `${issue.sheet}: ` : '';
