export type AccessStatus = 'ACTIVE' | 'SENT' | 'FAILED' | 'EXPIRED' | 'PENDING';
export type Person = { id: string; fullName: string; email: string; globalRole?: string };
export type CommunitySummary = { id: string; name: string; mapsUrl: string | null; privadas: number; lotes: number; activeProperties: number; activeResidents: number; extraResidents: number; admins: number };
export type Usage = { emailEnabled: boolean; data: CommunitySummary[] };
export type Member = { membershipRole: string; user: Person; access: { status: AccessStatus; devices: number; invitedAt: string | null; expiresAt: string | null; error: string | null } };
export type Home = { id: string; street: string; houseNumber: string; status: string; deviceLimit: number; memberships: Member[] };
export type Section = { id: string; name: string; type: 'PRIVADA' | 'LOTE'; properties: Home[] };
export type CommunityDetail = { id: string; name: string; mapsUrl: string | null; admins: { user: Person; createdAt: string }[]; clusters: Section[] };
export type Issue = { level: 'error' | 'warning'; sheet: string; row: number; message: string };
export type Summary = { privadas: number; lotes: number; houses: number; residents: number; extraResidents: number; extraHouses: number };
export type Counts = { newSections: number; newHouses: number; newPeople: number; newMemberships: number; limitIncreases: number };
export type Preview = {
  sections: { name: string; type: 'PRIVADA' | 'LOTE'; clusterId: string | null; houses: { number: string; label: string; propertyId: string | null; deviceLimit: number; extra: number; residents: { fullName: string; email: string; existingUser: boolean; member: boolean }[] }[] }[];
  issues: Issue[]; counts: Counts; summary: Summary; canImport: boolean;
};
export type ImportResult = { counts: Counts; summary: Summary; pending: number; queued: number };
/** Background email sending for one fraccionamiento (see /invitations/status). */
export type InvitationJob = { total: number; sent: number; failed: number; errors: string[]; running: boolean; startedAt: string | null; finishedAt: string | null };

/** Whether this person still needs an (email) invitation. */
export const needsInvite = (status: AccessStatus) => status === 'PENDING' || status === 'EXPIRED' || status === 'FAILED';
export const accessLabel: Record<AccessStatus, { text: string; tone: string }> = {
  ACTIVE: { text: 'Acceso activo', tone: '' },
  SENT: { text: 'Invitación enviada', tone: 'used' },
  FAILED: { text: 'No se envió', tone: 'revoked' },
  EXPIRED: { text: 'Invitación vencida', tone: 'expired' },
  PENDING: { text: 'Sin invitar', tone: 'pending' },
};
