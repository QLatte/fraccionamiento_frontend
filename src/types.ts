export type Role = 'SUPERADMIN' | 'ADMIN' | 'GUARD' | 'RESIDENT';
export type Status = 'ACTIVE' | 'USED' | 'REVOKED' | 'EXPIRED';
export type PassType = 'SINGLE_USE' | 'TEMPORARY' | 'RECURRING';
export interface Identity { user: { id: string; email: string; fullName: string; globalRole: Role }; session: { propertyId: string; gateId: string | null; gateDeviceId: string | null; expiresAt: string; profile: Role }; contexts?: { resident: { propertyId: string }[]; admin: { communityId: string; community?: { name: string } }[]; superadmin: boolean } }
export interface Property { id: string; street: string; houseNumber: string; status: string; membershipRole?: 'RESIDENT_OWNER' | 'FAMILY_MEMBER'; cluster: { id: string; name: string; type: string; community?: { id: string; name: string; mapsUrl: string | null } } }
export interface Pass { id: string; propertyId: string; createdById: string; guestName: string; guestVehicle: string | null; notes: string | null; passType: PassType; status: Status; validFrom: string; validUntil: string; createdAt: string; timezone: string; windowSeconds: number; recurrenceRule: string | null }
export interface Page<T> { data: T[]; nextCursor?: string | null }
export interface SessionResult { accessToken: string; expiresAt: string }
export interface CreatedPass { id: string; shareUrl: string; encryptedToken: string; status: Status }
export interface Device { id: string; deviceLabel: string | null; createdAt: string; lastUsedAt: string | null; userId: string }
export interface Notification { id: string; eventType: string; createdAt: string }
export interface Gate { id: string; label: string }
export interface GateDevice { id: string; gateId: string; label: string; active: boolean; pairedAt: string | null; createdAt: string; gate: { label: string } }
export interface GateStation { id: string; label: string; gate: { id: string; label: string } }
export interface AdminUser { id: string; fullName: string; email: string; globalRole: Role }
export interface Outbox { id: string; eventType: string; status: string; retries: number; createdAt: string; lastError: string | null }
export interface Health { pending: number; failed: number; averagePropagationMs: number; oldestPendingMs: number; scansLast24h: { result: string; _count: number }[] }
export interface GateGuest { guestName: string; guestVehicle: string | null; property: { street: string; houseNumber: string } }
export interface GateLog {
  recent: ({ id: string; kind?: 'pass' | 'walkin'; walkInId?: string; timestamp: string; direction: 'ENTRY' | 'EXIT'; result: string; authorizedBy?: string | null } & Partial<GateGuest>)[];
  inside: ({ id: string; kind?: 'pass' | 'walkin'; since: string; authorizedBy?: string | null } & GateGuest)[];
}
export type WalkInReason = 'VISIT' | 'DELIVERY' | 'SERVICE' | 'OTHER';
export type IdDocumentType = 'INE' | 'LICENSE' | 'PASSPORT' | 'OTHER';
/** A visitor without a pass, as the gate sees it while waiting for the household. */
export interface WalkInView { id: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'; method: 'APP' | 'PHONE' | null; notified: number; expiresAt: string; canCall: boolean; guestName: string; guestVehicle: string | null; reason: WalkInReason; property: { street: string; houseNumber: string } | null; authorizedBy: string | null; enteredAt: string | null; exitedAt: string | null }
/** A pending request shown to household members. */
export interface WalkInPending { id: string; createdAt: string; expiresAt: string; reason: WalkInReason; idType: IdDocumentType; guestName: string; guestVehicle: string | null; idLast4: string }
/** One event in a household's gate activity (Actividad). */
export interface ActivityItem {
  id: string; at: string; guestName: string | null; gate: string | null; by: string | null; method: 'APP' | 'PHONE' | null; reason: string | null;
  type: 'VISIT_ENTERED' | 'VISIT_EXITED' | 'VISIT_DENIED' | 'WALKIN_REQUESTED' | 'WALKIN_APPROVED' | 'WALKIN_REJECTED' | 'WALKIN_CANCELLED' | 'WALKIN_EXITED';
}
/** The signed-in person's own profile (Mi perfil). */
export interface Profile { fullName: string; email: string; globalRole: Role; preferences: { alertEntries: boolean; alertExits: boolean; quietHours: { start: string; end: string } | null; timezone: string } }
export interface GateProperty { id: string; street: string; houseNumber: string; cluster: { name: string } }
export interface ScanResult { result: 'GRANTED'; guestName: string; guestVehicle: string | null; notes?: string | null; property: { street: string; houseNumber: string }; residentName: string; validationSource: string }
