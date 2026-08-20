from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def init_app(app):
    db.init_app(app)
    with app.app_context():
        from db import models  # noqa: F401
        db.create_all()
        _run_migrations()
        _seed_default_settings()


def _run_migrations():
    from sqlalchemy import text
    migrations = [
        ("users", "is_admin", "INTEGER NOT NULL DEFAULT 0"),
        ("users", "avatar", "TEXT NOT NULL DEFAULT 'default-avatar.svg'"),
        ("users", "color", "TEXT NOT NULL DEFAULT ''"),
        ("uploads", "active", "INTEGER NOT NULL DEFAULT 1"),
        ("uploads", "caption", "TEXT NOT NULL DEFAULT ''"),
        ("uploads", "nsfw", "INTEGER NOT NULL DEFAULT 0"),
        ("comments", "parent_id", "INTEGER REFERENCES comments(id) ON DELETE CASCADE"),
        ("push_notifications", "image_name", "TEXT NOT NULL DEFAULT ''"),
        ("uploads", "post_type", "TEXT NOT NULL DEFAULT 'image'"),
        ("uploads", "post_id", "TEXT NOT NULL DEFAULT ''"),
        ("uploads", "media_type", "TEXT NOT NULL DEFAULT 'image'"),
        ("users", "birthday", "TEXT NOT NULL DEFAULT ''"),
        ("users", "cover", "TEXT NOT NULL DEFAULT ''"),
        ("users", "bio", "TEXT NOT NULL DEFAULT ''"),
        ("users", "marital_status", "TEXT NOT NULL DEFAULT ''"),
        ("users", "category", "TEXT NOT NULL DEFAULT ''"),
        ("users", "price", "TEXT NOT NULL DEFAULT ''"),
        ("users", "hours", "TEXT NOT NULL DEFAULT ''"),
        ("users", "location", "TEXT NOT NULL DEFAULT ''"),
    ]
    for table, column, definition in migrations:
        try:
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
        except Exception:
            pass
    db.session.commit()


def _seed_default_settings():
    from db.models import Setting
    defaults = {"single_vote_mode": "0"}
    for key, value in defaults.items():
        if not Setting.query.filter_by(key=key).first():
            db.session.add(Setting(key=key, value=value))
    db.session.commit()
