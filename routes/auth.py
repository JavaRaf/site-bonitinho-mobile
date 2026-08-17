import hashlib
import os
from flask import Blueprint, request, jsonify, session

from db.schema import get_db

auth_bp = Blueprint("auth", __name__)

def hash_password(password: str) -> str:
    salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
    return salt.hex() + ":" + key.hex()

def verify_password(password: str, stored: str) -> bool:
    salt_hex, key_hex = stored.split(":")
    salt = bytes.fromhex(salt_hex)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
    return key.hex() == key_hex


@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"error": "username and password required"}), 400
    if len(username) < 3 or len(password) < 4:
        return jsonify({"error": "username min 3 chars, password min 4"}), 400

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        db.close()
        return jsonify({"error": "username already taken"}), 409

    # first user is admin
    admin_count = db.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1").fetchone()[0]
    is_admin = 1 if admin_count == 0 else 0

    db.execute(
        "INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)",
        (username, hash_password(password), is_admin)
    )
    db.commit()
    user = db.execute("SELECT id, username, is_admin, avatar, color FROM users WHERE username = ?", (username,)).fetchone()
    db.close()

    session.clear()
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session["is_admin"] = bool(user["is_admin"])
    session["avatar"] = user["avatar"]
    session["color"] = user["color"] or ""
    session.permanent = True

    return jsonify({"id": user["id"], "username": user["username"], "is_admin": bool(user["is_admin"]), "avatar": user["avatar"], "color": user["color"] or ""}), 201


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    db = get_db()
    user = db.execute("SELECT id, username, password, is_admin, avatar, color FROM users WHERE username = ?", (username,)).fetchone()
    db.close()

    if not user or not verify_password(password, user["password"]):
        return jsonify({"error": "invalid credentials"}), 401

    session.clear()
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session["is_admin"] = bool(user["is_admin"])
    session["avatar"] = user["avatar"]
    session["color"] = user["color"] or ""
    session.permanent = True

    return jsonify({"id": user["id"], "username": user["username"], "is_admin": bool(user["is_admin"]), "avatar": user["avatar"], "color": user["color"] or ""})


@auth_bp.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@auth_bp.route("/api/auth/me", methods=["GET"])
def me():
    if "user_id" not in session:
        return jsonify({"user": None})
    db = get_db()
    user = db.execute(
        "SELECT id, username, is_admin, avatar, color FROM users WHERE id = ?",
        (session["user_id"],)
    ).fetchone()
    db.close()
    if not user:
        return jsonify({"user": None})
    return jsonify({"user": {
        "id": user["id"],
        "username": user["username"],
        "is_admin": bool(user["is_admin"]),
        "avatar": user["avatar"],
        "color": user["color"] or ""
    }})


@auth_bp.route("/api/auth/profile", methods=["PUT"])
def update_profile():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    data = request.get_json()
    db = get_db()

    if "username" in data:
        username = data["username"].strip()
        if len(username) < 3:
            db.close()
            return jsonify({"error": "username min 3 chars"}), 400
        existing = db.execute(
            "SELECT id FROM users WHERE username = ? AND id != ?",
            (username, session["user_id"])
        ).fetchone()
        if existing:
            db.close()
            return jsonify({"error": "username already taken"}), 409
        db.execute("UPDATE users SET username = ? WHERE id = ?", (username, session["user_id"]))
        session["username"] = username

    if "avatar" in data:
        db.execute("UPDATE users SET avatar = ? WHERE id = ?", (data["avatar"], session["user_id"]))
        session["avatar"] = data["avatar"]

    if "color" in data:
        color = (data["color"] or "").strip()
        db.execute("UPDATE users SET color = ? WHERE id = ?", (color, session["user_id"]))
        session["color"] = color

    db.commit()
    db.close()
    return jsonify({"username": session["username"], "avatar": session.get("avatar", "default-avatar.svg"), "color": session.get("color", "")})
