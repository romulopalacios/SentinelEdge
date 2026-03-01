# SentinelEdge

**Plataforma de monitoreo de seguridad perimetral y eventos IoT en tiempo real.**

SentinelEdge es una plataforma de microservicios multi-tenant lista para producción, diseñada para ingestar, procesar y reaccionar a eventos de sensores de seguridad en tiempo real. Se conecta a dispositivos IoT físicos mediante MQTT, evalúa reglas de alerta configurables por tenant, persiste eventos enriquecidos en una base de datos de series temporales y envía notificaciones de alerta en vivo por WebSockets — todo detrás de un único API gateway.

---

## Tabla de Contenidos

- [Visión General de la Arquitectura](#visión-general-de-la-arquitectura)
- [Servicios](#servicios)
  - [Auth Service](#1-auth-service-nodejs)
  - [Ingestion Service](#2-ingestion-service-python)
  - [Rule Engine Service](#3-rule-engine-service-python)
  - [Alert Service](#4-alert-service-nodejs)
  - [Query API Service](#5-query-api-service-python)
- [Infraestructura](#infraestructura)
- [Modelo de Datos](#modelo-de-datos)
- [Flujo de Eventos](#flujo-de-eventos)
- [Referencia de la API](#referencia-de-la-api)
- [Primeros Pasos](#primeros-pasos)
- [Herramientas de Desarrollo](#herramientas-de-desarrollo)
- [Configuración](#configuración)
- [Estructura del Proyecto](#estructura-del-proyecto)

---

## Visión General de la Arquitectura

```
Sensores IoT / Dispositivos Edge
         │
         │  MQTT  (sentineledge/+/sensors/+/events)
         ▼
  ┌─────────────┐        AMQP (perimetral.ingestion)        ┌──────────────────┐
  │  Mosquitto  │ ──────────────────────────────────────► │ Ingestion Service  │
  │ MQTT Broker │                                           └──────────────────┘
  └─────────────┘                                                    │
                                                                     │ AMQP (eventos crudos)
                                                                     ▼
                                                          ┌──────────────────────┐
                                                          │  Rule Engine Service │
                                                          │  (Python / asyncio)  │
                                                          └──────────────────────┘
                                                           │                    │
                                          AMQP (procesados)          AMQP (alertas)
                                                           │                    │
                                                           ▼                    ▼
                                                  ┌──────────────┐   ┌──────────────────┐
                                                  │  Query API   │   │  Alert Service   │
                                                  │  (FastAPI)   │   │  (Node.js + WS)  │
                                                  └──────────────┘   └──────────────────┘
                                                           │                    │
                                             HTTP + JWT Auth         WebSocket /ws

Clientes ─────────────── Nginx API Gateway (:80 / :443) ───────────────────────────►
```

Todos los servicios se comunican a través de **RabbitMQ** como bus de eventos interno. Los clientes externos interactúan exclusivamente a través del **Nginx API Gateway**.

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
- Si una regla coincidente activa una alerta, también publica en `perimetral.alerts`

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

Los campos admiten notación de puntos para acceder a propiedades anidadas del payload (ej. `payload.zone`).

**Stack:** Python · FastAPI · asyncio · aio-pika · asyncpg · aioredis · structlog · tenacity

---

### 4. Alert Service (Node.js)

Distribución y persistencia de alertas en tiempo real.

**Responsabilidades:**
- Consume mensajes de alerta de `perimetral.alerts` vía RabbitMQ
- Persiste alertas en la tabla `alerts` de PostgreSQL con seguimiento de estado (`open`, `acknowledged`, `resolved`)
- Transmite nuevas alertas a clientes conectados a través de un servidor **WebSocket** (`/ws`)
- Soporte de aislamiento de sala WebSocket por tenant
- Expone un endpoint de salud

**Stack:** Node.js · Express · ws · aio-pika · pg · Pino

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
| `GET` | `/api/v1/events/{id}` | Obtener un evento puntual |
| `GET` | `/api/v1/alerts` | Listar alertas |
| `GET` | `/api/v1/alerts/{id}` | Obtener una alerta puntual |
| `GET` | `/api/v1/sensors` | Listar sensores del tenant |
| `GET` | `/api/v1/rules` | Listar reglas del tenant |
| `GET` | `/health` | Estado del servicio |

**Stack:** Python · FastAPI · asyncpg · TimescaleDB · aio-pika · structlog · Pydantic

---

## Infraestructura

| Componente | Imagen | Puerto(s) | Función |
|------------|--------|-----------|---------|
| **PostgreSQL + TimescaleDB** | `timescale/timescaledb:latest-pg16` | `5432` | Almacén principal con hipertablas de series temporales |
| **RabbitMQ** | `rabbitmq:3.13-management-alpine` | `5672` · `15672` | Bus de eventos AMQP interno |
| **Redis** | `redis:7.2-alpine` | `6379` | Caché de sesiones, lista negra de tokens, caché de reglas |
| **Mosquitto** | `eclipse-mosquitto:2.0` | `1883` · `9001` (WS) | Broker MQTT para dispositivos IoT |
| **Nginx** | `nginx:1.25-alpine` | `80` · `443` | API Gateway — proxy inverso, rate limiting, CORS, cabeceras de seguridad |

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
- `refresh_tokens` soporta revocación para una gestión de sesiones correcta
- Todas las claves primarias usan `UUID` (vía `gen_random_uuid()`)

---

## Flujo de Eventos

```
1. El dispositivo IoT publica un mensaje MQTT
   Tópico: sentineledge/{tenant_id}/sensors/{sensor_external_id}/events

2. El Ingestion Service recibe el mensaje
   → Valida el payload (Pydantic)
   → Construye RawEventMessage
   → Publica en: perimetral.ingestion (RabbitMQ)

3. El Rule Engine Service consume RawEventMessage
   → Obtiene las reglas del tenant cacheadas desde Redis / PostgreSQL
   → Evalúa el árbol de condiciones contra los datos del evento
   → Construye EnrichedEventMessage (añade sensor_id, severity, matched_rule_id)
   → Publica en: perimetral.processed (siempre)
   → Publica en: perimetral.alerts (si la regla activa una alerta)

4. El Query API Service consume perimetral.processed
   → Persiste el evento en la hipertabla events de TimescaleDB

5. El Alert Service consume perimetral.alerts
   → Persiste la alerta en PostgreSQL
   → Transmite la alerta a los clientes WebSocket (filtrado por tenant_id)
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

Tras el arranque, los siguientes endpoints estarán disponibles:

| Servicio | URL |
|---------|-----|
| API Gateway | `http://localhost:80` |
| Auth API | `http://localhost/api/v1/auth/` |
| Documentación Query API | `http://localhost/api/docs` |
| RabbitMQ Management | `http://localhost:15672` |
| Alert WebSocket | `ws://localhost/ws` |

**5. Levantar solo la infraestructura (sin servicios de aplicación):**
```powershell
.\dev.ps1 up:infra
```

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
| `logs` | Ver logs de todos los servicios en tiempo real |
| `logs:<svc>` | Ver logs de un servicio específico (ej. `logs:auth`, `logs:ingestion`) |
| `status` | Mostrar el estado de todos los contenedores |
| `clean` | Eliminar contenedores, redes y volúmenes (destructivo) |
| `db` | Abrir una sesión `psql` interactiva |
| `rmq` | Abrir la UI de gestión de RabbitMQ en el navegador |
| `mqtt:setup` | Configurar usuario/contraseña MQTT en Mosquitto |

**Ejemplos:**
```powershell
# Ver logs solo del rule engine
.\dev.ps1 logs:rule-engine

# Reconstruir y reiniciar tras un cambio de código
.\dev.ps1 build
.\dev.ps1 restart

# Borrar todo y empezar de cero
.\dev.ps1 clean
.\dev.ps1 up
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
├── dev.ps1                         # CLI para desarrolladores
├── .env.example                    # Plantilla de variables de entorno
│
├── infrastructure/
│   ├── docker-compose.yml          # Definición completa de la plataforma
│   ├── mosquitto/                  # Configuración del broker MQTT + credenciales
│   ├── nginx/                      # Configuración del API Gateway + virtual hosts
│   ├── postgres/init/              # Migraciones del esquema de BD (aplicadas automáticamente)
│   ├── rabbitmq/                   # Configuración del broker + definiciones de exchanges/colas
│   └── redis/                      # Configuración de Redis
│
├── services/
│   ├── auth-service/               # Node.js — Gestión de Identidad y Acceso
│   ├── ingestion-service/          # Python — Puente MQTT → RabbitMQ
│   ├── rule-engine-service/        # Python — Clasificación de eventos y alertas
│   ├── alert-service/              # Node.js — Persistencia de alertas y WebSocket
│   └── query-api-service/          # Python — API de lectura (eventos, alertas, sensores)
│
└── shared/
    └── schemas/                    # Modelos Pydantic compartidos entre servicios Python
        ├── event_schema.py         # RawEventMessage, EnrichedEventMessage
        └── alert_schema.py         # AlertCreatedMessage, AlertResponse
```

---

## Licencia

Este proyecto es de uso privado. Todos los derechos reservados.
