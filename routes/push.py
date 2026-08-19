import json
import time
import jwt
import requests
from flask import Blueprint, request, jsonify, session
from pathlib import Path

from db.schema import get_db

push_bp = Blueprint("push", __name__)

SERVICE_ACCOUNT_PATH = Path(__file__).resolve().parent.parent / "firebase-service-account.json"
FCM_API_URL = "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"

_sa_cache = {}


def _load_service_account():
    if _sa_cache:
        return _sa_cache
    with open(SERVICE_ACCOUNT_PATH) as f:
        data = json.load(f)
    _sa_cache.update(data)
    return _sa_cache


def _get_access_token():
    sa = _load_service_account()
    now = time.time()
    if "access_token" in _sa_cache and _sa_cache.get("token_expires", 0) > now + 60:
        return _sa_cache["access_token"]

    payload = {
        "iss": sa["client_email"],
        "scope": "https://www.googleapis.com/auth/firebase.messaging",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": int(now),
        "exp": int(now) + 3600,
    }
    signed_jwt = jwt.encode(payload, sa["private_key"], algorithm="RS256")

    resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": signed_jwt,
        },
        timeout=10,
    )
    resp.raise_for_status()
    token_data = resp.json()
    _sa_cache["access_token"] = token_data["access_token"]
    _sa_cache["token_expires"] = now + token_data.get("expires_in", 3600)
    return _sa_cache["access_token"]


def send_push(title, body, user_id, image_name=""):
    db = get_db()

    db.execute(
        "INSERT INTO push_notifications (user_id, title, body, image_name) VALUES (?, ?, ?, ?)",
        (user_id, title, body, image_name),
    )
    db.commit()

    rows = db.execute(
        "SELECT token FROM push_tokens WHERE user_id = ?", (user_id,)
    ).fetchall()
    db.close()

    if not rows:
        return

    sa = _load_service_account()
    access_token = _get_access_token()
    url = FCM_API_URL.format(project_id=sa["project_id"])
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    invalid_tokens = []
    for row in rows:
        token = row["token"]
        payload = {
            "message": {
                "token": token,
                "data": {
                    "title": title,
                    "body": body,
                },
            }
        }
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=10)
            if resp.status_code == 404 or (
                resp.status_code == 200
                and resp.json().get("results", [{}])[0].get("error")
                in ("INVALID_ARGUMENT", "UNREGISTERED")
            ):
                invalid_tokens.append(token)
        except requests.RequestException:
            pass

    if invalid_tokens:
        db = get_db()
        placeholders = ",".join("?" for _ in invalid_tokens)
        db.execute(f"DELETE FROM push_tokens WHERE token IN ({placeholders})", invalid_tokens)
        db.commit()
        db.close()


@push_bp.route("/api/push/subscribe", methods=["POST"])
def subscribe():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    data = request.get_json()
    token = (data.get("token") or "").strip()
    if not token:
        return jsonify({"error": "token required"}), 400

    db = get_db()
    try:
        db.execute(
            "INSERT OR IGNORE INTO push_tokens (user_id, token) VALUES (?, ?)",
            (session["user_id"], token),
        )
        db.commit()
    finally:
        db.close()
    return jsonify({"ok": True})


@push_bp.route("/api/push/unsubscribe", methods=["POST"])
def unsubscribe():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    data = request.get_json()
    token = (data.get("token") or "").strip()
    if not token:
        return jsonify({"error": "token required"}), 400

    db = get_db()
    db.execute(
        "DELETE FROM push_tokens WHERE user_id = ? AND token = ?",
        (session["user_id"], token),
    )
    db.commit()
    db.close()
    return jsonify({"ok": True})


@push_bp.route("/api/push/status", methods=["GET"])
def push_status():
    if "user_id" not in session:
        return jsonify({"enabled": False})
    db = get_db()
    row = db.execute(
        "SELECT COUNT(*) AS cnt FROM push_tokens WHERE user_id = ?",
        (session["user_id"],),
    ).fetchone()
    db.close()
    return jsonify({"enabled": row["cnt"] > 0})


@push_bp.route("/api/push/notifications", methods=["GET"])
def get_notifications():
    if "user_id" not in session:
        return jsonify({"notifications": [], "unread": 0})
    db = get_db()
    rows = db.execute(
        "SELECT id, title, body, image_name, read, created_at FROM push_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
        (session["user_id"],),
    ).fetchall()
    unread = db.execute(
        "SELECT COUNT(*) AS cnt FROM push_notifications WHERE user_id = ? AND read = 0",
        (session["user_id"],),
    ).fetchone()["cnt"]
    db.close()
    return jsonify({"notifications": [dict(r) for r in rows], "unread": unread})


@push_bp.route("/api/push/read", methods=["POST"])
def mark_read():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401
    db = get_db()
    db.execute(
        "UPDATE push_notifications SET read = 1 WHERE user_id = ? AND read = 0",
        (session["user_id"],),
    )
    db.commit()
    db.close()
    return jsonify({"ok": True})


@push_bp.route("/api/push/clear", methods=["DELETE"])
def clear_notifications():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401
    db = get_db()
    db.execute(
        "DELETE FROM push_notifications WHERE user_id = ?",
        (session["user_id"],),
    )
    db.commit()
    db.close()
    return jsonify({"ok": True})
