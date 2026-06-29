import os
import sys
from pathlib import Path


def _load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    pkg = Path(__file__).resolve().parent
    repo = pkg.parents[3]
    load_dotenv(repo / ".env")
    load_dotenv(pkg.parent / ".env")


def main() -> None:
    _load_env()
    import uvicorn

    host = os.environ.get("BRIDGE_HOST", "0.0.0.0")
    port = int(os.environ.get("BRIDGE_PORT", "8765"))
    uvicorn.run(
        "telegram_news_bridge.app:app",
        host=host,
        port=port,
        reload=os.environ.get("BRIDGE_RELOAD", "").lower() in ("1", "true", "yes"),
    )


if __name__ == "__main__":
    sys.exit(main() or 0)
