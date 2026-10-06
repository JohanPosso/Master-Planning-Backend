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
| `GET /health` | Healthcheck API + BD |
| `GET /estado` | Estado completo |
| `POST /sync` | Lote upsert/delete en una transacción |
| `GET/PUT/DELETE /empleadas` | Empleadas |
| `GET/PUT/DELETE /plantillas` | Plantillas |
| `GET/PUT/DELETE /turnos` · `POST /turnos/:id/mover` · `POST /turnos/desde-plantilla` | Turnos |
| `GET/PUT /semanas` · `POST /semanas/:lunes/copiar-anterior` | Semanas |
| `GET/PUT/DELETE /registros` · `POST /registros/confirmar-dia` | Horas reales |
| `GET/POST/DELETE /pagos` · `GET /pagos/calculo` | Nómina |
| `GET/PATCH /reglas` · `GET/PATCH /ajustes` | Configuración |

Errores: `{ "error": { "code", "message", "details?" } }`.

## Producción

1. Postgres gestionado y `DATABASE_URL` (+ `DB_SSL=true` si aplica).
2. `NODE_ENV=production`, `CORS_ORIGIN=https://tu-frontend`.
3. Al desplegar: `npm ci --omit=dev && node src/database/migrate.js && npm start`.
4. En el frontend: `VITE_API_URL=https://tu-api/api` en el build.
