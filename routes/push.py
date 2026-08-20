import json
import time
import jwt
import requests
from pathlib import Path
from flask import Blueprint, request, jsonify, session
from db import db
from db.models import PushToken, PushNotification, User
from utils.security import login_required

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
    notif = PushNotification(
        user_id=user_id, title=title, body=body, image_name=image_name
    )
    db.session.add(notif)
    db.session.commit()

    try:
        tokens = PushToken.query.filter_by(user_id=user_id).all()
        if not tokens:
            return

        sa = _load_service_account()
        access_token = _get_access_token()
        url = FCM_API_URL.format(project_id=sa["project_id"])
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        invalid_tokens = []
        for pt in tokens:
            payload = {
                "message": {
                    "token": pt.token,
                    "data": {"title": title, "body": body},
                }
            }
            try:
                resp = requests.post(url, headers=headers, json=payload, timeout=10)
                if resp.status_code == 404 or (
                    resp.status_code == 200
                    and resp.json().get("results", [{}])[0].get("error")
                    in ("INVALID_ARGUMENT", "UNREGISTERED")
                ):
                    invalid_tokens.append(pt.token)
            except requests.RequestException:
                pass

        if invalid_tokens:
            PushToken.query.filter(PushToken.token.in_(invalid_tokens)).delete(
                synchronize_session=False
            )
            db.session.commit()
    except Exception:
        pass


@push_bp.route("/api/push/subscribe", methods=["POST"])
@login_required
def subscribe():
    data = request.get_json()
    token = (data.get("token") or "").strip()
    if not token:
        return jsonify({"error": "token required"}), 400

    existing = PushToken.query.filter_by(token=token).first()
    if not existing:
        db.session.add(PushToken(user_id=session["user_id"], token=token))
        db.session.commit()
    return jsonify({"ok": True})


@push_bp.route("/api/push/unsubscribe", methods=["POST"])
@login_required
def unsubscribe():
    data = request.get_json()
    token = (data.get("token") or "").strip()
    if not token:
        return jsonify({"error": "token required"}), 400

    PushToken.query.filter_by(user_id=session["user_id"], token=token).delete()
    db.session.commit()
    return jsonify({"ok": True})


@push_bp.route("/api/push/status", methods=["GET"])
@login_required
def push_status():
    count = PushToken.query.filter_by(user_id=session["user_id"]).count()
    return jsonify({"enabled": count > 0})


@push_bp.route("/api/push/notifications", methods=["GET"])
@login_required
def get_notifications():
    rows = (
        PushNotification.query
        .filter_by(user_id=session["user_id"])
        .order_by(PushNotification.created_at.desc())
        .limit(50)
        .all()
    )
    unread = PushNotification.query.filter_by(
        user_id=session["user_id"], read=0
    ).count()
    return jsonify({
        "notifications": [
            {"id": r.id, "title": r.title, "body": r.body,
             "image_name": r.image_name, "read": r.read, "created_at": r.created_at}
            for r in rows
        ],
        "unread": unread,
    })


@push_bp.route("/api/push/read", methods=["POST"])
@login_required
def mark_read():
    PushNotification.query.filter_by(
        user_id=session["user_id"], read=0
    ).update({"read": 1})
    db.session.commit()
    return jsonify({"ok": True})


@push_bp.route("/api/push/clear", methods=["DELETE"])
@login_required
def clear_notifications():
    PushNotification.query.filter_by(user_id=session["user_id"]).delete()
    db.session.commit()
    return jsonify({"ok": True})
