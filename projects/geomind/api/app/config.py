"""Runtime settings, read from environment variables."""
import os
from dataclasses import dataclass, field


def _list(name: str, default: str) -> list[str]:
    return [s.strip() for s in os.getenv(name, default).split(",") if s.strip()]


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", ""))
    # Optional. When set, the assistant routes questions with Claude tool calling;
    # otherwise it uses the built-in rule-based parser. Keep this server-side only.
    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    claude_model: str = field(default_factory=lambda: os.getenv("CLAUDE_MODEL", "claude-opus-5-5"))
    cors_origins: list[str] = field(
        default_factory=lambda: _list("CORS_ORIGINS", "http://127.0.0.1:5174,http://localhost:5174,https://ryan12keith-eng.github.io")
    )
    seed_on_startup: bool = field(default_factory=lambda: os.getenv("SEED_ON_STARTUP", "false").lower() == "true")
    assistant_rate_per_minute: int = field(default_factory=lambda: int(os.getenv("ASSISTANT_RATE_PER_MINUTE", "20")))


settings = Settings()
