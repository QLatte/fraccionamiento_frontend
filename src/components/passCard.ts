import QRCode from 'qrcode';
import type { Pass } from '../types';

export type PassSummary = Pick<Pass, 'guestName' | 'passType' | 'validFrom' | 'validUntil' | 'recurrenceRule' | 'windowSeconds' | 'timezone'>;
export type PassPlace = { address: string; community: string };

const weekdayNames: Record<string, string> = { MO: 'Lun', TU: 'Mar', WE: 'Mié', TH: 'Jue', FR: 'Vie', SA: 'Sáb', SU: 'Dom' };
const typeNames: Record<Pass['passType'], string> = { SINGLE_USE: 'Una visita', TEMPORARY: 'Por un periodo', RECURRING: 'Visita recurrente' };

/** Human validity, in the pass's own time zone: first line is the pass type. */
export function validityLines(pass: PassSummary): string[] {
  const format = (iso: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', { timeZone: pass.timezone, ...options }).format(new Date(iso));
  const day = (iso: string) => format(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = (iso: string) => format(iso, { hour: 'numeric', minute: '2-digit' });
  if (pass.passType === 'RECURRING') {
    const days = /BYDAY=([A-Z,]+)/.exec(pass.recurrenceRule ?? '')?.[1].split(',').map(d => weekdayNames[d] ?? d).join(', ') ?? 'Días programados';
    return [typeNames.RECURRING, `${days} · desde las ${time(pass.validFrom)}`, `Acceso durante ${Math.round(pass.windowSeconds / 60)} min`, `Del ${format(pass.validFrom, { day: 'numeric', month: 'short' })} al ${format(pass.validUntil, { day: 'numeric', month: 'short', year: 'numeric' })}`];
  }
  const sameDay = day(pass.validFrom) === day(pass.validUntil);
  return [typeNames[pass.passType], ...(sameDay
    ? [day(pass.validFrom), `De ${time(pass.validFrom)} a ${time(pass.validUntil)}`]
    : [`Desde ${day(pass.validFrom)}, ${time(pass.validFrom)}`, `Hasta ${day(pass.validUntil)}, ${time(pass.validUntil)}`])];
}

const W = 1080, MARGIN = 56, PAD = 72, CARD_W = W - 2 * MARGIN, INNER = CARD_W - 2 * PAD;
const colors = {
  deep: '#0b2a35', brand: '#123c4a', teal: '#2a7389', sun: '#e6b85c', sunInk: '#5c4210',
  ink: '#182f39', muted: '#5d7380', line: '#d6e2e7', soft: '#eef5f7', card: '#ffffff',
};
// Pass-type badge colors: gold for one-off visits, teal for periods, violet-blue for recurring.
const badge: Record<Pass['passType'], { bg: string; fg: string }> = {
  SINGLE_USE: { bg: '#fbefd3', fg: '#7a5712' },
  TEMPORARY: { bg: '#dcf0f5', fg: '#16566a' },
  RECURRING: { bg: '#e6e8fb', fg: '#3a4390' },
};
// Lucide outlines (24×24) drawn with Path2D so the image matches the app's icons.
const icons = {
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  pin: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  shield: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9 12l2 2 4-4',
};

function fontFamily() {
  const css = getComputedStyle(document.documentElement);
  return (css.getPropertyValue('--display').trim() || getComputedStyle(document.body).fontFamily || 'sans-serif');
}

/** Shrinks, then truncates, a single line so it fits `width`. */
function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, min: number, width: number, family: string) {
  let current = size;
  do { ctx.font = `${weight} ${current}px ${family}`; if (ctx.measureText(text).width <= width) return text; current -= 2; } while (current >= min);
  let cut = text;
  while (cut.length > 1 && ctx.measureText(cut + '…').width > width) cut = cut.slice(0, -1);
  return cut + '…';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  // roundRect is missing before Safari 16; square corners are an acceptable fallback.
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

function icon(ctx: CanvasRenderingContext2D, path: string, x: number, y: number, size: number, color: string) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(path)); ctx.restore();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'transparent');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
}

