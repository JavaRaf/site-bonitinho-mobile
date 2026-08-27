import re
import os
import uuid
from pathlib import Path
from PIL import Image, ImageOps

from flask import Blueprint, request, jsonify, session
from config import Config
from db import db
from db.models import User, Comment, CommentLike, Upload
from utils.security import login_required

comments_bp = Blueprint("comments", __name__)


@comments_bp.route("/api/comments/<path:image_name>", methods=["GET", "POST"])
def handle_comments(image_name):
    if request.method == "GET":
        rows = (
            db.session.query(
                Comment.id, Comment.text, Comment.created_at, Comment.parent_id,
                Comment.media_name, Comment.media_type,
                Comment.user_id, User.username, User.display_name, User.color, User.avatar,
                db.func.count(CommentLike.id).label("likes"),
            )
            .join(User, Comment.user_id == User.id)
            .outerjoin(CommentLike, CommentLike.comment_id == Comment.id)
            .filter(Comment.image_name == image_name)
            .group_by(Comment.id)
            .order_by(Comment.created_at.asc())
            .all()
        )
        return jsonify([
            {
                "id": r.id, "text": r.text, "created_at": r.created_at,
                "parent_id": r.parent_id, "media_name": r.media_name or "", "media_type": r.media_type or "",
                "username": r.username, "display_name": r.display_name or r.username, "color": r.color,
                "avatar": r.avatar, "user_id": r.user_id, "likes": r.likes,
            }
            for r in rows
        ])

    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    # suporta JSON e multipart
    if request.content_type and "multipart/form-data" in request.content_type:
        text = (request.form.get("text") or "").strip()
        parent_id = request.form.get("parent_id")
        if parent_id:
            try:
                parent_id = int(parent_id)
            except:
                parent_id = None
        media_file = request.files.get("media")
        media_name = ""
        media_type = ""
    else:
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        parent_id = data.get("parent_id")
        media_name = (data.get("media_name") or "").strip()
        media_type = (data.get("media_type") or "").strip()
        media_file = None

    if media_file and media_file.filename:
        ext = Path(media_file.filename).suffix.lower()
        allowed = Config.ALLOWED_EXTENSIONS | Config.VIDEO_EXTENSIONS
        if ext not in allowed:
            return jsonify({"error": "tipo de arquivo não permitido"}), 400
        media_file.seek(0, os.SEEK_END)
        size = media_file.tell()
        media_file.seek(0)
        if size > Config.MAX_IMAGE_BYTES and ext not in Config.VIDEO_EXTENSIONS:
            return jsonify({"error": "arquivo muito grande"}), 400
        # video limite 1min
        is_video = ext in Config.VIDEO_EXTENSIONS
        # gera nome único
        media_name = f"{uuid.uuid4().hex[:8]}_{Path(media_file.filename).stem[:20]}{ext}"
        # sanitiza
        media_name = Path(media_name).name
        dest_dir = Config.COMMENT_MEDIA_DIR
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / media_name
        if is_video:
            # salva temp e checa duração
            tmp = dest
            media_file.save(str(tmp))
            try:
                import subprocess
                result = subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(tmp)],
                    capture_output=True, text=True, timeout=10
                )
                dur = float(result.stdout.strip()) if result.stdout.strip() else 0
                if dur > 60:
                    tmp.unlink(missing_ok=True)
                    return jsonify({"error": "vídeo muito longo (máx 1min)"}), 400
            except Exception:
                pass
            media_type = "video"
            # thumb para video opcional
        else:
            try:
                with Image.open(media_file.stream) as im:
                    im = im.convert("RGB")
                    im = ImageOps.exif_transpose(im)
                    im.thumbnail((1080, 1080))
                    im.save(str(dest), format="JPEG", quality=85)
            except Exception:
                media_file.save(str(dest))
            media_type = "image"
            # gera thumb
            try:
                thumb_dir = Config.THUMB_DIR
                thumb_dir.mkdir(parents=True, exist_ok=True)
                with Image.open(dest) as im:
                    im.thumbnail((480, 480))
                    im.save(str(thumb_dir / (media_name + ".webp")), format="WEBP", quality=80)
            except Exception:
                pass
            if ext == ".gif":
                media_type = "image"

    if not text and not media_name:
        return jsonify({"error": "text or media required"}), 400
    if parent_id:
        parent = Comment.query.filter(
            Comment.id == parent_id, Comment.image_name == image_name
        ).first()
        if not parent:
            return jsonify({"error": "parent comment not found"}), 404
        if parent.parent_id:
            parent_id = parent.parent_id

    comment = Comment(
        user_id=session["user_id"],
        image_name=image_name,
        text=text,
        parent_id=parent_id if parent_id else None,
        media_name=media_name,
        media_type=media_type,
    )
    db.session.add(comment)
    db.session.commit()

    commenter = User.query.get(session["user_id"])
    commenter_name = commenter.username if commenter else "Alguém"

    owner_upload = (
        db.session.query(Upload, User)
        .join(User, Upload.user_id == User.id)
        .filter(Upload.image_name == image_name)
        .first()
    )

    if owner_upload and owner_upload[1].id != session["user_id"]:
        owner_user = owner_upload[1]
        try:
            from routes.push import send_push
            send_push(
                f"Novo comentario de @{commenter_name}",
                text[:100],
                owner_user.id,
                image_name=image_name,
            )
        except Exception:
            pass

    mentioned_usernames = set(re.findall(r"@(\w+)", text))
    mentioned_usernames.discard(commenter_name)
    if mentioned_usernames:
        session_user_id = session["user_id"]
        try:
            from routes.push import send_push
            for uname in mentioned_usernames:
                user = User.query.filter(db.func.lower(User.username) == uname.lower()).first()
                if user and user.id != session_user_id:
                    send_push(
                        f"@{commenter_name} mencionou voce",
                        text[:100],
                        user.id,
                        image_name=image_name,
                    )
        except Exception:
            pass

    return jsonify({
        "id": comment.id, "text": comment.text, "created_at": comment.created_at,
        "parent_id": comment.parent_id, "media_name": comment.media_name or "", "media_type": comment.media_type or "",
        "username": commenter.username if commenter else "",
        "display_name": commenter.display_name if commenter and commenter.display_name else (commenter.username if commenter else ""),
        "color": commenter.color if commenter else "",
    }), 201


