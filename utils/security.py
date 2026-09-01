import hmac
import hashlib
import os
import time
import threading
from collections import defaultdict, deque
from functools import wraps
from pathlib import Path

from flask import session, jsonify, current_app, request
from db.models import User


# === Rate limiting (em memória) ===
_rate_buckets = defaultdict(lambda: deque())
_rate_lock = threading.Lock()
RATE_MAX = int(os.getenv("RATE_MAX", "30"))
RATE_WINDOW = int(os.getenv("RATE_WINDOW", "60"))


def get_client_ip():
    # respeita proxies confiáveis (X-Forwarded-For) com fallback seguro
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.remote_addr or "unknown"


def is_rate_limited(key, max_requests=RATE_MAX, window=RATE_WINDOW):
    """Retorna True se o rate limit foi excedido."""
    now = time.monotonic()
    with _rate_lock:
        timestamps = _rate_buckets[key]
        # remove entradas antigas fora da janela
        while timestamps and timestamps[0] < now - window:
            timestamps.popleft()
        if len(timestamps) >= max_requests:
            return True
        timestamps.append(now)
    return False


def rate_limit(max_requests=RATE_MAX, window=RATE_WINDOW):
    """Decorator que limita requisições por IP."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            key = f"{f.__name__}:{get_client_ip()}"
            if is_rate_limited(key, max_requests, window):
                return jsonify({"error": "Muitas requisições. Tente novamente em instantes."}), 429
            return f(*args, **kwargs)
        return decorated
    return decorator


def get_setting(key, default=None):
    from db.models import Setting
    setting = Setting.query.get(key)
    return setting.value if setting else default


def set_setting(key, value):
    from db.models import Setting
    setting = Setting.query.get(key)
    if setting:
        setting.value = value
    else:
        from db import db
        db.session.add(Setting(key=key, value=value))
    from db import db
    db.session.commit()


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "login required"}), 401
        user = User.query.get(session["user_id"])
        if not user:
            session.clear()
            return jsonify({"error": "session expired"}), 401
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "login required"}), 401
        user = User.query.get(session["user_id"])
        if not user:
            session.clear()
            return jsonify({"error": "session expired"}), 401
        if not user.is_admin:
            return jsonify({"error": "admin only"}), 403
        return f(*args, **kwargs)
    return decorated


def safe_path(base_dir, filename):
    name = Path(filename).name
    if not name or name.startswith("."):
        return None
    target = (base_dir / name).resolve()
    if not str(target).startswith(str(base_dir.resolve())):
        return None
    return target
