import re
from flask import Blueprint, request, jsonify, session
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
                Comment.user_id, User.username, User.color, User.avatar,
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
                "parent_id": r.parent_id, "username": r.username, "color": r.color,
                "avatar": r.avatar, "user_id": r.user_id, "likes": r.likes,
            }
            for r in rows
        ])

    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    data = request.get_json()
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400

    parent_id = data.get("parent_id")
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
        parent_id=parent_id,
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
                user = User.query.filter_by(username=uname).first()
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
        "parent_id": comment.parent_id, "username": commenter.username if commenter else "",
        "color": commenter.color if commenter else "",
    }), 201


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
        db.session.query(User.username, User.avatar)
        .join(CommentLike, CommentLike.user_id == User.id)
        .filter(CommentLike.comment_id == comment_id)
        .all()
    )
    return jsonify([{"username": r.username, "avatar": r.avatar} for r in rows])


@comments_bp.route("/api/comment-likes", methods=["GET"])
@login_required
def get_my_comment_likes():
    rows = CommentLike.query.filter_by(user_id=session["user_id"]).all()
    return jsonify({"likes": [r.comment_id for r in rows]})
