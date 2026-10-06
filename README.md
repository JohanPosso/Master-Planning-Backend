# Jornada · API

Backend de [Jornada](../jornada-react): horarios, registro de horas y nómina de la cafetería.
Node 20 + Express 5 + Sequelize 6 + PostgreSQL 16.

## Arrancar en local

```bash
cp .env.example .env          # ya apunta al Postgres de docker compose (puerto 5433)
npm install
npm run db:up                 # Postgres en Docker (crea también la BD jornada_test)
npm run db:migrate
npm run db:seed               # equipo real + 10 semanas de ejemplo (no hace nada si ya hay datos)
npm run dev                   # http://localhost:3000/api
```

Frontend: en `../jornada-react`, `npm run dev`. Vite redirige `/api` a `localhost:3000`, así que no hace falta configurar CORS en desarrollo.

| Script | Qué hace |
| --- | --- |
| `npm run dev` / `start` | API con recarga / en producción (lee el entorno del sistema) |
| `npm run db:migrate` / `db:migrate:down` | Aplica las migraciones pendientes / revierte la última |
| `npm run db:seed` / `db:reset` | Datos de ejemplo / **borra todo** y vuelve a sembrar |
| `npm test` | Tests unitarios (dominio, errores) + integración contra `jornada_test` |
| `npm run test:smoke` | Prueba todos los endpoints contra la API **en marcha** (`API_URL`, por defecto `localhost:3000`). Usa el año 2001 y lo limpia todo |
| `npm run test:e2e` | Un mes de negocio completo + concurrencia + entradas extremas contra la API en marcha (años 2002–2003, se limpia) |
| `npm run lint` | Comprobación de sintaxis |

## Estructura

```
src/
  domain/        Lógica pura y testeada sin BD: fechas, tramos, cálculo de nómina, catálogos
  models/        Modelos Sequelize (atributos camelCase ↔ columnas snake_case)
  database/      Migraciones (DDL explícito), runner y seed
  services/      Casos de uso con transacciones (un archivo por recurso)
  routes/        Controladores finos: validar (zod) → servicio → responder
  schemas.js     Validación de entrada (zod)
  serializers.js Contrato JSON con el frontend (= src/lib/types.ts)
  middleware/    Validación, errores, log de peticiones
test/            Integración con supertest contra Postgres real
```

## API (`/api`)

| Método y ruta | Descripción |
| --- | --- |
| `GET /health` | Comprueba API + BD |
| `GET /estado` | Estado completo (`State` del frontend). Carga inicial y resincronización |
| `POST /sync` | Lote de `upsert`/`delete` por colección en **una transacción**. Lo usa «Deshacer» |
| `GET /empleadas` · `PUT /empleadas/:id` · `DELETE /empleadas/:id` | `PUT` crea (201) o actualiza (200). `DELETE` es borrado lógico y quita sus turnos desde hoy |
| `GET /plantillas` · `PUT /plantillas/:id` · `DELETE /plantillas/:id` | Al borrar una plantilla, sus turnos se conservan |
| `GET /turnos?desde&hasta` · `PUT /turnos/:id` · `DELETE /turnos/:id` | Un turno por empleada y día: el nuevo sustituye al anterior |
| `POST /turnos/:id/mover` | `{ empleadaId, fecha, duplicar, nuevoId? }` (arrastrar / Alt+arrastrar) |
| `POST /turnos/desde-plantilla` | `{ id?, plantillaId, empleadaId, fecha }` |
| `GET /semanas` · `PUT /semanas/:lunes` | Publicar / volver a borrador. La clave debe ser lunes |
| `POST /semanas/:lunes/copiar-anterior` | Copia la semana anterior **solo en huecos libres** → `{ creados }` |
| `GET /registros?desde&hasta` · `PUT /registros/:empleadaId/:fecha` · `DELETE /registros/:id` | Horas reales (upsert por empleada + día) |
| `POST /registros/confirmar-dia` | `{ fecha, empleadaIds }`. Confirma o crea desde lo planificado |
| `GET /pagos` · `GET /pagos/calculo?inicio&fin` | Histórico / previsualización de la nómina calculada en el servidor |
| `POST /pagos` | `{ id?, inicio, fin, etiqueta }`. Calcula, valida y **congela** las líneas |
| `DELETE /pagos/:id` | Reabre un periodo pagado |
| `GET/PATCH /reglas` · `GET/PATCH /ajustes` | Reglas de aviso (fusión parcial validada) y recargos/festivos |

