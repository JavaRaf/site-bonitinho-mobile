import hmac
import hashlib
import os

from flask import Blueprint, request, jsonify, session
from db import db
from db.models import User

auth_bp = Blueprint("auth", __name__)


def hash_password(password: str) -> str:
    salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
    return salt.hex() + ":" + key.hex()


def verify_password(password: str, stored: str) -> bool:
    salt_hex, key_hex = stored.split(":")
    salt = bytes.fromhex(salt_hex)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
    return hmac.compare_digest(key.hex(), key_hex)


@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    display_name = (data.get("display_name") or "").strip()[:30]

    if not username or not password:
        return jsonify({"error": "username and password required"}), 400
    if len(username) < 3 or len(password) < 4:
        return jsonify({"error": "username min 3 chars, password min 4"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "username already taken"}), 409

    admin_count = User.query.filter_by(is_admin=1).count()
    is_admin = 1 if admin_count == 0 else 0

    user = User(username=username, display_name=display_name or username, password=hash_password(password), is_admin=is_admin)
    db.session.add(user)
    db.session.commit()

    session.clear()
    session["user_id"] = user.id
    session["username"] = user.username
    session["display_name"] = user.display_name or user.username
    session["is_admin"] = bool(user.is_admin)
    session["avatar"] = user.avatar
    session["color"] = user.color or ""
    session.permanent = True

    return jsonify({
        "id": user.id, "username": user.username, "display_name": user.display_name or user.username, "is_admin": bool(user.is_admin),
        "avatar": user.avatar, "color": user.color or "",
    }), 201


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    user = User.query.filter_by(username=username).first()
    if not user or not verify_password(password, user.password):
        return jsonify({"error": "invalid credentials"}), 401

    session.clear()
    session["user_id"] = user.id
    session["username"] = user.username
    session["display_name"] = user.display_name or user.username
    session["is_admin"] = bool(user.is_admin)
    session["avatar"] = user.avatar
    session["color"] = user.color or ""
    session.permanent = True

    return jsonify({
        "id": user.id, "username": user.username, "display_name": user.display_name or user.username, "is_admin": bool(user.is_admin),
        "avatar": user.avatar, "color": user.color or "",
    })


@auth_bp.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@auth_bp.route("/api/auth/me", methods=["GET"])
def me():
    if "user_id" not in session:
        return jsonify({"user": None})
    user = User.query.get(session["user_id"])
    if not user:
        return jsonify({"user": None})
    return jsonify({"user": {
        "id": user.id, "username": user.username, "display_name": user.display_name or user.username, "is_admin": bool(user.is_admin),
        "avatar": user.avatar, "color": user.color or "",
    }})
