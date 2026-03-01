"""
Rule Engine Service — Configuration
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    environment: str = "development"
    log_level: str = "info"
    port: int = 8002

    # RabbitMQ
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/perimetral"
    rabbitmq_input_exchange: str = "perimetral.ingestion"
    rabbitmq_input_queue: str = "rule-engine-queue"
    rabbitmq_output_exchange: str = "perimetral.processed"
    rabbitmq_alert_exchange: str = "perimetral.alerts"
    rabbitmq_prefetch: int = 50

    # PostgreSQL
    database_url: str = ""

    # Redis (rule cache)
    redis_url: str = "redis://redis:6379"
    rule_cache_ttl_seconds: int = 60

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
