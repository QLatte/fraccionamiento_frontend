import { Client } from 'pg';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createDatabaseClient } from '../../sica-qr-backend/src/lib/database.js';

// Explicit test connection only: never fall back to the project's .env database.
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL es obligatoria para las pruebas E2E aisladas.');
const backendRoot = resolve(import.meta.dirname, '../../sica-qr-backend');
const frontendRoot = resolve(import.meta.dirname, '..');
process.chdir(backendRoot);
const schema = 'sica_e2e_' + randomUUID().replaceAll('-', '');
const url = new URL(process.env.TEST_DATABASE_URL);
if (url.searchParams.get('sslmode') === 'require') url.searchParams.set('sslmode', 'verify-full');
const owner = new Client({ connectionString: url.toString() });
await owner.connect(); await owner.query(`CREATE SCHEMA "${schema}"`); await owner.query(`SET search_path TO "${schema}"`);
for (const entry of (await readdir(resolve(backendRoot, 'prisma/migrations'), { withFileTypes: true })).filter(d => d.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
  await owner.query((await readFile(resolve(backendRoot, `prisma/migrations/${entry.name}/migration.sql`), 'utf8')).replace(/\bpublic\b/g, schema));
}
url.searchParams.set('schema', schema); url.searchParams.set('options', `-c search_path=${schema}`);
const db = createDatabaseClient(url.toString());
url.searchParams.set('options', `-c search_path=${schema} -c role=sica_api`);
process.env.DATABASE_URL = url.toString();
process.env.APP_ORIGIN = 'http://localhost:5188'; process.env.WEBAUTHN_RP_ID = 'localhost';
process.env.PORT = '5188'; process.env.JWT_SECRET = 'e2e-only-session-secret-at-least-32-characters'; process.env.QR_TOKEN_SECRET = 'e2e-only-qr-secret-at-least-32-characters'; process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 19).toString('base64');
const socket = createServer().listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = (socket.address() as { port: number }).port; await new Promise<void>(done => socket.close(() => done()));
process.env.REDIS_URL = `redis://127.0.0.1:${port}`;
const redis = spawn(process.env.REDIS_SERVER_BIN ?? '.local/bin/redis-server', ['--bind', '127.0.0.1', '--port', String(port), '--save', '', '--appendonly', 'no'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise<void>((done, reject) => { const timer = setTimeout(() => reject(new Error('Redis no inició')), 10000); redis.once('error', reject); redis.stdout.on('data', data => { if (String(data).includes('Ready to accept connections')) { clearTimeout(timer); done(); } }); });
const { enrollment } = await import('../../sica-qr-backend/src/auth/webauthn.js');
const { createPass } = await import('../../sica-qr-backend/src/services/passes.js');
const { randomToken, tokenHash } = await import('../../sica-qr-backend/src/lib/crypto.js');
const cluster = await db.cluster.create({ data: { name: 'Los Encinos', type: 'PRIVADA' } });
const property = await db.property.create({ data: { street: 'Calle de los Olivos', houseNumber: '24', clusterId: cluster.id } });
const otherHome = await db.property.create({ data: { street: 'Paseo del Roble', houseNumber: '08', clusterId: cluster.id } });
const user = await db.user.create({ data: { fullName: 'Lucía Méndez', email: 'lucia@e2e.test', globalRole: 'ADMIN', memberships: { create: [{ propertyId: property.id, membershipRole: 'RESIDENT_OWNER' }, { propertyId: otherHome.id, membershipRole: 'RESIDENT_OWNER' }] } } });
const resident = await db.user.create({ data: { fullName: 'Ana Torres', email: 'ana@e2e.test', memberships: { create: { propertyId: property.id, membershipRole: 'FAMILY_MEMBER' } } } });
const gate = await db.gate.create({ data: { label: 'Acceso principal', clusters: { connect: { id: cluster.id } } } });
const deviceToken = randomToken(); await db.gateDevice.create({ data: { gateId: gate.id, label: 'Tableta principal', tokenHash: tokenHash(deviceToken) } });
const grant = await db.$transaction(tx => enrollment(tx, user.id, property.id, 'REGISTER', user.id));
let scanUrl = '';
for (const [i, name] of ['Mariana González', 'Carlos Rodríguez', 'Andrea López', 'Roberto Martínez', 'Sofía Hernández', 'Diego Ramírez'].entries()) {
  const value = await db.$transaction(tx => createPass(tx, { userId: user.id, propertyId: property.id, guestName: name, guestVehicle: ['ABC-123', 'XYZ-908', '', 'JKL-234', '', 'MNO-567'][i], passType: i === 1 ? 'TEMPORARY' : 'SINGLE_USE', validFrom: new Date(Date.now() - 60000), validUntil: new Date(Date.now() + 6 * 3600000), timezone: 'America/Mexico_City', recurrenceRule: null, windowSeconds: 300 }));
  const body = value.body as { id: string; shareUrl: string }; if (i === 0) scanUrl = body.shareUrl;
  if (i === 3) await db.pass.update({ where: { id: body.id }, data: { status: 'USED' } });
}
await mkdir(resolve(frontendRoot, 'test-results'), { recursive: true });
// A real QR in a camera video exercises the same canvas decoder used on phones.
const QRCode = createRequire(resolve(frontendRoot, 'package.json'))('qrcode') as { create: (text: string) => { modules: { size: number; data: Uint8Array } } };
const matrix = QRCode.create(scanUrl).modules; const width = 640; const height = 480;
const y = Buffer.alloc(width * height, 235); const scale = Math.floor(380 / (matrix.size + 8));
const offsetX = Math.floor((width - matrix.size * scale) / 2); const offsetY = Math.floor((height - matrix.size * scale) / 2);
for (let row = 0; row < matrix.size; row++) for (let col = 0; col < matrix.size; col++) if (matrix.data[row * matrix.size + col]) {
  for (let line = 0; line < scale; line++) y.fill(16, (offsetY + row * scale + line) * width + offsetX + col * scale, (offsetY + row * scale + line) * width + offsetX + (col + 1) * scale);
}
await writeFile(resolve(frontendRoot, 'test-results/camera.y4m'), Buffer.concat([Buffer.from('YUV4MPEG2 W640 H480 F10:1 Ip A1:1 C420jpeg\nFRAME\n'), y, Buffer.alloc(width * height / 2, 128)]));

await writeFile(resolve(frontendRoot, 'test-results/bootstrap.json'), JSON.stringify({ ...grant, propertyId: property.id, otherPropertyId: otherHome.id, userId: user.id, residentId: resident.id, gateId: gate.id, deviceToken, scanUrl }), { mode: 0o600 });
const { app } = await import('../../sica-qr-backend/src/app.js');
const server = app.listen(5188, '127.0.0.1'); await once(server, 'listening');
let closing = false;
async function close() { if (closing) return; closing = true; server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); if (redis.exitCode === null && redis.signalCode === null) { const exited = once(redis, 'exit'); redis.kill('SIGTERM'); await exited; } (await import('../../sica-qr-backend/src/lib/redis.js')).redis.disconnect(); await (await import('../../sica-qr-backend/src/lib/prisma.js')).prisma.$disconnect(); await db.$disconnect(); await owner.query(`DROP SCHEMA "${schema}" CASCADE`); await owner.end(); }
process.once('SIGTERM', () => void close()); process.once('SIGINT', () => void close());
console.log('PWA E2E lista en localhost:5188 con datos de prueba aislados.');
