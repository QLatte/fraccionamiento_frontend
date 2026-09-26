import AnimatedUserPlus from '../components/icons/AnimatedUserPlus';
import AnimatedPhoneVolume from '../components/icons/AnimatedPhoneVolume';
import AnimatedRefresh from '../components/icons/AnimatedRefresh';

// Kept apart from Admin.tsx so routing can read it without loading the admin pages.
export const adminSections = [
  { path: '/admin/invitaciones', label: 'Invitaciones', Icon: AnimatedUserPlus },
  { path: '/admin/dispositivos', label: 'Dispositivos de caseta', Icon: AnimatedPhoneVolume },
  { path: '/admin/estado', label: 'Estado del sistema', Icon: AnimatedRefresh },
] as const;
