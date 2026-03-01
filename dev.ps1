# ==============================================================================
# dev.ps1 - SentinelEdge DevTools (Windows / PowerShell)
# ==============================================================================
# Uso:
#   .\dev.ps1 setup      -> Crea .env desde .env.example
#   .\dev.ps1 up         -> Levanta TODA la plataforma (infra + servicios)
#   .\dev.ps1 up:infra   -> Solo infraestructura (postgres, rabbitmq, redis, nginx, mosquitto)
#   .\dev.ps1 down       -> Detiene y elimina contenedores
#   .\dev.ps1 restart    -> Reinicia todo
#   .\dev.ps1 logs       -> Logs de todos los servicios
#   .\dev.ps1 logs:svc   -> Logs de un servicio especifico (ej: "logs:auth")
#   .\dev.ps1 status     -> Estado de contenedores
#   .\dev.ps1 clean      -> Elimina contenedores, redes y volumenes
#   .\dev.ps1 db         -> Abre psql interactivo
#   .\dev.ps1 rmq        -> Abre RabbitMQ Management en el browser
#   .\dev.ps1 mqtt:setup -> Configura usuario/password MQTT en Mosquitto
#   .\dev.ps1 build      -> Reconstruye imagenes de los microservicios
# ==============================================================================

param(
    [Parameter(Position=0)]
    [string]$Command = "help"
)

$COMPOSE_FILE = "infrastructure\docker-compose.yml"
$ENV_FILE     = ".env"
$ENV_EXAMPLE  = ".env.example"

$INFRA_SERVICES    = @("postgres","rabbitmq","redis","mosquitto","nginx")
$APP_SERVICES      = @("auth-service","ingestion-service","rule-engine-service","alert-service","query-api-service")
$SERVICE_NAMES     = @{
    "auth"        = "auth-service"
    "ingestion"   = "ingestion-service"
    "rule-engine" = "rule-engine-service"
    "alert"       = "alert-service"
    "query"       = "query-api-service"
    "postgres"    = "postgres"
    "rabbitmq"    = "rabbitmq"
    "redis"       = "redis"
    "mosquitto"   = "mosquitto"
    "nginx"       = "nginx"
}

function Write-Header {
    param([string]$text)
    Write-Host ""
    Write-Host "  >> $text" -ForegroundColor Cyan
    Write-Host ""
}

function Assert-EnvFile {
    if (-not (Test-Path $ENV_FILE)) {
        Write-Host "  [WARN] .env no encontrado. Ejecuta: .\dev.ps1 setup" -ForegroundColor Yellow
        exit 1
    }
}

function Read-EnvVars {
    $vars = @{}
    if (Test-Path $ENV_FILE) {
        Get-Content $ENV_FILE | Where-Object { $_ -match "^\s*[^#].*=" } | ForEach-Object {
            $parts = $_ -split "=", 2
            $vars[$parts[0].Trim()] = $parts[1].Trim().Trim('"')
        }
    }
    return $vars
}

# --- Comandos con prefijo (logs:svc, etc.) ---------------------------------------
$prefix, $arg = $Command -split ":", 2

