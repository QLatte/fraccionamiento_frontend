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

const W = 1080, PAD = 72, CARD_X = 48, INNER = W - 2 * (CARD_X + PAD);
const colors = { page: '#e9f1f4', card: '#ffffff', brand: '#123c4a', ink: '#182f39', muted: '#536873', line: '#dce5e9', soft: '#f2f7f9' };

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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath();
  // roundRect is missing before Safari 16; square corners are an acceptable fallback.
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

/** Draws a shareable pass card (brand header, guest, QR, validity, location) as a PNG. */
export async function renderPassCard(url: string, pass: PassSummary, place?: PassPlace): Promise<Blob> {
  await document.fonts?.ready;
  const family = fontFamily();
  const validity = validityLines(pass);
  const qrSize = 620;
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, url, { width: qrSize, margin: 2, errorCorrectionLevel: 'M', color: { dark: colors.brand, light: '#ffffff' } });

  // Layout top to bottom; the canvas height follows the content.
  const header = 190, nameBlock = 150, sectionGap = 44, lineH = 50, labelH = 44, footer = 120;
  const validityH = labelH + validity.length * lineH;
  const placeH = place ? sectionGap + labelH + 2 * lineH : 0;
  const cardH = header + nameBlock + qrSize + 40 + validityH + placeH + 56 + footer;
  const H = cardH + 2 * CARD_X;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = colors.page; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.shadowColor = '#123c4a26'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
  ctx.fillStyle = colors.card; roundRect(ctx, CARD_X, CARD_X, W - 2 * CARD_X, cardH, 44); ctx.fill(); ctx.restore();

  // Header band
  ctx.save(); roundRect(ctx, CARD_X, CARD_X, W - 2 * CARD_X, cardH, 44); ctx.clip();
  ctx.fillStyle = colors.brand; ctx.fillRect(CARD_X, CARD_X, W - 2 * CARD_X, header);
  ctx.restore();
  const left = CARD_X + PAD;
  ctx.fillStyle = '#ffffff'; ctx.font = `700 64px ${family}`; ctx.fillText('Zentry', left, CARD_X + 104);
  ctx.fillStyle = '#e6b85c'; ctx.fillText('.', left + ctx.measureText('Zentry').width, CARD_X + 104);
  ctx.fillStyle = '#d5e8ef'; ctx.font = `500 32px ${family}`; ctx.fillText('Pase de visita', left, CARD_X + 150);

  // Guest
  let y = CARD_X + header + 96;
  ctx.fillStyle = colors.ink; ctx.textAlign = 'center';
  ctx.fillText(fitText(ctx, pass.guestName, 700, 64, 40, INNER, family), W / 2, y);
  ctx.fillStyle = colors.muted; ctx.font = `400 30px ${family}`; ctx.fillText('Visitante', W / 2, y + 44);

  // QR
  y = CARD_X + header + nameBlock;
  ctx.drawImage(qr, (W - qrSize) / 2, y, qrSize, qrSize);
  y += qrSize + 40;

  // Validity and location
  ctx.textAlign = 'left';
  ctx.strokeStyle = colors.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(W - left, y); ctx.stroke();
  const section = (label: string, lines: string[], top: number) => {
    ctx.fillStyle = colors.muted; ctx.font = `600 28px ${family}`; ctx.fillText(label.toUpperCase(), left, top + 34);
    lines.forEach((line, index) => {
      ctx.fillStyle = index === 0 ? colors.brand : colors.ink;
      ctx.fillText(fitText(ctx, line, index === 0 ? 700 : 500, 36, 26, INNER, family), left, top + labelH + (index + 1) * lineH - 12);
    });
  };
  section('Válido', validity, y + 12);
  if (place) section('Ubicación', [place.address, place.community], y + 12 + validityH + sectionGap);

  // Footer
  const footerTop = CARD_X + cardH - footer;
  ctx.save(); roundRect(ctx, CARD_X, CARD_X, W - 2 * CARD_X, cardH, 44); ctx.clip();
  ctx.fillStyle = colors.soft; ctx.fillRect(CARD_X, footerTop, W - 2 * CARD_X, footer);
  ctx.restore();
  ctx.fillStyle = colors.brand; ctx.font = `600 32px ${family}`; ctx.textAlign = 'center';
  ctx.fillText('Presenta este QR en la caseta', W / 2, footerTop + 72);

  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen del pase.')), 'image/png'));
}

export function passFileName(name: string) {
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `pase-zentry${slug ? '-' + slug : ''}.png`;
}
