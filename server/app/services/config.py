from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    firebase_credentials_path: str = "firebase_credentials.json"
    firebase_storage_bucket: str = ""
    frontend_url: str = "http://localhost:5173"
    vercel_team_slugs: str = "reinforce3,aryan-mishra-s-projects1"
    yuvi_bot_url: str = "http://localhost:8001/internal/verify-success"
    bot_internal_secret: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings():
    return Settings()