switch ($prefix) {

    "setup" {
        Write-Header "Configurando entorno de desarrollo"
        if (Test-Path $ENV_FILE) {
            Write-Host "  .env ya existe. Omitiendo." -ForegroundColor Yellow
        } else {
            Copy-Item $ENV_EXAMPLE $ENV_FILE
            Write-Host "  .env creado desde .env.example" -ForegroundColor Green
            Write-Host "  IMPORTANTE: Edita .env con tus valores antes de continuar." -ForegroundColor Yellow
        }
    }

    "up" {
        Assert-EnvFile
        if ($arg -eq "infra") {
            Write-Header "Levantando solo infraestructura base"
            docker compose --env-file $ENV_FILE -f $COMPOSE_FILE up -d $INFRA_SERVICES
        } else {
            Write-Header "Levantando plataforma completa"
            docker compose --env-file $ENV_FILE -f $COMPOSE_FILE up -d --build
        }
        Write-Host ""
        Write-Host "  Servicios disponibles:" -ForegroundColor Green
        Write-Host "  --- Infraestructura ------------------------------------------"
        Write-Host "  - PostgreSQL (TimescaleDB) -> localhost:5432"
        Write-Host "  - RabbitMQ AMQP            -> localhost:5672"
        Write-Host "  - RabbitMQ Management      -> http://localhost:15672"
        Write-Host "  - Redis                    -> localhost:6379"
        Write-Host "  - MQTT Broker (Mosquitto)  -> localhost:1883  (WS: 9001)"
        Write-Host "  - Nginx API Gateway        -> http://localhost:80"
        Write-Host "  --- Microservicios -------------------------------------------"
        Write-Host "  - Auth Service             -> (via gateway) /api/v1/auth/"
        Write-Host "  - Query API Service        -> (via gateway) /api/v1/events|alerts|sensors|rules"
        Write-Host "  - Alert Service            -> (via gateway) /ws/"
        Write-Host "  - Ingestion Service        -> interno"
        Write-Host "  - Rule Engine Service      -> interno"
        Write-Host ""
    }

    "down" {
        Write-Header "Deteniendo servicios"
        docker compose --env-file $ENV_FILE -f $COMPOSE_FILE down
    }

    "restart" {
        Write-Header "Reiniciando plataforma"
        docker compose --env-file $ENV_FILE -f $COMPOSE_FILE down
        docker compose --env-file $ENV_FILE -f $COMPOSE_FILE up -d --build
    }

    "build" {
        Assert-EnvFile
        Write-Header "Reconstruyendo imágenes de microservicios"
        docker compose --env-file $ENV_FILE -f $COMPOSE_FILE build $APP_SERVICES
    }

    "logs" {
        $svc = ""
        if ($arg) {
            $svc = $arg
            if ($SERVICE_NAMES.ContainsKey($arg)) {
                $svc = $SERVICE_NAMES[$arg]
            }
            Write-Header "Logs de: $svc (Ctrl+C para salir)"
            docker compose --env-file $ENV_FILE -f $COMPOSE_FILE logs -f --tail=100 $svc
        } else {
            Write-Header "Logs de todos los servicios (Ctrl+C para salir)"
            docker compose --env-file $ENV_FILE -f $COMPOSE_FILE logs -f --tail=100
        }
    }

    "status" {
        Write-Header "Estado de contenedores"
        docker compose --env-file $ENV_FILE -f $COMPOSE_FILE ps
    }

    "clean" {
        Write-Header "Limpieza completa (contenedores + volúmenes)"
        Write-Host "  ¡ADVERTENCIA: Esto eliminará todos los datos!" -ForegroundColor Red
        $confirm = Read-Host "  ¿Confirmar? (s/N)"
        if ($confirm -ieq "s") {
            docker compose --env-file $ENV_FILE -f $COMPOSE_FILE down -v --remove-orphans
            Write-Host "  Limpieza completada." -ForegroundColor Green
        } else {
            Write-Host "  Cancelado."
        }
    }

    "db" {
        Assert-EnvFile
        Write-Header "Conectando a PostgreSQL"
        $vars = Read-EnvVars
        $user = if ($vars["POSTGRES_USER"]) { $vars["POSTGRES_USER"] } else { "perimetral_user" }
        $db   = if ($vars["POSTGRES_DB"])   { $vars["POSTGRES_DB"] }   else { "perimetral_db" }
        docker exec -it perimetral_postgres psql -U $user -d $db
    }

    "rmq" {
        Write-Header "Abriendo RabbitMQ Management"
        Start-Process "http://localhost:15672"
        Write-Host "  Usuario: perimetral_rmq  |  (ver .env para contraseña)" -ForegroundColor Cyan
    }

    "mqtt" {
        if ($arg -eq "setup") {
            Assert-EnvFile
            Write-Header "Configurando credenciales MQTT en Mosquitto"
            $vars = Read-EnvVars
            $user = if ($vars["MQTT_USERNAME"]) { $vars["MQTT_USERNAME"] } else { "sentinel_ingestion" }
            $pass = if ($vars["MQTT_PASSWORD"]) { $vars["MQTT_PASSWORD"] } else { "" }
            if (-not $pass) {
                Write-Host "  [ERROR] Define MQTT_PASSWORD en .env primero." -ForegroundColor Red
                exit 1
            }
            # Generate passwd file via temp container, write result to host
            $passwdPath = Join-Path $PSScriptRoot "infrastructure\mosquitto\passwd"
            $passwdContent = docker run --rm eclipse-mosquitto:2.0 sh -c "mosquitto_passwd -b -c /tmp/p '$user' '$pass' && cat /tmp/p"
            if ($LASTEXITCODE -ne 0 -or -not $passwdContent) {
                Write-Host "  [ERROR] No se pudo generar el archivo passwd." -ForegroundColor Red
                exit 1
            }
            Set-Content -Path $passwdPath -Value $passwdContent -Encoding ascii -NoNewline
            Write-Host "  Usuario MQTT '$user' configurado." -ForegroundColor Green
            # Restart mosquitto to reload credentials
            docker compose --env-file $ENV_FILE -f $COMPOSE_FILE restart mosquitto
        } elseif ($arg -eq "test") {
            Assert-EnvFile
            Write-Header "Publicando evento MQTT de prueba"
            $vars = Read-EnvVars
            $user = if ($vars["MQTT_USERNAME"]) { $vars["MQTT_USERNAME"] } else { "sentinel_ingestion" }
            $pass = if ($vars["MQTT_PASSWORD"]) { $vars["MQTT_PASSWORD"] } else { "change_me_mqtt_password" }
            $testPayload = '{"event_type":"motion_detected","sensor_id":"sensor-001","data":{"zone":"entrance","confidence":0.95}}'
            # Detect network name (fixed 'perimetral-net' or legacy 'infrastructure_perimetral-net')
            $netName = docker network ls --filter "name=perimetral-net" --format "{{.Name}}" 2>$null | Select-Object -First 1
            if (-not $netName) {
                Write-Host "  [ERROR] Red perimetral-net no encontrada. Ejecuta: .\dev.ps1 up:infra" -ForegroundColor Red
                exit 1
            }
            Write-Output $testPayload | docker run --rm -i --network $netName eclipse-mosquitto:2.0 `
                mosquitto_pub -h mosquitto -p 1883 `
                -u $user -P $pass `
                -t "sentineledge/demo-corp/sensors/sensor-001/events" `
                -s
            Write-Host "  Evento publicado en sentineledge/demo-corp/sensors/sensor-001/events" -ForegroundColor Green
        } else {
            Write-Host "  Subcomandos disponibles: mqtt:setup, mqtt:test" -ForegroundColor Yellow
        }
    }

    default {
        Write-Host ""
        Write-Host "  +======================================================+" -ForegroundColor Cyan
        Write-Host "  |  SentinelEdge - Plataforma de Seguridad Perimetral  |" -ForegroundColor Cyan
        Write-Host "  +======================================================+" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  Uso:  .\dev.ps1 <comando>" -ForegroundColor White
        Write-Host ""
        Write-Host "  Comandos principales:"
        Write-Host "    setup         -> Crea .env desde .env.example"
        Write-Host "    up            -> Levanta plataforma completa (infra + servicios)"
        Write-Host "    up:infra      -> Solo infraestructura (DB, MQ, Redis, MQTT, Nginx)"
        Write-Host "    build         -> Reconstruye imagenes de microservicios"
        Write-Host "    down          -> Detiene contenedores"
        Write-Host "    restart       -> Reinicia todo"
        Write-Host "    status        -> Estado de todos los contenedores"
        Write-Host "    clean         -> Elimina contenedores Y todos los datos"
        Write-Host ""
        Write-Host "  Logs:"
        Write-Host "    logs          -> Logs de todos los servicios"
        Write-Host "    logs:auth     -> Logs del Auth Service"
        Write-Host "    logs:ingestion-> Logs del Ingestion Service"
        Write-Host "    logs:rule-engine -> Logs del Rule Engine"
        Write-Host "    logs:alert    -> Logs del Alert Service"
        Write-Host "    logs:query    -> Logs del Query API Service"
        Write-Host ""
        Write-Host "  Herramientas:"
        Write-Host "    db            -> Abre psql interactivo"
        Write-Host "    rmq           -> Abre RabbitMQ Management en browser"
        Write-Host "    mqtt:setup    -> Configura usuario/password en Mosquitto"
        Write-Host "    mqtt:test     -> Publica evento MQTT de prueba"
        Write-Host ""
    }
}