Errores siempre en JSON: `{ "error": { "code", "message", "details?" } }`.
Códigos: `400 VALIDATION` (con detalle por campo), `404 NOT_FOUND`, `409 CONFLICT`, `503 DB_UNAVAILABLE` y `500 INTERNAL` (sin filtrar detalles internos).

## Decisiones técnicas

- **Mismas convenciones que el frontend.** Las horas son `fecha` (DATE) + minutos desde las 00:00, en tramos JSONB de 1 o 2 (un turno partido es un solo turno). El dinero va en céntimos enteros. Los JSON tienen la forma exacta de `types.ts`, así que las páginas no cambian.
- **Los UUID los genera el cliente.** Así el frontend aplica cambios optimistas con identificadores estables y los `PUT` son idempotentes.
- **La integridad está en la base de datos**, no solo en la app: restricciones `UNIQUE (empleada, fecha)` para turnos y registros, `CHECK` de tramos, tarifas e importes, `semanas.lunes` siempre lunes, y `ON DELETE RESTRICT` para no perder horas ni nóminas pagadas.
- **Las restricciones únicas son `DEFERRABLE`.** Así `/sync` puede intercambiar huecos dentro de una transacción (por ejemplo, deshacer un «mover» que había sustituido a otro turno).
- **La nómina la calcula el servidor**, con una réplica de `calcularPeriodo` del frontend. Exige todas las horas confirmadas, impide periodos solapados y guarda una foto fija (tarifa, recargos, importe) por empleada: cambiar la tarifa después no altera lo pagado. El total es la suma de las líneas ya redondeadas, así que cuadra al céntimo.
- **«Hoy» se calcula en la zona del negocio** (`APP_TIMEZONE`, por defecto `Europe/Madrid`), no en la del servidor.
- **Concurrencia**: las escrituras sobre un mismo hueco (empleada + día) se serializan con *advisory locks* de Postgres tomados en orden. Así dos pestañas o un doble clic no provocan deadlocks. Si aun así ocurre un conflicto, se responde `409 CONCURRENCY` (reintentable), no 500.
- **Nómina**: no se puede pagar un periodo que no ha empezado ni uno sin horas (congelaría 0 € y bloquearía el mes real). Las líneas sin horas no se guardan.
- **Migraciones con SQL explícito** y cada una en su propia transacción (se aplica entera o no se aplica).

## Producción

1. Crea un Postgres gestionado (Neon, Supabase, Railway…) y define `DATABASE_URL` y `DB_SSL=true`.
2. Define `NODE_ENV=production`, `CORS_ORIGIN=https://tu-frontend` y, opcionalmente, `PORT` y `APP_TIMEZONE`.
3. Al desplegar: `npm ci --omit=dev && node src/database/migrate.js && npm start`.
4. En el frontend: `VITE_API_URL=https://tu-api/api` al hacer el build.

> ⚠️ **Antes de exponerla en Internet hay que añadir autenticación.** La API no tiene login, igual que el diseño actual, que no tiene pantalla de acceso. Ver «Pendiente».

## Pendiente

1. **Autenticación** del encargado (sesión con cookie httpOnly o un proxy con acceso protegido) y, si se quiere, un enlace de solo lectura para compartir el horario publicado (`enlaceCompartir` en el modelo de diseño).
2. **Tarifas con vigencia** (tabla `Tarifa` del documento de decisiones) para recalcular meses pasados no pagados con la tarifa de entonces. Hoy se usa la tarifa actual, igual que el frontend.
3. **Carga por rangos**: `/estado` devuelve todo el histórico. Para una cafetería son unos 1.500 turnos al año y no es un problema, pero `GET /turnos?desde&hasta` ya existe para paginar si crece.
4. **Bloquear la edición de horas en periodos pagados.** Hoy se pueden editar; la nómina pagada no cambia porque es una foto fija.
