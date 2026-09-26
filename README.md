# SICA PWA

Interfaz React/TypeScript para residentes, caseta y administración. El backend está separado en `../sica-qr-backend`.

## Desarrollo

Instala dependencias en ambas carpetas:

```sh
cd ../sica-qr-backend && npm ci
cd ../sica-qr-frontend && npm ci
```

Con PostgreSQL y Redis disponibles y el `.env` configurado en el backend, ejecuta desde esta carpeta:

```sh
node scripts/dev-all.mjs
```

Abre `http://localhost:5173`. Vite envía `/api` a `http://127.0.0.1:3000`; cambia `API_PROXY_TARGET` si hace falta. Configura `APP_ORIGIN=http://localhost:5173` y `WEBAUTHN_RP_ID=localhost` en el backend. Para iniciar solo la API/worker o Vite, ejecuta `npm run dev` o `npm run worker:dev` en el backend y `npm run dev` aquí.

## Producción

Compila la API desde `../sica-qr-backend` con `npm run build` y la PWA desde esta carpeta con `npm run build`. En el **Static Site del frontend** de Render (`https://zentry.qlatte.com`), crea en Redirects/Rewrites una regla `Rewrite` con Source `/api/*` y Destination `https://fraccionamiento-backend.onrender.com/api/*`, por encima del fallback `/*` → `/index.html`. La caseta usa siempre `/api/v1` en el origen de la PWA; para el resto de la app, quita el `VITE_API_BASE_URL` anterior o ponlo en `/api/v1`. Configura `APP_ORIGIN=https://zentry.qlatte.com` en el backend. Un API en un sitio distinto no puede conservar estas cookies `SameSite=Strict` si se llama directamente. Sirve `sw.js` sin caché persistente. No utilices `vite preview` como servidor de producción.

## Caseta compartida

Abre `/caseta` en el equipo dedicado e instala la PWA desde esa ruta para que el acceso directo abra Caseta. Administración genera la clave en **Dispositivos de caseta** y la introduce una vez en esa pantalla. A partir de entonces el escáner se abre sin cuenta de vigilante, PIN ni biometría; el permiso temporal se renueva mientras el equipo siga autorizado. Administración puede desactivarlo.

La PWA y la API deben estar en el mismo sitio HTTPS o detrás de un proxy de origen compatible con cookies. La vinculación comprueba que el navegador conserve la cookie antes de consumir la clave; si falla, muestra el error y permite reintentar con la misma clave tras corregir el despliegue. El equipo debe permanecer físicamente bajo control de la caseta. Las lecturas se auditan por equipo, no por empleado. Entrada y salida se alternan por pase. La pantalla tiene dos secciones, que se cambian con una barra flotante estilo *liquid glass* en la parte inferior: **Escanear** (escáner y resultado) y **Bitácora** (quién sigue dentro y las lecturas de las últimas 12 horas del equipo; lado a lado en pantallas anchas y en pestañas en teléfono). La pestaña Bitácora muestra cuántas visitas hay dentro y el equipo recuerda la última sección abierta. Cada resultado se confirma con vibración y un tono (uno agudo si se acepta, dos graves si se rechaza). Antes de publicar este cambio, despliega la migración y el backend nuevos; una PWA nueva frente a la API anterior no podrá vincular el equipo.

## Pruebas

```sh
npm run typecheck
npm run build
TEST_DATABASE_URL=postgresql://usuario:clave@localhost/base_pruebas npm run test:e2e
```

La prueba E2E requiere las dependencias del backend instaladas, permisos para crear esquemas de prueba en la base de datos, Redis y Chromium. Crea un esquema aislado, levanta la API y genera datos efímeros dentro de `test-results/`, que está excluida de Git. `REDIS_SERVER_BIN` selecciona el ejecutable de Redis y `E2E_BROWSER_PATH` selecciona Chrome.
