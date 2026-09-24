import { Activity } from 'lucide-react';
import { PageHeader } from '../components/ui';
import AnimatedUserPlus from '../components/icons/AnimatedUserPlus';
import AnimatedPhoneVolume from '../components/icons/AnimatedPhoneVolume';
import { AdminInvitations } from './AdminInvitations';
import { AdminGateDevices } from './AdminGateDevices';
import { AdminSystemStatus } from './AdminSystemStatus';

export const adminSections = [
  { path: '/admin/invitaciones', label: 'Invitaciones', Icon: AnimatedUserPlus },
  { path: '/admin/dispositivos', label: 'Dispositivos de caseta', Icon: AnimatedPhoneVolume },
  { path: '/admin/estado', label: 'Estado del sistema', Icon: Activity },
] as const;

export function Admin({ path, navigate }: { path: string; navigate: (path: string) => void }) {
  const current = adminSections.find(section => section.path === path)?.path ?? adminSections[0].path;

  return <>
    <PageHeader title="Administración" text="Crea invitaciones, autoriza equipos y consulta el estado del sistema."/>
    <nav className="admin-tabs admin-section-nav" aria-label="Secciones de administración">
      {adminSections.map(({ path: destination, label, Icon }) =>
        <button
          key={destination}
          type="button"
          className={current === destination ? 'active' : ''}
          aria-current={current === destination ? 'page' : undefined}
          onClick={() => navigate(destination)}
        >
          <Icon size={17}/>{label}
        </button>
      )}
    </nav>
    {current === '/admin/invitaciones' ? <AdminInvitations/> :
      current === '/admin/dispositivos' ? <AdminGateDevices/> : <AdminSystemStatus/>}
  </>;
}
