from threading import Thread

from flask import Blueprint, request, jsonify, session
from db import db
from db.models import User, Upload, Like, Setting
from utils.security import login_required, get_setting
from config import Config

likes_bp = Blueprint("likes", __name__)


@likes_bp.route("/api/singlevote", methods=["GET"])
def single_vote_status():
    return jsonify({"enabled": get_setting("single_vote_mode") == "1"})


@likes_bp.route("/api/likes", methods=["GET"])
@login_required
def get_likes():
    rows = Like.query.filter_by(user_id=session["user_id"]).all()
    return jsonify({"likes": [r.image_name for r in rows]})


@likes_bp.route("/api/likers/<path:image_name>", methods=["GET"])
def get_likers(image_name):
    rows = (
        db.session.query(User.username, User.id.label("user_id"))
        .join(Like, Like.user_id == User.id)
        .filter(Like.image_name == image_name)
        .order_by(Like.created_at.asc())
        .all()
    )
    return jsonify([{"username": r.username, "id": r.user_id} for r in rows])


@likes_bp.route("/api/likes/<path:image_name>", methods=["POST"])
@login_required
def toggle_like(image_name):
    existing = Like.query.filter_by(
        user_id=session["user_id"], image_name=image_name
    ).first()

    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"liked": False})

    if get_setting("single_vote_mode") == "1":
        other = Like.query.filter(
            Like.user_id == session["user_id"], Like.image_name != image_name
        ).first()
        if other:
            db.session.delete(other)

    liker = User.query.get(session["user_id"])
    owner = Upload.query.filter_by(image_name=image_name).first()

    db.session.add(Like(
        user_id=session["user_id"], image_name=image_name
    ))
    db.session.commit()

    if owner and owner.user_id != session["user_id"] and liker:
        liker_name = liker.username
        owner_id = owner.user_id

        def _notify_like():
            try:
                from routes.push import send_push
                send_push(
                    f"@{liker_name} curtiu sua imagem",
                    f"@{liker_name} curtiu {image_name}",
                    owner_id,
                    image_name=image_name,
                )
            except Exception:
                pass

        Thread(target=_notify_like, daemon=True).start()

    return jsonify({"liked": True})


@likes_bp.route("/api/votos", methods=["GET"])
def ranking_api():
    rows = (
        db.session.query(
            Upload.image_name,
            Upload.post_id,
            Upload.post_type,
            Upload.caption,
            Upload.nsfw,
            Upload.media_type,
            User.username.label("owner"),
            db.func.count(Like.id).label("likes"),
        )
        .outerjoin(User, Upload.user_id == User.id)
        .outerjoin(Like, Like.image_name == Upload.image_name)
        .filter(Upload.active == 1)
        .group_by(Upload.id)
        .order_by(db.desc("likes"), db.desc(Upload.created_at))
        .all()
    )

    post_map = {}
    for r in rows:
        pid = r.post_id or r.image_name
        media = {"name": r.image_name, "media_type": r.media_type}
        if pid not in post_map:
            post_map[pid] = {
                "post_id": pid,
                "name": r.image_name,
                "owner": r.owner,
                "likes": r.likes,
                "post_type": r.post_type,
                "caption": r.caption or "",
                "nsfw": bool(r.nsfw),
                "media": [media],
            }
        else:
            post_map[pid]["media"].append(media)

    result = list(post_map.values())

    for p in result:
        likers = (
            db.session.query(User.username, Like.user_id)
            .join(User, Like.user_id == User.id)
            .filter(Like.image_name.in_([m["name"] for m in p["media"]]))
            .all()
        )
        p["likers"] = [{"username": lr.username, "id": lr.user_id} for lr in likers]

    img_dir = Config.BASE_DIR / "images"
    result = [x for x in result if any((img_dir / m["name"]).exists() for m in x["media"])]
    return jsonify(result)
