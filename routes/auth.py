import hmac
import hashlib
import os
import secrets

from flask import Blueprint, request, jsonify, session
from db import db
from db.models import User
from utils.security import login_required

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


@auth_bp.route("/api/auth/check-username", methods=["GET"])
def check_username():
    username = (request.args.get("username") or "").strip()
    if not username or len(username) < 3:
        return jsonify({"available": False, "reason": "username muito curto"})
    exists = User.query.filter(db.func.lower(User.username) == username.lower()).first()
    if exists:
        return jsonify({"available": False, "reason": "nome de usuário já em uso"})
    return jsonify({"available": True})


@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    display_name = (data.get("display_name") or "").strip()[:30]
    email = (data.get("email") or "").strip().lower()[:120]

    if not username or not password:
        return jsonify({"error": "usuário e senha são obrigatórios"}), 400
    if len(username) < 3 or len(password) < 4:
        return jsonify({"error": "usuário mínimo 3 caracteres, senha mínimo 4"}), 400
    if email and "@" not in email:
        return jsonify({"error": "email inválido"}), 400
    if email and User.query.filter_by(email=email).first():
        return jsonify({"error": "email já cadastrado"}), 409

    if User.query.filter(db.func.lower(User.username) == username.lower()).first():
        return jsonify({"error": "nome de usuário já em uso"}), 409

    admin_count = User.query.filter_by(is_admin=1).count()
    is_admin = 1 if admin_count == 0 else 0

    user = User(username=username, display_name=display_name or username, email=email, password=hash_password(password), is_admin=is_admin)
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
        "id": user.id, "username": user.username, "display_name": user.display_name or user.username, "email": user.email or "", "is_admin": bool(user.is_admin),
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
        "id": user.id, "username": user.username, "display_name": user.display_name or user.username, "email": user.email or "", "is_admin": bool(user.is_admin),
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
        "id": user.id, "username": user.username, "display_name": user.display_name or user.username, "email": user.email or "", "is_admin": bool(user.is_admin),
        "avatar": user.avatar, "color": user.color or "",
    }})


@auth_bp.route("/api/auth/recovery/generate", methods=["POST"])
def generate_recovery_codes():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401
    from db.models import RecoveryCode
    user_id = session["user_id"]
    # invalida antigos
    RecoveryCode.query.filter_by(user_id=user_id, used=0).delete()
    codes = []
    hashes = []
    for _ in range(8):
        code = secrets.token_urlsafe(6)[:8].upper().replace("-", "").replace("_", "")
        # garante 8 chars alfanum
        if len(code) < 8:
            code = (code + secrets.token_hex(4).upper())[:8]
        codes.append(code)
        h = hashlib.sha256(code.encode()).hexdigest()
        hashes.append(RecoveryCode(user_id=user_id, code_hash=h))
    db.session.add_all(hashes)
    db.session.commit()
    return jsonify({"codes": codes})


@auth_bp.route("/api/auth/recovery/reset", methods=["POST"])
def recovery_reset():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    code = (data.get("code") or "").strip().upper()
    new_password = (data.get("password") or "").strip()
    if not username or not code or not new_password:
        return jsonify({"error": "username, code and password required"}), 400
    if len(new_password) < 4:
        return jsonify({"error": "password min 4 chars"}), 400
    user = User.query.filter(db.func.lower(User.username) == username.lower()).first()
    if not user:
        return jsonify({"error": "usuário não encontrado"}), 404
    from db.models import RecoveryCode
    h = hashlib.sha256(code.encode()).hexdigest()
    rc = RecoveryCode.query.filter_by(user_id=user.id, code_hash=h, used=0).first()
    if not rc:
        return jsonify({"error": "código inválido ou já usado"}), 400
    rc.used = 1
    user.password = hash_password(new_password)
    db.session.commit()
    return jsonify({"ok": True})


@auth_bp.route("/api/auth/change-password", methods=["POST"])
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    cur = (data.get("current_password") or "").strip()
    new = (data.get("new_password") or "").strip()
    if not cur or not new:
        return jsonify({"error": "senhas são obrigatórias"}), 400
    if len(new) < 4:
        return jsonify({"error": "nova senha mínimo 4 caracteres"}), 400
    user = User.query.get(session["user_id"])
    if not user or not verify_password(cur, user.password):
        return jsonify({"error": "senha atual incorreta"}), 400
    user.password = hash_password(new)
    db.session.commit()
    return jsonify({"ok": True})
