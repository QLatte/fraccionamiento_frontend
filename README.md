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

## Estilos y Tailwind

Los estilos base están escritos a mano en `src/styles.css`. Tailwind CSS v4 está instalado con `@tailwindcss/vite` para usar sus utilidades en clases (por ejemplo, `scheme-light-dark` en los campos de fecha al crear un pase: el calendario nativo se ve claro u oscuro según el modo del teléfono, y en modo oscuro `styles.css` invierte el icono del campo para que siga visible sobre el fondo blanco).

`src/tailwind.css` importa solo el tema y las utilidades de Tailwind. **No incluye Preflight** (su reinicio global de estilos) a propósito: cambiaría márgenes, botones y títulos en toda la app. Las utilidades viven en una capa de cascada, así que si `styles.css` y una utilidad definen la misma propiedad, gana `styles.css`.

## Animación de entrada

Al abrir la app, en lugar del indicador «Cargando información…», se reproduce una animación de marca en 2.5D sobre fondo oscuro (`src/components/Splash.tsx` y `Splash.css`): una casa minimalista en perspectiva isométrica (SVG) aparece, su techo se abre en dos hojas que giran sobre sus aleros y deja salir un haz de luz con chispas, de adentro sube un QR holográfico que se acerca a la cámara girando levemente hasta el centro mientras la casa se hunde al fondo, y «Zentry.» aparece debajo con un barrido de luz dentro de las letras; después el fondo baja como ola y descubre la primera pantalla, que ya se cargó debajo. El QR de la animación es decorativo (no se puede escanear). El giro de cada hoja del techo es una rotación isométrica real calculada de antemano y guardada como cuadros de `transform` (sin deformar el SVG), para que se vea fluido también en teléfonos. Dura unos 2.6 s; si la app aún no está lista se queda en el logo hasta que lo esté (máximo 6 s). La app avisa que está lista con `<AppReady/>` dentro del `Suspense` principal. Se muestra una vez por sesión del navegador (cada vez que se abre la PWA), nunca en el enlace público del QR (`/p/…`), y con «reducir movimiento» activado solo aparece el logo y se desvanece. Solo anima `transform` y `opacity`.

## Movimiento

Todas las animaciones siguen una sola identidad («premium sobrio»), definida como variables en `src/styles.css` (`:root`): `--motion-ease` (frenado suave, para casi todo), `--motion-exit` (salidas, que aceleran y duran menos), `--motion-spring` (rebote, solo en selectores —barra inferior, Entrada/Salida, barra de caseta, interruptor— y en el éxito de la caseta) y `--motion-wiggle` (iconos que oscilan), con tres duraciones: `--motion-fast` 150 ms (presionar, hover, color), `--motion-standard` 280 ms (avisos, iconos) y `--motion-slow` 420 ms (modales, menú, selectores). Para cambiar el ritmo de la app basta con ajustar esas variables.

