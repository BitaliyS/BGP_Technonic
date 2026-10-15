from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Технониколь-ИИ"
    database_url: str = "sqlite+aiosqlite:///./technonicol.db"
    jwt_secret: str = "technonicol-dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    upload_dir: str = str(Path(__file__).resolve().parents[3] / "data" / "uploads")
    default_models: list[str] = [
        "deepseek-chat",
        "deepseek-reasoner",
    ]
    openai_api_key: str = ""
    gemini_api_key: str = ""
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"


settings = Settings()
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
