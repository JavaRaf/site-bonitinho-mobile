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
        ("uploads", "eleicao", "INTEGER NOT NULL DEFAULT 0"),
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
        ("users", "display_name", "TEXT NOT NULL DEFAULT ''"),
        ("users", "email", "TEXT NOT NULL DEFAULT ''"),
        ("users", "social_links", "TEXT NOT NULL DEFAULT '[]'"),
        ("users", "education", "TEXT NOT NULL DEFAULT ''"),
        ("users", "hobbies", "TEXT NOT NULL DEFAULT '[]'"),
        ("users", "pinned_details", "TEXT NOT NULL DEFAULT '[]'"),
        ("comments", "media_name", "TEXT NOT NULL DEFAULT ''"),
        ("comments", "media_type", "TEXT NOT NULL DEFAULT ''"),
    ]
    for table, column, definition in migrations:
        try:
            db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
        except Exception:
            pass
    db.session.commit()
    # Índices para acelerar feed e likes
    for stmt in [
        "CREATE INDEX IF NOT EXISTS idx_uploads_active_created ON uploads(active, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_uploads_user_active ON uploads(user_id, active)",
        "CREATE INDEX IF NOT EXISTS idx_likes_image ON likes(image_name)",
        "CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_comments_image ON comments(image_name)",
        "CREATE INDEX IF NOT EXISTS idx_uploads_post_id ON uploads(post_id)",
    ]:
        try:
            db.session.execute(text(stmt))
        except Exception:
            pass
    db.session.commit()
    # WAL para concorrência
    try:
        db.session.execute(text("PRAGMA journal_mode=WAL"))
        db.session.execute(text("PRAGMA synchronous=NORMAL"))
    except Exception:
        pass
    # Backfill display_name = username where empty
    try:
        db.session.execute(text("UPDATE users SET display_name = username WHERE display_name IS NULL OR display_name = ''"))
        db.session.commit()
    except Exception:
        pass
    # Normaliza usernames para minúsculas e converte espaços/símbolos/acentos
    # para "_" (ex.: "Ana Torres" e "João@2020!" -> "ana_torres" e "joao_2020_"),
    # preservando o display_name (nome bonito). Mesma regra de caracteres do
    # cadastro (a-z0-9_.). Idempotente. Em colisão (dois usuários caindo no MESMO
    # alvo — case, espaço/símbolo, acento etc.) NÃO mexe: mantém ambos intactos
    # para não perder nenhum usuário; admin pode renomear depois.
    try:
        from collections import Counter
        import re
        import unicodedata

        def _slugify(username):
            t = unicodedata.normalize("NFKD", username)
            t = "".join(c for c in t if not unicodedata.combining(c))
            return re.sub(r"[^a-z0-9_.]+", "_", t.strip().lower())

        rows = db.session.execute(text("SELECT id, username, display_name FROM users ORDER BY id")).fetchall()
        targets = {}
        for u in rows:
            if not isinstance(u.username, str) or not u.username.strip():
                continue
            targets[u.id] = _slugify(u.username)
        counts = Counter(targets.values())
        for uid, uname, dname in rows:
            if not isinstance(uname, str) or not uname.strip():
                continue
            target = targets.get(uid, "")
            if not target or target == uname or counts.get(target, 0) != 1:
                continue
            pretty = (dname or "").strip() or uname.strip()
            db.session.execute(
                text("UPDATE users SET display_name = :d, username = :u WHERE id = :i"),
                {"d": pretty, "u": target, "i": uid},
            )
        db.session.commit()
    except Exception:
        db.session.rollback()


def _seed_default_settings():
    from db.models import Setting
    defaults = {"single_vote_mode": "0"}
    for key, value in defaults.items():
        if not Setting.query.filter_by(key=key).first():
            db.session.add(Setting(key=key, value=value))
    db.session.commit()