- **Modales:** entran subiendo y aclarando el fondo (en teléfono suben desde abajo). Al cerrarse —por la X, Escape, un botón o cualquier lógica— una copia inerte se desvanece 220 ms (`src/components/modalExit.ts`), así ninguna pantalla tiene que esperar la animación.
- **Caseta:** el resultado aceptado entra con un rebote leve; el rechazo entra firme y su símbolo se sacude. El aviso de QR inválido entra y sale deslizándose.
- **Botones:** se hunden un poco mientras se presionan.
- **Barra inferior y Entrada/Salida:** la muesca se mueve solo con `transform` (sin recalcular el layout), para que no haya tirones en tabletas o teléfonos modestos.
- **Menú lateral en teléfono:** abre frenando (340 ms) y cierra acelerando (240 ms).
- **Iconos animados** (`src/components/icons/AnimatedIcons.tsx`): huella del login, palomita de los resultados aceptados, reloj de arena de las visitas sin pase, avión de papel de «Compartir pase» y de las invitaciones, y flechas de tendencia en Movimientos. Son los de [lucide-animated](https://lucide-animated.com) (MIT) portados a la API de animaciones del navegador, sin la librería Motion, con el mismo motor que los demás (`iconMotion.ts`): se animan al pasar el cursor, tocar o enfocar su botón, o solos cuando aparecen.
- Con «reducir movimiento» activado no hay animaciones.

## Carga por partes

Cada pantalla principal se descarga solo cuando se usa (`React.lazy` en `src/App.tsx`): el escáner de caseta (con jsQR), el QR compartido (con qrcode), el login WebAuthn, los pases, los dispositivos, la administración y la plataforma. React va en su propio archivo, que casi no cambia y queda en caché entre despliegues. Para enrutar sin cargar la administración, la lista de secciones vive en `src/pages/adminSections.ts`. Si tras un despliegue una pestaña abierta pide una parte que ya no existe, la app se recarga una vez para tomar la versión nueva. El service worker guarda todas las partes de `dist`, así que la PWA sigue abriendo sin conexión.

## Producción

Compila la API desde `../sica-qr-backend` con `npm run build` y la PWA desde esta carpeta con `npm run build`. En el **Static Site del frontend** de Render (`https://zentry.qlatte.com`), crea en Redirects/Rewrites una regla `Rewrite` con Source `/api/*` y Destination `https://fraccionamiento-backend.onrender.com/api/*`, por encima del fallback `/*` → `/index.html`. La caseta usa siempre `/api/v1` en el origen de la PWA; para el resto de la app, quita el `VITE_API_BASE_URL` anterior o ponlo en `/api/v1`. Configura `APP_ORIGIN=https://zentry.qlatte.com` en el backend. Un API en un sitio distinto no puede conservar estas cookies `SameSite=Strict` si se llama directamente. Sirve `sw.js` sin caché persistente. No utilices `vite preview` como servidor de producción.

## Compartir un pase

Al crear un pase (o desde su detalle, mientras la app conserve el enlace), **Compartir pase** envía una imagen PNG con el nombre del visitante, el QR, la vigencia en la zona horaria del pase (fecha y horario, o días, horario y periodo si es recurrente) y la ubicación (calle, número y fraccionamiento), con el enlace del pase y la ubicación en Google Maps del fraccionamiento en el texto (se configura en Plataforma; si un fraccionamiento no tiene enlace, se omite). La imagen se genera en el navegador (`src/components/passCard.ts`) al abrir la ventana, porque Safari solo permite compartir justo después del toque. Donde el navegador no comparte archivos, se comparte el enlace. **Descargar imagen** guarda la misma tarjeta. La vista pública del visitante (`/p/…`) no conoce esos datos y sigue mostrando solo el QR.

## Plataforma (superadmin)

`/plataforma` (`src/pages/Platform.tsx`, `PlatformCommunity.tsx`, `PlatformImport.tsx`) lista los fraccionamientos con privadas, lotes, casas, residentes y **extra** (residentes por encima de los 2 incluidos por casa, que se cobran aparte). Desde **Nuevo fraccionamiento** se crea uno con su enlace de Google Maps. Al abrir uno:

- **Nombre y ubicación:** el enlace de Maps se envía con cada pase compartido.
- **Administrador:** uno por fraccionamiento, elegido entre los propietarios; asignar otro reemplaza al anterior.
- **Importar residentes desde Excel:** elige el `.xlsx` (o `.csv`) que manda el fraccionamiento (`src/spreadsheet.ts` lo lee en el navegador con `read-excel-file`) y revisa la vista previa: totales, casas con cobro extra, errores que impiden importar y avisos. **Importar** da de alta casas y personas y, si se marca, envía las invitaciones por correo (vencen en 72 horas). **Descargar plantilla** baja un CSV con el formato sugerido.
- **Viviendas y residentes:** por privada o lote, cada casa con sus teléfonos permitidos (editable) y cada persona con el estado de su acceso (activo, invitación enviada, no se envió, vencida, sin invitar), con **Reenviar** o **Enviar invitaciones pendientes**. Si un fraccionamiento tiene varias privadas que hoy aparecen por separado, **Mover a** las junta.

## Un fraccionamiento a la vez

Cada fraccionamiento es un cliente distinto y nada se mezcla entre ellos. El administrador solo ve el suyo. El superadmin, en **Administración**, elige primero el fraccionamiento (arriba de las pestañas; se recuerda durante la sesión) y todo lo que ve —movimientos, residentes, casetas— es solo de ese; `src/api.ts` agrega `communityId` a cada petición de administración. En **Plataforma**, cada fraccionamiento muestra sus casetas y tiene **Unir con otro fraccionamiento** para juntar los que en realidad son el mismo cliente.

**Casetas:** cada caseta pertenece a un fraccionamiento y deja entrar a visitas de cualquiera de sus casas. En **Administración → Casetas** el administrador crea las que necesite (**Nueva caseta**), las renombra, las elimina (sus equipos se desactivan; el historial queda en Movimientos) y agrega los equipos de cada una.

## Movimientos (administración)

**Administración → Movimientos** (`src/pages/AdminMovements.tsx`) es la pantalla principal del administrador: el flujo de **visitas** de su fraccionamiento (los residentes no pasan por el escáner). Filtros por periodo (Hoy, 7 días, 30 días o fechas, hasta 3 meses), caseta y privada o lote. Muestra entradas, salidas, visitas dentro ahora y rechazos, con la comparación contra el periodo anterior (tocar un número filtra la bitácora); el flujo por hora o por día con la hora y el día más concurridos; quién sigue dentro y cuánto lleva (marcadas las de más de 12 horas); la bitácora con búsqueda por visitante o casa, filtros (Entradas, Salidas, Sin pase, Rechazos), «Ver más» y **Descargar Excel** (CSV); y resúmenes de tipo de acceso, casas con más visitas y rechazos por motivo. «Hoy» se actualiza cada minuto. No se muestran identificaciones y las placas aparecen abreviadas (`•••123`). En el teléfono la bitácora se ve como tarjetas.

## Renovar accesos (administración)

El administrador del fraccionamiento ya no da de alta residentes: en **Administración → Renovar accesos** busca a la persona, elige la vivienda y entrega la invitación **por correo** (a su correo registrado, 72 horas) o **en persona** (enlace de 15 minutos para abrir en su teléfono ahí mismo). La nueva llave reemplaza las anteriores de esa persona en esa vivienda.

## Actividad

**Actividad** (`/actividad`, `src/pages/Activity.tsx`) se abre con la campana de la barra superior, arriba a la derecha (solo en el perfil de residente), y muestra lo que pasa en la caseta con las visitas de la vivienda seleccionada en los últimos 30 días, agrupado por día: entradas y salidas con pase (con quién invitó), intentos rechazados con el motivo, y visitas sin pase (solicitud, quién autorizó o rechazó y si fue desde la app o por teléfono, salida o si se retiró). Filtros: Todo, Entradas, Salidas, Sin pase y Rechazos. Se actualiza cada 20 s. Un contador sobre la campana indica las novedades desde la última vez que se abrió en ese teléfono, y la campana se anima al tocarla, cuando llegan novedades y, mientras haya sin leer, cada 10 s (se detiene en Actividad, con la app en segundo plano y con «reducir movimiento») (`src/activity.ts`, guardado en el navegador). Al tocar un aviso push se abre esta sección.

## Mi perfil

Al tocar el nombre en la barra lateral (por ejemplo, «Administrador de prueba · Mi perfil») se abre `/perfil` (`src/pages/Profile.tsx`), disponible en cualquier perfil:

- **Datos personales:** editar el nombre. Es el que ve la caseta al escanear y el que aparece en «Invitó …»; cada cambio queda en la auditoría.
- **Avisos:** activar los avisos en este teléfono, elegir entradas y salidas, y **No molestar** (horario en que se silencian entradas y salidas, en la zona horaria del teléfono). Las solicitudes de visitas sin pase siempre llegan. Aplica en todos los teléfonos de la persona. Los avisos de este teléfono se encienden con un interruptor tipo *liquid glass* (`src/components/LiquidToggle.tsx`, `role="switch"`); es el único lugar donde se activan.
- **Mi cuenta:** correo (solo lectura; lo cambia administración porque es la identidad de acceso), viviendas con su rol, acceso a Mis dispositivos y Cerrar sesión.

## Visitas sin pase

En el escáner, **Visita sin pase** (`src/pages/GateWalkIn.tsx`) guía al vigilante: elige la vivienda, captura nombre, placas, motivo, tipo de identificación y sus **últimos 4 caracteres**, y confirma que revisó la identificación en persona (no se guarda foto ni documento). La vivienda recibe un push y una tarjeta **Visita en la caseta** en cualquier pantalla de la app (`src/components/WalkInRequests.tsx`) para **Permitir** o **Rechazar**; responde cualquier integrante y gana la primera respuesta. La caseta muestra una cuenta regresiva de 3 minutos; al terminar, o de inmediato si nadie tiene avisos activados, ofrece registrar una autorización por teléfono con el nombre de quien contestó. Las visitas aprobadas aparecen en la Bitácora con la etiqueta **Sin pase** y su salida se registra con **Registrar salida**.

## Avisos de visitas

En **Mi perfil → Avisos**, el interruptor **Avisos en este teléfono** activa las notificaciones push en ese teléfono para la vivienda seleccionada (`src/push.ts` y `src/components/VisitAlerts.tsx`). Todos los integrantes de la vivienda con avisos activados reciben un aviso al validarse la entrada en caseta y otro al registrarse la salida: quien creó el pase ve «Tu visita llegó/salió» y los demás «Llegó/Salió una visita … · Invitó *nombre*». El aviso de salida reemplaza al de entrada. El service worker (`scripts/build-sw.mjs`) muestra el aviso y abre Mis pases al tocarlo. Al cerrar sesión se desactivan en ese dispositivo. En iPhone solo funcionan con Zentry instalada en la pantalla de inicio (iOS 16.4+); el panel lo explica. El servidor necesita las claves VAPID (ver el README del backend). El service worker solo se registra en producción, así que en `npm run dev` el panel no aparece.

## Caseta compartida

Abre `/caseta` en el equipo dedicado e instala la PWA desde esa ruta para que el acceso directo abra Caseta. Administración crea la caseta y genera la clave del equipo en **Administración → Casetas** y la introduce una vez en esa pantalla. A partir de entonces el escáner se abre sin cuenta de vigilante, PIN ni biometría; el permiso temporal se renueva mientras el equipo siga autorizado. Administración puede desactivarlo.

La PWA y la API deben estar en el mismo sitio HTTPS o detrás de un proxy de origen compatible con cookies. La vinculación comprueba que el navegador conserve la cookie antes de consumir la clave; si falla, muestra el error y permite reintentar con la misma clave tras corregir el despliegue. El equipo debe permanecer físicamente bajo control de la caseta. Las lecturas se auditan por equipo, no por empleado. Entrada y salida se alternan por pase. La pantalla tiene dos secciones, que se cambian con una barra flotante estilo *liquid glass* en la parte inferior: **Escanear** y **Bitácora**. **Escanear** cabe en una sola pantalla, sin deslizar (`src/pages/GateScanner.tsx`): arriba Entrada/Salida, al centro la cámara y abajo **Pegar enlace** (si el QR no se lee) y **Visita sin pase**. La cámara se activa una vez con **Activar escáner** y se queda encendida, también al recargar o al volver de Bitácora (se apaga con el botón de pausa). Lee cada QR que se acerca al recuadro y muestra el resultado en un modal verde o rojo con visitante, destino, vehículo y quién invitó; el aceptado se cierra solo a los 8 s (tocarlo lo deja abierto) y el rechazado espera a **Leer otro pase** o **Reintentar lectura**. Mientras el QR que ya se leyó siga frente a la cámara no se vuelve a leer; elegir Entrada o Salida permite leerlo de inmediato. Un QR que no es de Zentry muestra un aviso breve sobre la cámara. La sección **Bitácora** (quién sigue dentro y las lecturas de las últimas 12 horas del equipo; lado a lado en pantallas anchas y en pestañas en teléfono). La pestaña Bitácora muestra cuántas visitas hay dentro y el equipo recuerda la última sección abierta. Cada resultado se confirma con vibración y un tono (uno agudo si se acepta, dos graves si se rechaza). Antes de publicar este cambio, despliega la migración y el backend nuevos; una PWA nueva frente a la API anterior no podrá vincular el equipo.

## Pruebas

```sh
npm run typecheck
npm run build
TEST_DATABASE_URL=postgresql://usuario:clave@localhost/base_pruebas npm run test:e2e
```

La prueba E2E requiere las dependencias del backend instaladas, permisos para crear esquemas de prueba en la base de datos, Redis y Chromium. Crea un esquema aislado, levanta la API y genera datos efímeros dentro de `test-results/`, que está excluida de Git. `REDIS_SERVER_BIN` selecciona el ejecutable de Redis y `E2E_BROWSER_PATH` selecciona Chrome.
