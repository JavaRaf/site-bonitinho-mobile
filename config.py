import os
from pathlib import Path
from datetime import timedelta
from flask.cli import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY") or "dev-secret-key-change-me"
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{BASE_DIR / 'db' / 'app.db'}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Recovery offline: sem envio de email

    SESSION_PERMANENT = True
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)
    SEND_FILE_MAX_AGE_DEFAULT = 300

    BASE_DIR = BASE_DIR
    DB_PATH = BASE_DIR / "db" / "app.db"
    THUMB_DIR = BASE_DIR / "thumbs"
    THUMB_SIZE = 480
    MAX_IMAGE_BYTES = 10 * 1024 * 1024
    ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
    ALL_MEDIA_EXTENSIONS = ALLOWED_EXTENSIONS | VIDEO_EXTENSIONS
    MAX_VIDEO_SECONDS = 60
    IMAGES_DIR = BASE_DIR / "images"


(Config.BASE_DIR / "db").mkdir(parents=True, exist_ok=True)
(Config.IMAGES_DIR).mkdir(parents=True, exist_ok=True)
(Config.THUMB_DIR).mkdir(parents=True, exist_ok=True)
(Config.BASE_DIR / "static" / "avatars").mkdir(parents=True, exist_ok=True)
(Config.BASE_DIR / "static" / "covers").mkdir(parents=True, exist_ok=True)