/** Draws a shareable ticket-style pass (guest, QR, validity, location) as a PNG. */
export async function renderPassCard(url: string, pass: PassSummary, place?: PassPlace): Promise<Blob> {
  await document.fonts?.ready;
  const family = fontFamily();
  const [typeName, ...validity] = validityLines(pass);
  const qrSize = 580;
  const qr = document.createElement('canvas');
  // The QR stays dark-on-white with a quiet zone so gate scanners read it reliably.
  await QRCode.toCanvas(qr, url, { width: qrSize, margin: 2, errorCorrectionLevel: 'M', color: { dark: colors.deep, light: '#ffffff' } });

  // Vertical layout; the canvas height follows the content.
  const top = 200;                       // brand row above the ticket
  const headH = 210;                     // guest name + type badge
  const qrBlock = qrSize + 2 * 36;       // QR with its frame
  const perfGap = 84;                    // perforation between QR and details
  const lineH = 48;
  const section = (lines: number) => 44 + lines * lineH;
  const detailsH = section(validity.length) + (place ? 40 + section(2) : 0);
  const footH = 132;
  const cardH = headH + qrBlock + perfGap + detailsH + 48 + footH;
  const H = top + cardH + 120;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background: deep brand gradient with soft gold and teal glows.
  const bg = ctx.createLinearGradient(0, 0, W * .6, H);
  bg.addColorStop(0, colors.deep); bg.addColorStop(.55, colors.brand); bg.addColorStop(1, colors.teal);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  glow(ctx, W - 80, 90, 420, '#e6b85c55');
  glow(ctx, 60, H - 160, 520, '#4fb3cc40');
  glow(ctx, W * .55, H * .45, 380, '#ffffff10');

  // Brand row: wordmark and a gold "pass" pill.
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff'; ctx.font = `700 66px ${family}`; ctx.fillText('Zentry', MARGIN + 8, 128);
  const mark = ctx.measureText('Zentry').width;
  ctx.fillStyle = colors.sun; ctx.fillText('.', MARGIN + 8 + mark, 128);
  ctx.font = `700 26px ${family}`;
  const pillText = 'PASE DE VISITA', pillW = ctx.measureText(pillText).width + 48;
  ctx.fillStyle = colors.sun; roundRect(ctx, W - MARGIN - pillW, 84, pillW, 56, 28); ctx.fill();
  ctx.fillStyle = colors.sunInk; ctx.textAlign = 'center'; ctx.fillText(pillText, W - MARGIN - pillW / 2, 121);

  // Ticket drawn on its own layer so the side notches can be punched through.
  const ticket = document.createElement('canvas');
  ticket.width = CARD_W; ticket.height = cardH;
  const t = ticket.getContext('2d')!;
  t.fillStyle = colors.card; roundRect(t, 0, 0, CARD_W, cardH, 44); t.fill();
  const perfY = headH + qrBlock + perfGap / 2;
  t.globalCompositeOperation = 'destination-out';
  for (const x of [0, CARD_W]) { t.beginPath(); t.arc(x, perfY, 30, 0, Math.PI * 2); t.fill(); }
  t.globalCompositeOperation = 'source-over';

  // Guest name and pass-type badge.
  t.textAlign = 'center'; t.textBaseline = 'alphabetic';
  t.fillStyle = colors.muted; t.font = `600 26px ${family}`; t.fillText('VISITANTE', CARD_W / 2, 78);
  t.fillStyle = colors.ink; t.fillText(fitText(t, pass.guestName, 700, 66, 40, INNER, family), CARD_W / 2, 146);
  const tone = badge[pass.passType];
  t.font = `700 28px ${family}`;
  const badgeW = t.measureText(typeName).width + 52;
  t.fillStyle = tone.bg; roundRect(t, (CARD_W - badgeW) / 2, 166, badgeW, 48, 24); t.fill();
  t.fillStyle = tone.fg; t.fillText(typeName, CARD_W / 2, 200);

  // QR with focus corners.
  const qrX = (CARD_W - qrSize) / 2, qrY = headH + 36;
  t.drawImage(qr, qrX, qrY, qrSize, qrSize);
  const c = 22, arm = 64, lw = 10;
  t.strokeStyle = colors.sun; t.lineWidth = lw; t.lineCap = 'round';
  for (const [x, y, dx, dy] of [[qrX - c, qrY - c, 1, 1], [qrX + qrSize + c, qrY - c, -1, 1], [qrX - c, qrY + qrSize + c, 1, -1], [qrX + qrSize + c, qrY + qrSize + c, -1, -1]]) {
    t.beginPath(); t.moveTo(x, y + dy * arm); t.lineTo(x, y); t.lineTo(x + dx * arm, y); t.stroke();
  }

  // Perforation.
  t.strokeStyle = colors.line; t.lineWidth = 4; t.lineCap = 'round'; t.setLineDash([2, 18]);
  t.beginPath(); t.moveTo(52, perfY); t.lineTo(CARD_W - 52, perfY); t.stroke(); t.setLineDash([]);

  // Details: validity and location with icon chips.
  t.textAlign = 'left';
  const detail = (path: string, label: string, lines: string[], y0: number) => {
    t.fillStyle = colors.soft; roundRect(t, PAD, y0, 76, 76, 22); t.fill();
    icon(t, path, PAD + 20, y0 + 20, 36, colors.brand);
    const x = PAD + 104, width = INNER - 104;
    t.fillStyle = colors.muted; t.font = `700 24px ${family}`; t.fillText(label, x, y0 + 30);
    lines.forEach((line, index) => {
      t.fillStyle = index === 0 ? colors.brand : colors.ink;
      t.fillText(fitText(t, line, index === 0 ? 700 : 500, 34, 24, width, family), x, y0 + 44 + (index + 1) * lineH - 10);
    });
  };
  let y = headH + qrBlock + perfGap;
  detail(icons.calendar, 'VÁLIDO', validity, y);
  y += section(validity.length) + 40;
  if (place) detail(icons.pin, 'UBICACIÓN', [place.address, place.community], y);

  // Footer band.
  const footY = cardH - footH;
  t.save(); roundRect(t, 0, 0, CARD_W, cardH, 44); t.clip();
  // Gold, not brand blue, so the ticket keeps its outline against the dark background.
  t.fillStyle = colors.sun; t.fillRect(0, footY, CARD_W, footH);
  t.restore();
  t.font = `700 32px ${family}`;
  const footText = 'Presenta este QR en la caseta', footW = t.measureText(footText).width + 56;
  icon(t, icons.shield, (CARD_W - footW) / 2, footY + footH / 2 - 20, 40, colors.sunInk);
  t.fillStyle = colors.sunInk; t.fillText(footText, (CARD_W - footW) / 2 + 56, footY + footH / 2 + 11);

  // Place the ticket with a soft shadow.
  ctx.save(); ctx.shadowColor = '#00000059'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
  ctx.drawImage(ticket, MARGIN, top); ctx.restore();

  ctx.textAlign = 'center'; ctx.fillStyle = '#ffffffb3'; ctx.font = `500 26px ${family}`;
  ctx.fillText('Acceso seguro con Zentry', W / 2, top + cardH + 72);

  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen del pase.')), 'image/png'));
}

export function passFileName(name: string) {
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `pase-zentry${slug ? '-' + slug : ''}.png`;
}
