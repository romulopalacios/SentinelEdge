# SentinelEdge

**Plataforma de monitoreo de seguridad perimetral y eventos IoT en tiempo real.**

SentinelEdge es una plataforma de microservicios multi-tenant lista para producción, diseñada para ingestar, procesar y reaccionar a eventos de sensores de seguridad en tiempo real. Se conecta a dispositivos IoT físicos mediante MQTT, evalúa reglas de alerta configurables por tenant, persiste eventos enriquecidos en una base de datos de series temporales, despacha acciones automáticas (email, webhook, Slack) y expone un dashboard web en tiempo real — todo detrás de un único API gateway.

> **Manual de usuario →** [`docs/user-guide.md`](docs/user-guide.md)

---

## Tabla de Contenidos

- [Arquitectura](#arquitectura)
- [Servicios](#servicios)
  - [Auth Service](#1-auth-service-nodejs)
  - [Ingestion Service](#2-ingestion-service-python)
  - [Rule Engine Service](#3-rule-engine-service-python)
  - [Alert Service](#4-alert-service-nodejs)
  - [Query API Service](#5-query-api-service-python)
  - [Dashboard UI](#6-dashboard-ui-react)
- [Infraestructura](#infraestructura)
- [Modelo de Datos](#modelo-de-datos)
- [Flujo de Eventos](#flujo-de-eventos)
- [Dispatcher de Acciones](#dispatcher-de-acciones)
- [Referencia de la API](#referencia-de-la-api)
- [Primeros Pasos](#primeros-pasos)
- [Herramientas de Desarrollo](#herramientas-de-desarrollo)
- [Configuración](#configuración)
- [Estructura del Proyecto](#estructura-del-proyecto)

---

## Arquitectura

```
Sensores IoT / Dispositivos Edge
         │
         │  MQTT  (sentineledge/+/sensors/+/events)
         ▼
  ┌─────────────┐       AMQP (perimetral.ingestion)       ┌──────────────────┐
  │  Mosquitto  │ ─────────────────────────────────────► │ Ingestion Service │
  │ MQTT Broker │                                          └──────────────────┘
  └─────────────┘                                                   │
                                                                    │ AMQP (eventos crudos)
                                                                    ▼
                                                         ┌──────────────────────┐
                                                         │  Rule Engine Service │
                                                         │  (Python / asyncio)  │
                                                         └──────────────────────┘
                                                          │                    │
                                         AMQP (procesados)│         AMQP (alertas + actions)
                                                          ▼                    ▼
                                                 ┌──────────────┐   ┌──────────────────┐
                                                 │  Query API   │   │  Alert Service   │
                                                 │  (FastAPI)   │   │  (Node.js + WS)  │
                                                 └──────────────┘   └──────────────────┘
                                                          │         │ WebSocket /ws
                                                          │         │ email/webhook/Slack
                                                          └────┬────┘
                                                               │  REST + JWT
                                              ┌────────────────┴─────────────────┐
                                              │      Nginx API Gateway  :80       │
                                              │   /api/v1/*  ·  /ws/  ·  /       │
                                              └────────────────┬─────────────────┘
                                                               │
                                                    ┌──────────┴──────────┐
                                                    │   React Dashboard   │
                                                    │  (Vite + shadcn/ui) │
                                                    └─────────────────────┘
```

Todos los servicios se comunican a través de **RabbitMQ** como bus de eventos interno. Los clientes externos interactúan exclusivamente a través del **Nginx API Gateway**, que también sirve el dashboard React compilado.

---

## Servicios

### 1. Auth Service (Node.js)

Gestiona toda la identidad y el control de acceso de la plataforma.

**Responsabilidades:**
- Registro e inicio de sesión de usuarios con hash de contraseña bcrypt
- Autenticación basada en JWT: tokens de acceso de corta duración (15 min) + tokens de refresco de larga duración (7 días)
- Rotación y revocación de tokens de refresco almacenados en PostgreSQL
- Lista negra de tokens activos en Redis para cierre de sesión instantáneo
- Control de acceso por roles: `admin`, `operator`, `viewer`
- Aislamiento de usuarios por tenant

**Endpoints:**

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/auth/login` | Autenticar usuario y recibir tokens |
| `POST` | `/api/v1/auth/refresh` | Rotar el token de acceso usando un token de refresco |
| `POST` | `/api/v1/auth/logout` | Revocar sesión y agregar tokens a lista negra |
| `GET`  | `/api/v1/users/me` | Obtener el perfil del usuario autenticado |
| `GET`  | `/api/v1/users` | Listar usuarios del tenant (solo admin) |
| `GET`  | `/health` | Estado del servicio + DB/Redis |

**Stack:** Node.js · Express · Pino · Helmet · bcrypt · jsonwebtoken · ioredis · pg

---

### 2. Ingestion Service (Python)

Punto de entrada para toda la telemetría de sensores desde el campo.

**Responsabilidades:**
- Se suscribe al broker MQTT Mosquitto usando el patrón de tópico `sentineledge/+/sensors/+/events`
- Valida y parsea los payloads entrantes de sensores con esquemas Pydantic
- Extrae `tenant_id` y `sensor_external_id` de la estructura del tópico MQTT
- Publica objetos `RawEventMessage` en el exchange `perimetral.ingestion` de RabbitMQ
- Expone un endpoint de salud con estadísticas en tiempo real de MQTT y el publicador
- **Reconexión automática** ante caídas del broker MQTT (backoff exponencial: 1 s → 30 s)

**Tipos de evento soportados:**

| Tipo | Descripción |
|------|-------------|
| `motion_detected` | Sensor de movimiento PIR / radar |
| `door_open` / `door_forced` | Contactos magnéticos de puertas |
| `intrusion` | Violación del perímetro |
| `access_granted` / `access_denied` | Paneles de control de acceso |
| `fence_breach` | Sensor de valla eléctrica o vibración |
| `camera_offline` | Pérdida de conectividad de cámara IP |
| `sensor_tamper` | Detección de manipulación física |
| `custom` | Tipo de evento personalizado definido por el usuario |

**Stack:** Python · FastAPI · asyncio · paho-mqtt · aio-pika · Pydantic · structlog

---

### 3. Rule Engine Service (Python)

La capa de inteligencia — evalúa reglas definidas por tenant para clasificar y enriquecer cada evento.

**Responsabilidades:**
- Consume eventos crudos del exchange `perimetral.ingestion`
- Carga las reglas del tenant desde PostgreSQL con caché en Redis (TTL configurable, por defecto 60 s)
- Evalúa condiciones usando un motor de condiciones flexible y componible
- Asigna severidad (`low`, `medium`, `high`, `critical`) según las reglas coincidentes
- Publica `EnrichedEventMessage` en `perimetral.processed`
- Si una regla coincidente activa una alerta, también publica en `perimetral.alerts` junto con las **acciones** definidas en la regla

**Motor de condiciones:**

Las reglas se almacenan como JSON y admiten expresiones lógicas anidadas:

```json
{
  "or": [
    { "field": "event_type", "operator": "eq", "value": "intrusion" },
    {
      "and": [
        { "field": "event_type", "operator": "eq", "value": "door_forced" },
        { "field": "payload.zone", "operator": "in", "value": ["A", "B"] }
      ]
    }
  ]
}
```

**Operadores soportados:** `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `contains`

Los campos admiten notación de puntos para acceder a propiedades anidadas del payload (ej. `data.zone`, `data.confidence`).

**Stack:** Python · FastAPI · asyncio · aio-pika · asyncpg · aioredis · structlog · tenacity

---

### 4. Alert Service (Node.js)

Distribución, persistencia y **despacho de acciones** de alertas en tiempo real.

**Responsabilidades:**
- Consume mensajes de alerta de `perimetral.alerts` vía RabbitMQ
- Persiste alertas en la tabla `alerts` de PostgreSQL con seguimiento de estado (`open`, `acknowledged`, `resolved`)
- Transmite nuevas alertas a clientes conectados a través de un servidor **WebSocket** (`/ws`)
- Soporte de aislamiento de sala WebSocket por tenant
- **Dispatcher de acciones** — ejecuta acciones automáticas (email, webhook, Slack) tras crear una alerta
- Expone un endpoint de salud

**Stack:** Node.js · Express · ws · aio-pika · pg · nodemailer · Pino

---

### 5. Query API Service (Python)

API REST optimizada para lectura, orientada a dashboards e integraciones.

**Responsabilidades:**
- Sirve consultas paginadas de **eventos**, **alertas**, **sensores** y **reglas**
- Consume eventos procesados de `perimetral.processed` para persistirlos en la hipertabla `events` de TimescaleDB
- Autenticación JWT con aislamiento de datos por tenant (cada consulta se filtra automáticamente por `tenant_id`)
- Soporte de filtros avanzados: por severidad, tipo de evento, sensor, rango de fechas y estado de procesamiento
- Documentación OpenAPI disponible en `/api/docs` en entornos no productivos

**Endpoints:**

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/events` | Listar eventos con filtros y paginación |
| `GET` | `/api/v1/events/{id}` | Obtener un evento |
| `GET` | `/api/v1/events/stats` | Estadísticas de eventos |
| `GET` | `/api/v1/events/timeseries` | Serie temporal de eventos (para gráficas) |
| `GET` | `/api/v1/alerts` | Listar alertas |
| `GET` | `/api/v1/alerts/{id}` | Obtener una alerta |
| `POST` | `/api/v1/alerts/{id}/acknowledge` | Reconocer alerta |
| `POST` | `/api/v1/alerts/{id}/resolve` | Resolver alerta |
| `GET` | `/api/v1/alerts/stats` | Estadísticas por severidad/estado |
| `GET` | `/api/v1/sensors` | Listar sensores del tenant |
| `POST` | `/api/v1/sensors` | Registrar sensor |
| `PATCH` | `/api/v1/sensors/{id}` | Actualizar sensor |
| `GET` | `/api/v1/rules` | Listar reglas |
| `POST` | `/api/v1/rules` | Crear regla |
| `PATCH` | `/api/v1/rules/{id}` | Actualizar regla |
| `DELETE` | `/api/v1/rules/{id}` | Eliminar regla |
| `PATCH` | `/api/v1/rules/{id}/toggle` | Activar/desactivar regla |
| `GET` | `/health` | Estado del servicio |

**Stack:** Python · FastAPI · asyncpg · TimescaleDB · aio-pika · structlog · Pydantic

---

### 6. Dashboard UI (React)

Panel de control web completo, servido directamente por Nginx desde `ui/dist/`.

**Pantallas:**

| Pantalla | Ruta | Descripción |
|----------|------|-------------|
| Login | `/login` | Inicio de sesión con email, contraseña y slug de organización |
| Dashboard | `/` | Métricas en tiempo real, gráfica de volumen, dona de severidades, alertas recientes |
| Alertas | `/alerts` | Tabla filtrable por estado/severidad; ACK y resolver con un clic |
| Eventos | `/events` | Feed de eventos crudos del pipeline de ingesta |
| Sensores | `/sensors` | Tarjetas con estado online/offline en tiempo real via WebSocket |
| Reglas | `/rules` | Tabla de reglas con toggle activo/inactivo instantáneo |
| Mapa | `/map` | Lista de sensores por ubicación |
| Ajustes | `/settings` | Preferencias de interfaz (rango de tiempo, sidebar) |

**Stack:** React 18 · Vite 5 · TanStack Router · TanStack Query · Zustand · Recharts · Radix UI · shadcn/ui · Tailwind CSS

---

## Infraestructura

| Componente | Imagen | Puerto(s) | Función |
|------------|--------|-----------|---------|
| **PostgreSQL + TimescaleDB** | `timescale/timescaledb:latest-pg16` | `5432` | Almacén principal con hipertablas de series temporales |
| **RabbitMQ** | `rabbitmq:3.13-management-alpine` | `5672` · `15672` | Bus de eventos AMQP interno |
| **Redis** | `redis:7.2-alpine` | `6379` | Caché de sesiones, lista negra de tokens, caché de reglas |
| **Mosquitto** | `eclipse-mosquitto:2.0` | `1883` · `9001` (WS) | Broker MQTT para dispositivos IoT |
| **Nginx** | `nginx:1.25-alpine` | `80` · `443` | API Gateway — proxy inverso, UI estática (React), rate limiting, CORS |

Todos los contenedores residen en una red bridge aislada de Docker (`172.20.0.0/16`) con asignaciones de IP fijas.

**Exchanges de RabbitMQ:**

| Exchange | Tipo | Utilizado por |
|----------|------|---------------|
| `perimetral.ingestion` | direct | Ingestion → Rule Engine |
| `perimetral.processed` | direct/topic | Rule Engine → Query API |
| `perimetral.alerts` | fanout | Rule Engine → Alert Service |

---

## Modelo de Datos

El esquema PostgreSQL es multi-tenant por diseño — cada tabla incluye una columna `tenant_id` con `ON DELETE CASCADE` para garantizar el aislamiento completo de datos.

```
tenants          ← Organización de nivel superior
  └── users      ← Usuarios con roles (admin / operator / viewer)
  └── sensors    ← Dispositivos IoT con tipo, ubicación y metadatos
  └── rules      ← Condiciones de alerta (árbol de condiciones JSON + severidad + cooldown)
  └── events     ← Hipertabla TimescaleDB (particionada por tiempo)
  └── alerts     ← Alertas disparadas con seguimiento de estado del ciclo de vida
```

**Decisiones de diseño clave:**
- `events` es una **hipertabla** de TimescaleDB para consultas eficientes por rango de tiempo y retención automática de datos
- `rules.condition` almacena el árbol de condiciones como `JSONB`, evaluado en tiempo de ejecución por el Rule Engine
- `rules.actions` es un array `TEXT[]` con los tipos de acción a ejecutar cuando se dispara la regla (ej. `["notify"]`, `["email", "slack"]`)
- `refresh_tokens` soporta revocación para una gestión de sesiones correcta
- Todas las claves primarias usan `UUID` (vía `gen_random_uuid()`)

---

## Flujo de Eventos

```
1. El dispositivo IoT publica un mensaje MQTT
   Tópico: sentineledge/{tenant_id}/sensors/{sensor_external_id}/events
   Payload: { "event_type": "motion_detected", "data": { "confidence": 0.97 } }

2. El Ingestion Service recibe el mensaje
   → Valida el payload (Pydantic)
   → Construye RawEventMessage
   → Publica en: perimetral.ingestion (RabbitMQ)

3. El Rule Engine Service consume RawEventMessage
   → Obtiene las reglas del tenant cacheadas desde Redis / PostgreSQL
   → Evalúa el árbol de condiciones contra los datos del evento
   → Construye EnrichedEventMessage (añade sensor_id, severity, matched_rule_id, actions)
   → Publica en: perimetral.processed (siempre)
   → Publica en: perimetral.alerts    (si la regla activa una alerta, incluye actions[])

4. El Query API Service consume perimetral.processed
   → Persiste el evento en la hipertabla events de TimescaleDB

5. El Alert Service consume perimetral.alerts
   → Persiste la alerta en PostgreSQL
   → Transmite la alerta a los clientes WebSocket (filtrado por tenant_id)
   → Dispatcher de acciones: ejecuta email / webhook / Slack definidos en la regla
```

---

## Dispatcher de Acciones

Cuando el Rule Engine dispara una alerta, el Alert Service ejecuta las acciones definidas en `rules.actions` de forma no bloqueante (fire-and-forget). **Un fallo en la notificación nunca impide que la alerta se persista ni corta el pipeline.**

**Tipos de acción:**

| Tipo | Descripción | Configuración requerida |
|------|-------------|------------------------|
| `notify` | Cascada: intenta email → webhook → Slack. Si ninguno está configurado, solo loguea. | Ninguna (siempre seguro) |
| `notify_email` / `email` | Email HTML al destinatario configurado | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `ALERT_EMAIL_RECIPIENT` |
| `webhook` | HTTP POST JSON al endpoint configurado | `ALERT_WEBHOOK_URL` |
| `slack` | Mensaje formateado a Slack Incoming Webhook | `SLACK_WEBHOOK_URL` |

**Configurar notificaciones en `.env`:**
```dotenv
# Email
SMTP_HOST=smtp.tuempresa.com
SMTP_PORT=587
SMTP_USER=alertas@tuempresa.com
SMTP_PASS=<your-smtp-password>
ALERT_EMAIL_RECIPIENT=ops@tuempresa.com

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...

# Webhook genérico
ALERT_WEBHOOK_URL=https://tu-sistema.com/webhooks/sentineledge
```
Aplicar sin reiniciar toda la plataforma:
```powershell
docker compose --env-file .env -f infrastructure/docker-compose.yml up -d alert-service
```

---

## Referencia de la API

### Autenticación

Todos los endpoints protegidos requieren un token Bearer en la cabecera `Authorization`:

```http
Authorization: Bearer <access_token>
```

Los tokens de acceso expiran a los 15 minutos. Usa `POST /api/v1/auth/refresh` con el token de refresco para obtener un nuevo token de acceso.

### Rate Limiting (Nginx)

| Zona | Límite | Aplicado a |
|------|--------|------------|
| `auth_limit` | Estricto | `/api/v1/auth/*` |
| `tenant_limit` | Por tenant | Todas las rutas autenticadas |
| `global_limit` | Global | Todas las rutas |

### Niveles de Severidad de Eventos

| Nivel | Descripción |
|-------|-------------|
| `low` | Informativo |
| `medium` | Requiere atención |
| `high` | Respuesta urgente necesaria |
| `critical` | Acción inmediata requerida |

### Ciclo de Vida del Estado de una Alerta

```
open  ──►  acknowledged  ──►  resolved
```

---

## Primeros Pasos

### Requisitos Previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (con Docker Compose)
- PowerShell 5.1+ (Windows) o PowerShell Core

### Inicio Rápido

**1. Clonar el repositorio:**
```powershell
git clone <repository-url>
cd SentinelEdge
```

**2. Crear el archivo de entorno:**
```powershell
.\dev.ps1 setup
```
Esto copia `.env.example` a `.env`. Edita `.env` y establece valores seguros para todos los secretos antes de continuar.

**3. Configurar las credenciales MQTT:**
```powershell
.\dev.ps1 mqtt:setup
```

**4. Levantar la plataforma completa:**
```powershell
.\dev.ps1 up
```

**5. Compilar la UI (primera vez o tras cambios en `ui/`):**
```powershell
.\dev.ps1 ui:build
```

Tras el arranque, los siguientes servicios estarán disponibles:

| Servicio | URL |
|---------|-----|
| **Dashboard UI** | `http://localhost` |
| Auth API | `http://localhost/api/v1/auth/` |
| Query API | `http://localhost/api/v1/` |
| API Docs (dev) | `http://localhost/api/docs` |
| WebSocket | `ws://localhost/ws` |
| RabbitMQ Mgmt | `http://localhost:15672` |
| MQTT Broker | `localhost:1883` |

**6. Publicar un evento de prueba:**
```powershell
.\dev.ps1 mqtt:test
```

> Para las credenciales del dashboard, consultado el [`docs/user-guide.md`](docs/user-guide.md).

---

## Herramientas de Desarrollo

El script `dev.ps1` es el punto de entrada único para todas las operaciones de desarrollo:

```powershell
.\dev.ps1 <comando>
```

| Comando | Descripción |
|---------|-------------|
| `setup` | Crear `.env` desde `.env.example` |
| `up` | Levantar la plataforma completa (infra + todos los servicios) |
| `up:infra` | Levantar solo la infraestructura (postgres, rabbitmq, redis, mosquitto, nginx) |
| `down` | Detener y eliminar todos los contenedores |
| `restart` | Reiniciar la plataforma completa |
| `build` | Reconstruir todas las imágenes Docker de los microservicios |
| `ui:build` | Compilar la UI React → `ui/dist/` (nginx la sirve automáticamente) |
| `ui:dev` | Dev server con hot-reload en `localhost:5173` (proxy → `localhost:80`) |
| `logs` | Ver logs de todos los servicios en tiempo real |
| `logs:<svc>` | Ver logs de un servicio específico (ej. `logs:auth`, `logs:ingestion`) |
| `status` | Mostrar el estado de todos los contenedores |
| `clean` | Eliminar contenedores, redes y volúmenes (destructivo) |
| `db` | Abrir una sesión `psql` interactiva |
| `rmq` | Abrir la UI de gestión de RabbitMQ en el navegador |
| `mqtt:setup` | Configurar usuario/contraseña MQTT en Mosquitto |
| `mqtt:test` | Publicar evento MQTT de prueba y verificar el pipeline completo |

**Ejemplos:**
```powershell
# Ver logs solo del rule engine
.\dev.ps1 logs:rule-engine

# Reconstruir microservicios y reiniciar tras un cambio de código
.\dev.ps1 build
.\dev.ps1 restart

# Cambios en la UI: recompilar y recargar nginx
.\dev.ps1 ui:build
docker exec perimetral_nginx nginx -s reload

# Desarrollar la UI con hot-reload (apunta al backend en :80)
.\dev.ps1 ui:dev

# Borrar todo y empezar de cero
.\dev.ps1 clean
.\dev.ps1 up
.\dev.ps1 ui:build
```

---

## Configuración

Toda la configuración se gestiona a través de un único archivo `.env` en la raíz del proyecto. Variables clave:

| Variable | Valor por defecto | Descripción |
|----------|-------------------|-------------|
| `JWT_SECRET` | *(requerido)* | Clave secreta para firmar JWTs — debe ser robusta y única |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | TTL del token de acceso |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | TTL del token de refresco |
| `POSTGRES_DB` | `perimetral_db` | Nombre de la base de datos PostgreSQL |
| `POSTGRES_USER` | `perimetral_user` | Usuario de PostgreSQL |
| `POSTGRES_PASSWORD` | *(requerido)* | Contraseña de PostgreSQL |
| `RABBITMQ_USER` | `perimetral_rmq` | Usuario de RabbitMQ |
| `RABBITMQ_PASS` | *(requerido)* | Contraseña de RabbitMQ |
| `RABBITMQ_VHOST` | `perimetral` | Virtual host de RabbitMQ |
| `MQTT_USERNAME` | `sentinel_ingestion` | Usuario del broker MQTT |
| `MQTT_PASSWORD` | *(requerido)* | Contraseña del broker MQTT |
| `MQTT_TOPIC_WILDCARD` | `sentineledge/+/sensors/+/events` | Patrón de suscripción MQTT |
| `RULE_CACHE_TTL_SECONDS` | `60` | TTL de la caché de reglas en Redis |
| `LOG_LEVEL` | `info` | Nivel de log para los servicios Python |
| `NODE_ENV` | `development` | Entorno de Node.js |

> **Nota de seguridad:** Nunca hagas commit del archivo `.env` al control de versiones. El archivo `.env.example` es el único archivo de entorno que debe ser rastreado por Git.

---

## Estructura del Proyecto

```
SentinelEdge/
├── dev.ps1                          # CLI de desarrollador (setup, up, build, ui:build…)
├── .env.example                     # Plantilla de variables de entorno
├── docs/
│   └── user-guide.md               # Manual de usuario del dashboard
│
├── infrastructure/
│   ├── docker-compose.yml           # Definición completa (10 contenedores)
│   ├── mosquitto/                   # Configuración del broker MQTT + credenciales
│   ├── nginx/                       # API Gateway: virtual host, CORS, rate limiting
│   │   └── conf.d/api.conf          # Proxy rules + serve UI estática con SPA fallback
│   ├── postgres/init/               # Migraciones del esquema (aplicadas al primer arranque)
│   ├── rabbitmq/                    # Configuración del broker + exchanges/colas
│   └── redis/                       # Configuración de Redis
│
├── services/
│   ├── auth-service/                # Node.js — IAM: login, JWT, roles, multi-tenant
│   ├── ingestion-service/           # Python — MQTT → RabbitMQ con reconexión automática
│   ├── rule-engine-service/         # Python — motor de condiciones JSONB + enriquecimiento
│   ├── alert-service/               # Node.js — alertas, WebSocket, dispatcher de acciones
│   │   └── src/actions/dispatcher.js  # email / webhook / Slack (fire-and-forget)
│   └── query-api-service/           # Python — API de lectura (eventos, alertas, sensores, reglas)
│
├── shared/
│   └── schemas/                     # Modelos Pydantic compartidos entre servicios Python
│       ├── event_schema.py          # RawEventMessage, EnrichedEventMessage
│       └── alert_schema.py          # AlertCreatedMessage
│
└── ui/                              # Dashboard React (Vite 5 + shadcn/ui + TanStack)
    ├── src/
    │   ├── pages/                   # Dashboard, Alerts, Events, Sensors, Rules, Map…
    │   ├── hooks/                   # useAlerts, useEvents, useSensors, useRules, useWebSocket
    │   ├── lib/                     # api.ts (axios + auth), ws.ts (WebSocket manager)
    │   └── store/                   # Zustand: alertStore, uiStore
    └── dist/                        # Build compilado — montado en nginx como raíz web
```

---

## Licencia

Este proyecto es de uso privado. Todos los derechos reservados.
