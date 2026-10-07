import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { useAuth } from '../auth';
import { setAdminCommunity } from '../api';
import { useQuery } from '../hooks';
import { Empty, ErrorBox, Loading, PageHeader } from '../components/ui';
import { AdminInvitations } from './AdminInvitations';
import { AdminMovements } from './AdminMovements';
import { AdminGateDevices } from './AdminGateDevices';
import { AdminSystemStatus } from './AdminSystemStatus';
import { adminSections } from './adminSections';

const communityKey = 'zentry:admin-community';

export function Admin({ path, navigate }: { path: string; navigate: (path: string) => void }) {
  const identity = useAuth().identity;
  const profile = identity?.session.profile;
  // A superadmin administers one fraccionamiento at a time; a community admin only ever has theirs.
  const platform = identity?.user.globalRole === 'SUPERADMIN';
  const sections = adminSections.filter(s => s.path !== '/admin/estado' || profile === 'SUPERADMIN');
  const current = sections.find(section => section.path === path)?.path ?? adminSections[0].path;
  const communities = useQuery<{ data: { id: string; name: string }[] }>(platform ? '/platform/usage' : null);
  const [community, setCommunity] = useState(() => { try { return sessionStorage.getItem(communityKey) ?? ''; } catch { return ''; } });
  const known = !!communities.data?.data.some(c => c.id === community);
  // Set before the sections mount, so their first request already names the fraccionamiento.
  setAdminCommunity(platform && known ? community : null);
  useEffect(() => () => setAdminCommunity(null), []);
  function choose(id: string) { setCommunity(id); try { sessionStorage.setItem(communityKey, id); } catch { /* Optional. */ } }
  const needsCommunity = platform && current !== '/admin/estado';

  return <>
    <PageHeader title="Administración" text="Consulta las visitas que entran y salen, renueva accesos y autoriza los equipos de caseta."/>
    {platform && <div className="admin-community">
      <Building2 size={18}/>
      <label>Fraccionamiento<select value={known ? community : ''} onChange={e => choose(e.target.value)}><option value="">Elige un fraccionamiento</option>{communities.data?.data.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <span>Todo lo que ves aquí es solo de este fraccionamiento.</span>
    </div>}
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
    <ErrorBox message={communities.error} retry={communities.refresh}/>
    {needsCommunity && !known ? (communities.loading ? <Loading/> : <section className="panel"><Empty icon={<Building2/>} title="Elige un fraccionamiento" text="Cada fraccionamiento se administra por separado: sus residentes, casetas y movimientos nunca se mezclan con los de otro."/></section>) :
      <div key={`${current}:${community}`} className="page-enter">
        {current === '/admin/movimientos' ? <AdminMovements/> : current === '/admin/invitaciones' ? <AdminInvitations/> :
          current === '/admin/dispositivos' ? <AdminGateDevices/> : <AdminSystemStatus/>}
      </div>}
  </>;
}
