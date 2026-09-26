import { useAuth } from '../auth';
import { PageHeader } from '../components/ui';
import { AdminInvitations } from './AdminInvitations';
import { AdminGateDevices } from './AdminGateDevices';
import { AdminSystemStatus } from './AdminSystemStatus';
import { adminSections } from './adminSections';

export function Admin({ path, navigate }: { path: string; navigate: (path: string) => void }) {
  const useRole = useAuth().identity?.session.profile;
  const sections = adminSections.filter(s => s.path !== '/admin/estado' || useRole === 'SUPERADMIN');
  const current = sections.find(section => section.path === path)?.path ?? adminSections[0].path;

  return <>
    <PageHeader title="Administración" text="Crea invitaciones, autoriza equipos y consulta el estado del sistema."/>
    <nav className="admin-tabs admin-section-nav" aria-label="Secciones de administración">
      {sections.map(({ path: destination, label, Icon }) =>
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
    <div key={current} className="page-enter">
      {current === '/admin/invitaciones' ? <AdminInvitations/> :
        current === '/admin/dispositivos' ? <AdminGateDevices/> : <AdminSystemStatus/>}
    </div>
  </>;
}
