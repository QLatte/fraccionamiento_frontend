import { Ambulance, Building2, DoorOpen, Flame, Phone, PhoneCall, ShieldAlert, Siren, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth';
import { useQuery } from '../hooks';
import type { SupportContact } from '../types';
import { Empty, ErrorBox, PageHeader } from '../components/ui';

/** An icon that matches what the contact is, read from its name. */
export function contactIcon(label: string): LucideIcon {
  const l = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/bombero|incendio/.test(l)) return Flame;
  if (/ambulancia|cruz roja|medic|hospital/.test(l)) return Ambulance;
  if (/patrulla|policia|seguridad|vigilancia/.test(l)) return Siren;
  if (/caseta|porton|acceso|guardia/.test(l)) return DoorOpen;
  if (/admin|oficina|mesa directiva/.test(l)) return Building2;
  return Phone;
}

/** "5512345678" → "55 1234 5678"; other numbers (911, with country code) stay as stored. */
export const phoneText = (phone: string) => /^\d{10}$/.test(phone) ? `${phone.slice(0, 2)} ${phone.slice(2, 6)} ${phone.slice(6)}` : phone;

// tel: links hand the call to the phone: Android dials right away and iOS asks to confirm.
function ContactRow({ label, phone, Icon, urgent }: { label: string; phone: string; Icon: LucideIcon; urgent?: boolean }) {
  return <li>
    <a href={`tel:${phone}`} aria-label={`Llamar a ${label}, ${phoneText(phone)}`}
      className={`flex min-h-[72px] items-center gap-4 rounded-2xl border px-4 py-3 no-underline shadow-[0_2px_0_rgba(24,47,57,.05)] transition-transform duration-150 active:scale-[.98] ${urgent ? 'border-[#e8c3c7] bg-[#fdf1f2]' : 'border-[var(--line)] bg-white hover:border-[#b9cbd3]'}`}>
      <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${urgent ? 'bg-[var(--danger)] text-white' : 'bg-[var(--soft)] text-[var(--brand)]'}`}><Icon size={22}/></span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[16px] font-semibold ${urgent ? 'text-[var(--danger)]' : 'text-[var(--ink)]'}`}>{label}</span>
        <span className="block text-[15px] tracking-wide text-[var(--muted)] tabular-nums">{phoneText(phone)}</span>
      </span>
      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${urgent ? 'bg-[var(--danger)] text-white' : 'bg-[var(--brand)] text-white'}`}><PhoneCall size={18}/></span>
    </a>
  </li>;
}

/** Teléfonos de apoyo: the fraccionamiento's numbers, one tap to call. */
export function SupportPhones() {
  const { property } = useAuth();
  const contacts = useQuery<{ data: SupportContact[] }>(`/support-contacts?propertyId=${property!.id}`);
  const list = contacts.data?.data ?? [];
  return <>
    <PageHeader title="Teléfonos de apoyo" text="Toca un contacto para llamar."/>
    <div className="mx-auto w-full max-w-[640px]">
      <ul className="m-0 grid list-none gap-3 p-0">
        <ContactRow label="Emergencias" phone="911" Icon={ShieldAlert} urgent/>
      </ul>
      <div className="mb-3 mt-6 flex items-center justify-between px-1 text-[13px] font-semibold uppercase tracking-[.08em] text-[var(--muted)]">
        <span>{property!.cluster.community?.name ?? 'Tu fraccionamiento'}</span>
        {!!list.length && <span className="font-normal normal-case tracking-normal">{list.length === 1 ? '1 contacto' : `${list.length} contactos`}</span>}
      </div>
      <ErrorBox message={contacts.error} retry={contacts.refresh}/>
      {contacts.loading && !contacts.data
        ? <ul className="m-0 grid list-none gap-3 p-0" aria-hidden="true">{[0, 1, 2].map(i => <li key={i} className="h-[72px] animate-pulse rounded-2xl bg-[var(--soft)]"/>)}</ul>
        : !list.length && !contacts.error
          ? <section className="panel"><Empty icon={<Phone/>} title="Aún no hay teléfonos" text="Administración todavía no publica los teléfonos del fraccionamiento."/></section>
          : <ul className="m-0 grid list-none gap-3 p-0">{list.map(c => <ContactRow key={c.id} label={c.label} phone={c.phone} Icon={contactIcon(c.label)}/>)}</ul>}
      <p className="mt-5 px-1 text-[13px] text-[var(--muted)]">En iPhone se te pedirá confirmar la llamada.</p>
    </div>
  </>;
}
