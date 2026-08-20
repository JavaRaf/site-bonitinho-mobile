import hmac
import hashlib
import os
from functools import wraps
from pathlib import Path

from flask import session, jsonify, current_app
from db.models import User


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
