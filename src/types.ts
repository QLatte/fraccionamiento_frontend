export type Role = 'SUPERADMIN' | 'ADMIN' | 'GUARD' | 'RESIDENT';
export type Status = 'ACTIVE' | 'USED' | 'REVOKED' | 'EXPIRED';
export type PassType = 'SINGLE_USE' | 'TEMPORARY' | 'RECURRING';
export interface Identity { user: { id: string; email: string; fullName: string; globalRole: Role }; session: { propertyId: string; gateId: string | null; gateDeviceId: string | null; expiresAt: string } }
export interface Property { id: string; street: string; houseNumber: string; status: string; membershipRole?: 'RESIDENT_OWNER' | 'FAMILY_MEMBER'; cluster: { id: string; name: string; type: string } }
export interface Pass { id: string; propertyId: string; createdById: string; guestName: string; guestVehicle: string | null; passType: PassType; status: Status; validFrom: string; validUntil: string; createdAt: string; timezone: string; windowSeconds: number; recurrenceRule: string | null }
export interface Page<T> { data: T[]; nextCursor?: string | null }
export interface SessionResult { accessToken: string; expiresAt: string }
export interface CreatedPass { id: string; shareUrl: string; encryptedToken: string; status: Status }
export interface Device { id: string; deviceLabel: string | null; createdAt: string; lastUsedAt: string | null; userId: string }
export interface Notification { id: string; eventType: string; createdAt: string }
export interface Gate { id: string; label: string; clusters: { id: string; name: string }[] }
export interface GateDevice { id: string; gateId: string; label: string; active: boolean; pairedAt: string | null; createdAt: string; gate: { label: string } }
export interface GateStation { id: string; label: string; gate: { id: string; label: string } }
export interface AdminUser { id: string; fullName: string; email: string; globalRole: Role }
export interface Outbox { id: string; eventType: string; status: string; retries: number; createdAt: string; lastError: string | null }
export interface Health { pending: number; failed: number; averagePropagationMs: number; oldestPendingMs: number; scansLast24h: { result: string; _count: number }[] }
export interface GateGuest { guestName: string; guestVehicle: string | null; property: { street: string; houseNumber: string } }
export interface GateLog { recent: ({ id: string; timestamp: string; direction: 'ENTRY' | 'EXIT'; result: string } & Partial<GateGuest>)[]; inside: ({ id: string; since: string } & GateGuest)[] }
export interface ScanResult { result: 'GRANTED'; guestName: string; guestVehicle: string | null; property: { street: string; houseNumber: string }; residentName: string; validationSource: string }
