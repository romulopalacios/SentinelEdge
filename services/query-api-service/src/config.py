"""
Query API Service — Configuration
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    environment: str = "development"
    log_level: str = "info"
    port: int = 8003

    database_url: str = ""
    redis_url: str = "redis://redis:6379"
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/perimetral"

    # JWT (verify only)
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"

    # Pagination
    default_page_size: int = 50
    max_page_size: int = 500

    # RabbitMQ queues to consume (for DB persistence)
    persist_queue: str = "query-persist-queue"
    persist_exchange: str = "perimetral.processed"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
