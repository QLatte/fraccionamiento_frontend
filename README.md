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

Compila la API desde `../sica-qr-backend` con `npm run build` y la PWA desde esta carpeta con `npm run build`. Despliega la API y el sitio estático por separado. Configura `VITE_API_BASE_URL=https://api.example.com/api/v1` al compilar el frontend, y `APP_ORIGIN`/CORS con el origen público de la PWA. El alojamiento estático debe dirigir rutas de navegación a `index.html` y servir `sw.js` sin caché persistente. No utilices `vite preview` como servidor de producción.

## Caseta compartida

Abre `/caseta` en el equipo dedicado e instala la PWA desde esa ruta para que el acceso directo abra Caseta. Administración genera la clave en **Dispositivos de caseta** y la introduce una vez en esa pantalla. A partir de entonces el escáner se abre sin cuenta de vigilante, PIN ni biometría; el permiso temporal se renueva mientras el equipo siga autorizado. Administración puede desactivarlo.

La PWA y la API deben estar en el mismo sitio HTTPS o detrás de un proxy de origen compatible con cookies. El equipo debe permanecer físicamente bajo control de la caseta. Las lecturas se auditan por equipo, no por empleado. Antes de publicar este cambio, despliega la migración y el backend nuevos; una PWA nueva frente a la API anterior no podrá vincular el equipo.

## Pruebas

```sh
npm run typecheck
npm run build
TEST_DATABASE_URL=postgresql://usuario:clave@localhost/base_pruebas npm run test:e2e
```

La prueba E2E requiere las dependencias del backend instaladas, permisos para crear esquemas de prueba en la base de datos, Redis y Chromium. Crea un esquema aislado, levanta la API y genera datos efímeros dentro de `test-results/`, que está excluida de Git. `REDIS_SERVER_BIN` selecciona el ejecutable de Redis y `E2E_BROWSER_PATH` selecciona Chrome.