@comments_bp.route("/api/comments/id/<int:comment_id>", methods=["PUT"])
@login_required
def edit_comment(comment_id):
    comment = Comment.query.get(comment_id)
    if not comment:
        return jsonify({"error": "not found"}), 404

    if comment.user_id != session["user_id"]:
        return jsonify({"error": "forbidden"}), 403

    data = request.get_json() or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400

    comment.text = text
    db.session.commit()
    return jsonify({
        "id": comment.id,
        "text": comment.text,
        "created_at": comment.created_at,
        "parent_id": comment.parent_id
    })


@comments_bp.route("/api/comments/id/<int:comment_id>", methods=["DELETE"])
@login_required
def delete_comment(comment_id):
    comment = Comment.query.get(comment_id)
    if not comment:
        return jsonify({"error": "not found"}), 404

    user = User.query.get(session["user_id"])
    is_owner = comment.user_id == session["user_id"]

    if not user.is_admin and not is_owner:
        return jsonify({"error": "forbidden"}), 403

    Comment.query.filter(
        (Comment.id == comment_id) | (Comment.parent_id == comment_id)
    ).delete(synchronize_session=False)
    db.session.commit()
    return jsonify({"ok": True})


@comments_bp.route("/api/comment-likes/<int:comment_id>", methods=["POST", "DELETE"])
@login_required
def toggle_comment_like(comment_id):
    if request.method == "DELETE":
        existing = CommentLike.query.filter_by(
            user_id=session["user_id"], comment_id=comment_id
        ).first()
        if existing:
            db.session.delete(existing)
            db.session.commit()
        return jsonify({"liked": False})

    existing = CommentLike.query.filter_by(
        user_id=session["user_id"], comment_id=comment_id
    ).first()

    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"liked": False})
    else:
        db.session.add(CommentLike(
            user_id=session["user_id"], comment_id=comment_id
        ))
        db.session.commit()
        return jsonify({"liked": True})


@comments_bp.route("/api/comment-likers/<int:comment_id>", methods=["GET"])
def get_comment_likers(comment_id):
    rows = (
        db.session.query(User.username, User.display_name, User.avatar)
        .join(CommentLike, CommentLike.user_id == User.id)
        .filter(CommentLike.comment_id == comment_id)
        .all()
    )
    return jsonify([{"username": r.username, "display_name": r.display_name or r.username, "avatar": r.avatar} for r in rows])


@comments_bp.route("/api/comment-likes", methods=["GET"])
@login_required
def get_my_comment_likes():
    rows = CommentLike.query.filter_by(user_id=session["user_id"]).all()
    return jsonify({"likes": [r.comment_id for r in rows]})
