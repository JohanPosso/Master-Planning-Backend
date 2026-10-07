# Master Planning · API

Backend de Master Planning: horarios, registro de horas y nómina.
Node 20 + Express 5 + Sequelize 6 + PostgreSQL 16.

## Arrancar en local

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev                 # http://localhost:3000/api
```

Admin por defecto (configurable en `.env`): `ADMIN_USER` / `ADMIN_PASSWORD` (`admin` / `admin123`).
Tras el seed, las empleadas de ejemplo entran con usuario `silvia` / `dulce` / `carolina` y PIN `1234`.

Frontend: en `../Master-Planning-Frontend`, `npm run dev`. Vite redirige `/api` a `localhost:3000`.

| Script | Qué hace |
| --- | --- |
| `npm run dev` / `start` | API con recarga / producción |
| `npm run db:migrate` / `db:migrate:down` | Migraciones |
| `npm run db:seed` / `db:reset` | Datos de ejemplo / reset completo |
| `npm test` | Unitarios + integración |
| `npm run test:smoke` | Smoke de endpoints (`API_URL`) |
| `npm run test:e2e` | Flujo de negocio completo |
| `npm run lint` | Comprobación de sintaxis |

## Estructura

```
src/
  domain/        Lógica de negocio sin BD
  models/        Modelos Sequelize
  database/      Migraciones, runner y seed
  services/      Casos de uso
  routes/        Controladores
  schemas.js     Validación (zod)
  serializers.js Contrato JSON con el frontend
  middleware/    Validación, errores, logs
test/            Integración con Postgres
```

## API (`/api`)

| Método y ruta | Descripción |
| --- | --- |
| `GET /health` | Healthcheck API + BD (público) |
| `POST /auth/login` · `GET /auth/me` · `POST /auth/logout` | Autenticación JWT |
| `GET /portal/estado` · `GET /portal/nomina?inicio&fin` | Portal empleada (solo lectura) |
| `GET /estado` | Estado completo (admin) |
| `POST /sync` | Lote upsert/delete en una transacción |
| `GET/PUT/DELETE /empleadas` | Empleadas (incl. usuario/PIN de portal) |
| `GET/PUT/DELETE /plantillas` | Plantillas |
| `GET/PUT/DELETE /turnos` · `POST /turnos/:id/mover` · `POST /turnos/desde-plantilla` | Turnos |
| `GET/PUT /semanas` · `POST /semanas/:lunes/copiar-anterior` | Semanas |
| `GET/PUT/DELETE /registros` · `POST /registros/confirmar-dia` | Horas reales |
| `GET/POST/DELETE /pagos` · `GET /pagos/calculo` | Nómina |
| `GET/PATCH /reglas` · `GET/PATCH /ajustes` | Configuración |
| `GET /portal/fichaje` · `POST /portal/fichajes` | Fichaje de la empleada: resumen del día/semana/historial y fichar `{ tipo, ubicacion? }` |
| `GET /fichajes?desde&hasta` · `GET /fichajes/novedades?desde` | Fichajes para el encargado (incluye anulados) y refresco en vivo |
| `POST /fichajes` · `PUT /fichajes/:id` · `POST /fichajes/:id/anular` | Correcciones del encargado: añadir, corregir o anular, siempre con `motivo` |
| `GET/PUT /fichaje/config` · `GET /fichaje/mi-ip` | Geocerca, Wi-Fi de la cafetería, política sin verificar y horas del cierre automático |

Errores: `{ "error": { "code", "message", "details?" } }`.

## Fichaje (registro de jornada)

- **Hora del servidor** en `APP_TIMEZONE`: la empleada no puede elegirla ni manipular el reloj del móvil.
- **Nada se borra**: corregir o anular deja el original anulado (`anulado_en` + `motivo`) y enlazado (`sustituye_a`) a su corrección. Las restricciones de la BD obligan a dar motivo. `fichajes.empleada_id` es `ON DELETE RESTRICT`: el histórico se conserva aunque la empleada se dé de baja.
- **Cierre automático** (`src/jobs/cierreAutomatico.js`, cada 5 min; un lock evita duplicados si hay varias instancias): una entrada abierta más de `cierreAutomaticoHoras` (10 por defecto) recibe una salida `automatico` al fin del tramo de su turno, o a entrada + horas si no tiene turno (como máximo a las 23:59). El día queda «por confirmar» con nota para revisar.
- **Verificación**, por orden: Wi-Fi de la cafetería (IP pública, sin pedir ubicación) → GPS dentro del radio → si el GPS dice claramente «lejos», rechazo → sin GPS ni Wi-Fi: `sin_verificar` (se deja fichar y se anota) o rechazo, según `sinVerificar`. Requiere `trust proxy` correcto para leer la IP real detrás del proxy del hosting.
- **Del fichaje al registro**: al fichar la salida se crea o actualiza el registro del día como «por confirmar» (`origen: 'fichaje'`). Si el encargado ya lo confirmó o cambió las horas a mano (`origen: 'manual'`), no se toca. Los tramos contiguos se unen; con más de 2 tramos se unen los huecos más cortos y se deja nota.
- **Doble toque**: el cliente envía el `tipo` que espera; si no coincide con lo que toca, `409` con `details.toca`. Un *advisory lock* por empleada y día serializa los fichajes simultáneos.
- **Geocerca opcional** (desactivada por defecto): exige ubicación y rechaza fuera del radio (`403 FUERA_DE_ZONA`), descontando la imprecisión del GPS (máx. 100 m). Solo se expone la distancia; las coordenadas quedan en la BD como prueba.
- En los tests, `src/utils/reloj.js` permite fijar la hora para simular una jornada.
- **Despliegue**: aplica las migraciones **antes** de arrancar la versión nueva (la tarea de cierre automático usa las columnas nuevas desde el primer segundo).

## Producción

1. Postgres gestionado y `DATABASE_URL` (+ `DB_SSL=true` si aplica).
2. `NODE_ENV=production`, `CORS_ORIGIN=https://tu-frontend`, `JWT_SECRET` (obligatorio), `ADMIN_USER`, `ADMIN_PASSWORD`.
3. Al desplegar: `npm ci --omit=dev && node src/database/migrate.js && npm start`.
4. En el frontend: `VITE_API_URL=https://tu-api/api` en el build.
