# SentinelEdge — Manual de Usuario

> **Versión de plataforma:** 1.0  
> **Audiencia:** Operadores de seguridad, administradores de tenant

---

## Tabla de Contenidos

1. [Acceso al Dashboard](#1-acceso-al-dashboard)
2. [Dashboard Principal](#2-dashboard-principal)
3. [Gestión de Alertas](#3-gestión-de-alertas)
4. [Visualización de Eventos](#4-visualización-de-eventos)
5. [Sensores](#5-sensores)
6. [Reglas de Alerta](#6-reglas-de-alerta)
7. [Mapa de Sensores](#7-mapa-de-sensores)
8. [Notificaciones en Tiempo Real](#8-notificaciones-en-tiempo-real)
9. [Ajustes de Interfaz](#9-ajustes-de-interfaz)
10. [Acceso a la API REST](#10-acceso-a-la-api-rest)
11. [Simular un Evento desde MQTT](#11-simular-un-evento-desde-mqtt)
12. [Referencia de Roles](#12-referencia-de-roles)
13. [Solución de Problemas Comunes](#13-solución-de-problemas-comunes)

---

## 1. Acceso al Dashboard

Abre un navegador y ve a:

```
http://localhost
```

Verás la pantalla de inicio de sesión de SentinelEdge.

### Iniciar sesión

Rellena los tres campos:

| Campo | Descripción | Valor por defecto (demo) |
|-------|-------------|--------------------------|
| **Organization** | Slug de tu organización | `demo-corp` |
| **Email** | Tu dirección de correo | `admin@demo.com` |
| **Password** | Tu contraseña | *(configurada en setup)* |

Haz clic en **Sign in**. Si las credenciales son correctas, serás redirigido al Dashboard.

> **Sesión:** El token de acceso dura 15 minutos. La sesión se renueva automáticamente en segundo plano mientras uses la aplicación. Si la sesión expira, la app te redirige al login.

---

## 2. Dashboard Principal

La pantalla `/` muestra el estado global de seguridad de tu tenant en tiempo real.

### Panel de métricas (fila superior)

| Tarjeta | Qué muestra |
|---------|------------|
| **Total Alerts** | Suma de todas las alertas en cualquier estado |
| **Open Alerts** | Alertas que todavía no han sido atendidas |
| **Critical** | Alertas con severidad `critical` activas |
| **Sensors Online** | Sensores marcados como activos |

Las tarjetas muestran un skeleton de carga mientras se obtienen los datos y se actualizan cada 30 segundos.

### Gráficas

**Event Volume (últimas 24 h)** — gráfica de barras con el volumen de eventos por hora. Útil para identificar picos de actividad.

**Alerts by Severity** — dona que muestra la distribución de alertas por nivel de severidad (`low`, `medium`, `high`, `critical`).

### Alertas recientes

Tabla con las 8 alertas abiertas más recientes. Muestra:
- Severidad (badge de color)
- Mensaje descriptivo
- Sensor que la originó
- Tiempo relativo desde que se creó (ej. "3 minutes ago")

---

## 3. Gestión de Alertas

Ruta: `/alerts`

La tabla de alertas es la herramienta principal para el equipo de operaciones.

### Filtros disponibles

| Filtro | Opciones |
|--------|----------|
| **Status** | All · Open · Acknowledged · Resolved |
| **Severity** | All · Critical · High · Medium · Low |

Los filtros se aplican de forma inmediata (sin botón de confirmación). El contador en la esquina superior derecha muestra el número total de resultados.

### Ciclo de vida de una alerta

```
open  →  acknowledged  →  resolved
```

| Estado | Significado | Quién lo cambia |
|--------|-------------|-----------------|
| `open` | Alerta recién creada, sin atender | Sistema |
| `acknowledged` | Un operador la vio y la tomó | Operador / Admin |
| `resolved` | Incidente cerrado | Operador / Admin |

### Reconocer una alerta (Acknowledge)

1. Localiza la alerta en la tabla (filtra por `status: open` si hay muchas).
2. Haz clic en el botón **ACK** en la columna Actions.
3. El estado cambia a `acknowledged` y la fila desaparece del filtro "Open".

### Resolver una alerta

1. Localiza la alerta (puede estar en estado `open` o `acknowledged`).
2. Haz clic en **Resolve**.
3. El estado cambia a `resolved`. La alerta queda como registro histórico.

> **Nota:** Las acciones ACK y Resolve son inmediatas y no requieren confirmación. Si necesitas añadir notas o comentarios a una alerta, hazlo a través de la API REST (ver sección 10).

### Badges de severidad

| Color | Severidad | Acción recomendada |
|-------|-----------|--------------------|
| 🔴 Rojo | `critical` | Respuesta inmediata |
| 🟠 Naranja | `high` | Atender en menos de 1 hora |
| 🟡 Amarillo | `medium` | Revisar durante el turno |
| 🔵 Azul | `low` | Informativo |

---

## 4. Visualización de Eventos

Ruta: `/events`

Muestra el feed de eventos **crudos** tal como llegaron al pipeline de ingesta, antes de convertirse en alertas.

### Diferencia entre Evento y Alerta

| | Evento | Alerta |
|-|--------|--------|
| **Qué es** | Mensaje raw del sensor | Resultado de evaluar una regla |
| **Siempre existe** | Sí (todo lo que entra) | No (solo si una regla coincide) |
| **Tiene estado** | No (solo `processed: Yes/No`) | Sí (open / acknowledged / resolved) |

### Columnas de la tabla

| Columna | Descripción |
|---------|-------------|
| **Type** | Tipo de evento (`motion_detected`, `intrusion`, etc.) |
| **Severity** | Severidad asignada por el Rule Engine |
| **Sensor** | Primeros 8 caracteres del UUID del sensor |
| **Processed** | Si el evento pasó exitosamente por el Rule Engine |
| **Time** | Timestamp de creación |

### Filtro de severidad

El selector superior filtra los eventos por nivel de severidad. Útil para buscar eventos que deberían haberse convertido en alertas pero no lo hicieron (evento presente pero `processed: No` puede indicar un error en el Rule Engine).

---

## 5. Sensores

Ruta: `/sensors`

Muestra todos los sensores registrados para el tenant actual como tarjetas visuales.

### Información de cada tarjeta

| Campo | Descripción |
|-------|-------------|
| **Nombre** | Nombre descriptivo del sensor |
| **Tipo** | Tipo técnico (ej. `pir_motion`, `door_contact`) |
| **Ubicación** | Localización física si fue configurada |
| **Estado** | `Online` (verde, indicador pulsante) / `Offline` (gris) |
| **Última actividad** | Tiempo relativo desde el último evento recibido |

> **Estado Online/Offline** se determina por el campo `is_active` del sensor. El Ingestion Service actualiza automáticamente `last_seen` cada vez que llega un evento de ese sensor.

### Registrar un nuevo sensor

Por el momento, los sensores se registran vía API REST. Ejemplo:

```bash
curl -X POST http://localhost/api/v1/sensors \
  -H "Authorization: Bearer <tu_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "sensor-puerta-norte",
    "name": "Puerta Norte — Edificio A",
    "type": "door_contact",
    "location": "Planta Baja, Acceso Norte"
  }'
```

El `external_id` debe coincidir con el que el dispositivo IoT usa en el tópico MQTT:
```
sentineledge/demo-corp/sensors/sensor-puerta-norte/events
```

---

## 6. Reglas de Alerta

Ruta: `/rules`

Las reglas definen cuándo un evento genera una alerta y qué acciones se ejecutan.

### Tabla de reglas

| Columna | Descripción |
|---------|-------------|
| **Name** | Nombre descriptivo de la regla |
| **Condition** | Condición resumida (campo, operador, valor) |
| **Severity** | Severidad que se asigna al dispararse |
| **Actions** | Acciones que ejecuta al crear la alerta |
| **Priority** | Número de prioridad (menor número = mayor prioridad) |
| **Active** | Toggle para activar/desactivar la regla |

### Activar / Desactivar una regla

Usa el toggle en la columna **Active**. El cambio es inmediato y aparece un toast de confirmación. La regla desactivada deja de evaluarse en el Rule Engine (la caché se invalida en hasta 60 segundos).

### Crear una regla vía API

```bash
curl -X POST http://localhost/api/v1/rules \
  -H "Authorization: Bearer <tu_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Detección de intrusión de alta confianza",
    "description": "Dispara alerta crítica cuando confianza del sensor >= 0.9",
    "condition": {
      "and": [
        { "field": "event_type", "operator": "eq", "value": "motion_detected" },
        { "field": "data.confidence", "operator": "gte", "value": 0.9 }
      ]
    },
    "severity": "critical",
    "actions": ["notify"],
    "priority": 1
  }'
```

### Operadores de condición disponibles

| Operador | Significado | Ejemplo |
|----------|-------------|---------|
| `eq` | Igual a | `"field": "event_type", "operator": "eq", "value": "intrusion"` |
| `ne` | Distinto de | `"field": "event_type", "operator": "ne", "value": "camera_offline"` |
| `gt` / `gte` | Mayor que / Mayor o igual | `"field": "data.confidence", "operator": "gte", "value": 0.8` |
| `lt` / `lte` | Menor que / Menor o igual | `"field": "data.temperature", "operator": "lt", "value": 5` |
| `in` | Está en lista | `"field": "data.zone", "operator": "in", "value": ["A", "B", "C"]` |
| `nin` | No está en lista | `"field": "event_type", "operator": "nin", "value": ["test", "debug"]` |
| `contains` | Contiene (substring) | `"field": "data.description", "operator": "contains", "value": "forced"` |

Los campos admiten **notación de puntos** para acceder a propiedades anidadas del payload:
- `data.confidence` → `payload.data.confidence`
- `data.zone` → `payload.data.zone`
- `event_type` → campo de nivel superior

### Tipos de acción (`actions`)

| Valor | Qué hace | Requiere configuración |
|-------|----------|----------------------|
| `notify` | Cascada: email → webhook → Slack → solo log | No (siempre seguro) |
| `email` | Email HTML al destinatario configurado | `SMTP_*` + `ALERT_EMAIL_RECIPIENT` en `.env` |
| `webhook` | HTTP POST al endpoint configurado | `ALERT_WEBHOOK_URL` en `.env` |
| `slack` | Mensaje al canal de Slack configurado | `SLACK_WEBHOOK_URL` en `.env` |

---

## 7. Mapa de Sensores

Ruta: `/map`

Muestra un panel lateral con todos los sensores y su estado (online/offline). La sección izquierda está preparada para integrar un mapa interactivo (react-leaflet).

Para habilitar el mapa interactivo en el futuro, necesitarías:
1. Agregar coordenadas `lat`/`lng` al modelo de sensor
2. Instalar `react-leaflet` en `ui/`
3. Implementar el componente `<MapView>` reemplazando el placeholder actual

---

## 8. Notificaciones en Tiempo Real

SentinelEdge usa **WebSocket** para enviar alertas nuevas al dashboard sin necesidad de recargar la página.

### Cómo funciona

1. Al abrir la app, el WebSocket manager (`lib/ws.ts`) se conecta a `ws://localhost/ws?token=<jwt>`
2. Cuando el Alert Service crea una nueva alerta, la transmite a todos los clientes del tenant
3. El `alertStore` (Zustand) recibe el mensaje y actualiza el estado global
4. El contador de alertas del sidebar y las tablas se actualizan automáticamente

### Indicadores visuales en tiempo real

- El contador de **Open Alerts** en el Dashboard se incrementa automáticamente
- Aparece un **toast de notificación** en la esquina inferior con el título de la nueva alerta
- La tabla de alertas recientes en el Dashboard refleja las nuevas alertas de inmediato

### Reconexión automática

Si la conexión WebSocket se interrumpe, el cliente reintenta con backoff exponencial (1 s → 30 s). No necesitas recargar la página.

---

## 9. Ajustes de Interfaz

Ruta: `/settings`

| Ajuste | Descripción |
|--------|-------------|
| **Default time range** | Rango temporal usado por defecto en gráficas: 1h, 6h, 24h, 7d, 30d |
| **Collapsed sidebar** | Colapsa el menú lateral para maximizar el área de trabajo |

Los ajustes se guardan localmente en el navegador (Zustand persisted store).

---

## 10. Acceso a la API REST

Todas las operaciones del dashboard están disponibles directamente via API REST. Útil para integraciones, scripts de automatización y auditorías.

### Obtener un access token

```bash
curl -s -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"tu_password","tenant_slug":"demo-corp"}' \
  | jq '{access_token, refresh_token}'
```

Guarda el `access_token` para usarlo en las siguientes peticiones.

### Ejemplos de uso

**Listar alertas abiertas de alta severidad:**
```bash
curl "http://localhost/api/v1/alerts?status=open&severity=high&page_size=20" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | {id, title, triggered_at}'
```

**Reconocer una alerta:**
```bash
curl -X POST "http://localhost/api/v1/alerts/{alert_id}/acknowledge" \
  -H "Authorization: Bearer $TOKEN"
```

**Ver estadísticas de alertas:**
```bash
curl "http://localhost/api/v1/alerts/stats" \
  -H "Authorization: Bearer $TOKEN" | jq
# → { "open": 3, "by_status": [...], "by_severity": [...] }
```

**Listar todos los sensores:**
```bash
curl "http://localhost/api/v1/sensors" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | {id, name, is_active}'
```

**Listar reglas activas:**
```bash
curl "http://localhost/api/v1/rules?is_active=true" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | {name, severity, actions}'
```

**Obtener serie temporal de eventos (últimas 24 h, agrupado por hora):**
```bash
curl "http://localhost/api/v1/events/timeseries?interval=1h&limit=24" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Documentación interactiva (Swagger)

En entornos de desarrollo, accede a la documentación completa de la API en:
```
http://localhost/api/docs
```

---

## 11. Simular un Evento desde MQTT

Esto es útil para probar el pipeline completo (MQTT → Rule Engine → Alert → Dashboard) sin necesitar hardware físico.

### Opción A — Usando dev.ps1 (recomendado)

```powershell
.\dev.ps1 mqtt:test
```

Publica automáticamente un evento `motion_detected` con `confidence: 0.95` en el tópico del tenant `demo-corp`.

### Opción B — Publicación manual con mosquitto_pub

```powershell
# Desde PowerShell, en el directorio del proyecto
$payload = '{"event_type":"motion_detected","data":{"zone":"entrance","confidence":0.97}}'
$netName = docker network ls --filter "name=perimetral-net" --format "{{.Name}}" | Select-Object -First 1

Write-Output $payload | docker run --rm -i --network $netName eclipse-mosquitto:2.0 `
  mosquitto_pub -h mosquitto -p 1883 `
  -u sentinel_ingestion -P <MQTT_PASSWORD> `
  -t "sentineledge/demo-corp/sensors/sensor-001/events" `
  -s
```

Reemplaza `<MQTT_PASSWORD>` con el valor de `MQTT_PASSWORD` en tu `.env`.

### Opción C — Publicación desde Python dentro del contenedor

```powershell
docker exec perimetral_ingestion python -c "
import paho.mqtt.client as mqtt, json, os
c = mqtt.Client()
c.username_pw_set(os.environ['MQTT_USERNAME'], os.environ['MQTT_PASSWORD'])
c.connect(os.environ['MQTT_HOST'], int(os.environ['MQTT_PORT']))
payload = json.dumps({'event_type': 'intrusion', 'data': {'zone': 'B', 'confidence': 0.99}})
c.publish('sentineledge/demo-corp/sensors/sensor-001/events', payload, qos=1)
c.disconnect()
print('Publicado:', payload)
"
```

### Verificar que el pipeline funcionó

1. **UI:** Ve al Dashboard — deberías ver una nueva alerta en la tabla "Recent Alerts" en segundos.
2. **Logs del Alert Service:**
   ```powershell
   .\dev.ps1 logs:alert
   ```
   Busca: `alert-service: alert created` con el `alertId` y la severidad.
3. **Logs del Rule Engine:**
   ```powershell
   .\dev.ps1 logs:rule-engine
   ```
   Busca: `rule matched` y `alert triggered`.
4. **Contador de eventos vía API:**
   ```bash
   curl "http://localhost/api/v1/events/stats" -H "Authorization: Bearer $TOKEN"
   ```

---

## 12. Referencia de Roles

| Rol | Puede ver | Puede ACK/Resolve alertas | Puede gestionar reglas/sensores | Puede gestionar usuarios |
|-----|-----------|--------------------------|--------------------------------|--------------------------|
| `viewer` | Todo | No | No | No |
| `operator` | Todo | Sí | No | No |
| `admin` | Todo | Sí | Sí | Sí |

> Los roles se asignan al crear o editar un usuario. Solo un `admin` puede cambiar roles.

---

## 13. Solución de Problemas Comunes

### No veo el dashboard al entrar a `http://localhost`

**Causa probable:** La UI no ha sido compilada o el nginx no tiene el build montado.

**Solución:**
```powershell
.\dev.ps1 ui:build
docker exec perimetral_nginx nginx -s reload
```

### El login falla con "Invalid credentials"

Verifica que:
1. Los servicios estén levantados: `.\dev.ps1 status`
2. El `tenant_slug` en el formulario coincida exactamente con el de tu organización (ej. `demo-corp`)
3. La contraseña es correcta (se configuró durante `.\dev.ps1 setup`)

### Publico eventos MQTT pero no aparecen alertas

Comprueba en orden:

1. **¿Llegó al Ingestion Service?**
   ```powershell
   .\dev.ps1 logs:ingestion
   # Busca: "event received" o "published to RabbitMQ"
   ```

2. **¿El Rule Engine lo procesó?**
   ```powershell
   .\dev.ps1 logs:rule-engine
   # Busca: "processing event" — si no aparece, el evento no llegó desde RabbitMQ
   ```

3. **¿Existe una regla que coincida?**
   - Ve a `/rules` y verifica que hay reglas activas
   - Comprueba que la condición de la regla coincide con el `event_type` y los campos `data.*` que publicaste

4. **¿El sensor está registrado?**
   - El `sensor_external_id` en el tópico MQTT debe existir en la tabla `sensors`
   - Regístralo si es necesario (ver sección 5)

### Los contenedores se reinician constantemente

```powershell
# Ver estado de todos los contenedores
.\dev.ps1 status

# Ver logs del contenedor problemático
.\dev.ps1 logs:auth   # o el servicio que falla
```

**Causa más común:** `JWT_SECRET` no está configurado en `.env`. Asegúrate de tener un valor en esa variable.

### La UI muestra datos viejos

TanStack Query cachea los datos con un `staleTime` de 30-60 segundos. Para forzar una recarga inmediata, recarga la página con `Ctrl+F5` o espera a que expire el caché.

### ¿Cómo reiniciar solo un servicio sin bajar la plataforma?

```powershell
docker compose --env-file .env -f infrastructure/docker-compose.yml restart alert-service
# o para reconstruir la imagen:
docker compose --env-file .env -f infrastructure/docker-compose.yml up -d --build alert-service
```

---

*Para preguntas técnicas sobre la arquitectura o configuraciones avanzadas, consulta el [README.md](../README.md) principal.*
