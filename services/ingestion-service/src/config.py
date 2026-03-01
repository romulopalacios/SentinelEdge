"""
Ingestion Service — Configuration
"""
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    environment: str = "development"
    log_level: str = "info"

    # HTTP / Health
    port: int = 8001

    # MQTT
    mqtt_host: str = "mosquitto"
    mqtt_port: int = 1883
    mqtt_username: str = "sentinel_ingestion"
    mqtt_password: str = ""
    mqtt_topic_wildcard: str = "sentineledge/+/sensors/+/events"
    mqtt_client_id: str = "ingestion-service-01"
    mqtt_keepalive: int = 60
    mqtt_qos: int = 1

    # RabbitMQ
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/perimetral"
    rabbitmq_exchange: str = "perimetral.ingestion"
    rabbitmq_routing_key: str = "event.raw"

    # PostgreSQL (para lookup de sensores/tenants)
    database_url: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
