from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://benkyo:benkyo@db:5432/benkyo"
    WORKSPACES_DIR: str = "/app/workspaces"
    UPLOADS_DIR: str = "/app/uploads"
    SECRET_KEY: str = "changeme"

    @property
    def workspaces_path(self) -> Path:
        return Path(self.WORKSPACES_DIR)

    @property
    def uploads_path(self) -> Path:
        return Path(self.UPLOADS_DIR)

    class Config:
        env_file = ".env"


settings = Settings()
