import AnimatedUserPlus from '../components/icons/AnimatedUserPlus';
import AnimatedPhoneVolume from '../components/icons/AnimatedPhoneVolume';
import AnimatedRefresh from '../components/icons/AnimatedRefresh';
import AnimatedHistoryCircle from '../components/icons/AnimatedHistoryCircle';

// Kept apart from Admin.tsx so routing can read it without loading the admin pages.
export const adminSections = [
  { path: '/admin/movimientos', label: 'Movimientos', Icon: AnimatedHistoryCircle },
  { path: '/admin/invitaciones', label: 'Renovar accesos', Icon: AnimatedUserPlus },
  { path: '/admin/dispositivos', label: 'Casetas', Icon: AnimatedPhoneVolume },
  { path: '/admin/estado', label: 'Estado del sistema', Icon: AnimatedRefresh },
] as const;
