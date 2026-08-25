import re
from pathlib import Path

from flask import Blueprint, request, jsonify, session
from db import db
from db.models import User, Upload, Like, Round, Setting
from utils.security import admin_required, get_setting, set_setting
from config import Config

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/api/admin/images", methods=["DELETE"])
@admin_required
def admin_delete_images():
    data = request.get_json()
    names = data.get("images", [])
    if not names:
        return jsonify({"error": "no images"}), 400

    img_dir = Config.BASE_DIR / "images"
    thumb_dir = Config.THUMB_DIR

    for name in names:
        safe_name = Path(name).name
        if not safe_name or safe_name.startswith("."):
            continue

        filepath = img_dir / safe_name
        if filepath.exists():
            filepath.unlink()
        thumb_path = thumb_dir / (safe_name + ".webp")
        if thumb_path.exists():
            thumb_path.unlink()
        legacy_thumb = thumb_dir / (safe_name + ".jpg")
        if legacy_thumb.exists():
            legacy_thumb.unlink()

        Like.query.filter_by(image_name=safe_name).delete()
        from db.models import Comment, PushNotification
        Comment.query.filter_by(image_name=safe_name).delete()
        Upload.query.filter_by(image_name=safe_name).delete()
        PushNotification.query.filter_by(image_name=safe_name).delete()

    db.session.commit()
    return jsonify({"ok": True, "deleted": len(names)})


@admin_bp.route("/api/admin/likes", methods=["DELETE"])
@admin_required
def admin_remove_likes():
    data = request.get_json()
    names = data.get("images", [])
    if not names:
        return jsonify({"error": "no images"}), 400

    for name in names:
        Like.query.filter_by(image_name=name).delete()
    db.session.commit()
    return jsonify({"ok": True})


@admin_bp.route("/api/admin/likes/<path:image_name>/<int:user_id>", methods=["DELETE"])
@admin_required
def admin_remove_single_like(image_name, user_id):
    Like.query.filter_by(image_name=image_name, user_id=user_id).delete()
    db.session.commit()
    return jsonify({"ok": True})


@admin_bp.route("/api/admin/nsfw", methods=["POST"])
@admin_required
def admin_toggle_nsfw():
    data = request.get_json()
    name = data.get("name")
    nsfw = data.get("nsfw", False)
    if not name:
        return jsonify({"error": "name required"}), 400

    upload = Upload.query.filter_by(image_name=name).first()
    if upload:
        upload.nsfw = 1 if nsfw else 0
        db.session.commit()
    return jsonify({"ok": True, "nsfw": bool(nsfw)})


@admin_bp.route("/api/admin/eleicao", methods=["POST"])
@admin_required
def admin_toggle_eleicao():
    data = request.get_json()
    name = data.get("name")
    eleicao = data.get("eleicao", False)
    if not name:
        return jsonify({"error": "name required"}), 400

    upload = Upload.query.filter_by(image_name=name).first()
    if upload:
        upload.eleicao = 1 if eleicao else 0
        db.session.commit()
    return jsonify({"ok": True, "eleicao": bool(eleicao)})


@admin_bp.route("/api/admin/users", methods=["GET"])
@admin_required
def admin_list_users():
    users = User.query.order_by(User.id).all()
    return jsonify([
        {"id": u.id, "username": u.username, "display_name": u.display_name or u.username, "is_admin": bool(u.is_admin),
         "avatar": u.avatar, "color": u.color, "created_at": u.created_at}
        for u in users
    ])


@admin_bp.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
@admin_required
def admin_delete_user(user_id):
    target = User.query.get(user_id)
    if not target:
        return jsonify({"error": "not found"}), 404

    if target.is_admin:
        other_admins = User.query.filter(User.is_admin == 1, User.id != user_id).count()
        if other_admins == 0:
            return jsonify({"error": "cannot delete the only admin"}), 403

    db.session.delete(target)
    db.session.commit()
    return jsonify({"ok": True})


@admin_bp.route("/api/admin/users/<int:user_id>/promote", methods=["PUT"])
@admin_required
def admin_promote_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "not found"}), 404
    user.is_admin = 1
    db.session.commit()
    return jsonify({"ok": True})


@admin_bp.route("/api/admin/users/<int:user_id>/rename", methods=["PUT"])
@admin_required
def admin_rename_user(user_id):
    data = request.get_json()
    username = (data.get("username") or "").strip()
    if len(username) < 3:
        return jsonify({"error": "username min 3 chars"}), 400

    existing = User.query.filter(User.username == username, User.id != user_id).first()
    if existing:
        return jsonify({"error": "username already taken"}), 409

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "not found"}), 404
    user.username = username
    db.session.commit()
    return jsonify({"ok": True})


@admin_bp.route("/api/admin/users/<int:user_id>/reset-password", methods=["PUT"])
@admin_required
def admin_reset_password(user_id):
    data = request.get_json(silent=True) or {}
    new_password = (data.get("password") or "").strip()
    if len(new_password) < 4:
        return jsonify({"error": "password min 4 chars"}), 400
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "not found"}), 404
    from routes.auth import hash_password
    user.password = hash_password(new_password)
    # invalida códigos de recuperação antigos
    try:
        from db.models import RecoveryCode
        RecoveryCode.query.filter_by(user_id=user.id).delete()
    except Exception:
        pass
    db.session.commit()
    return jsonify({"ok": True})


@admin_bp.route("/api/admin/collage", methods=["POST"])
@admin_required
def admin_export_collage():
    from io import BytesIO
    from PIL import Image, ImageOps
    from flask import send_file

    data = request.get_json(silent=True) or {}
    names = data.get("images", [])
    img_dir = Config.BASE_DIR / "images"

    if not names:
        names = sorted(f.name for f in img_dir.iterdir() if f.suffix.lower() in Config.ALLOWED_EXTENSIONS)

    paths = []
    for n in names:
        safe = Path(n).name
        p = img_dir / safe
        if p.exists():
            paths.append(p)

    if not paths:
        return jsonify({"error": "no images"}), 400

    SIZE = 1600
    n = len(paths)
    cols = int(n ** 0.5) + (1 if int(n ** 0.5) ** 2 < n else 0)
    rows = (n + cols - 1) // cols
    cell_w = SIZE // cols
    cell_h = SIZE // rows

    canvas = Image.new("RGB", (SIZE, SIZE), "white")
    for i, path in enumerate(paths):
        col = i % cols
        row = i // cols
        with Image.open(path) as im:
            im = im.convert("RGBA")
            im = ImageOps.fit(im, (cell_w, cell_h), method=Image.Resampling.LANCZOS)
            canvas.paste(im, (col * cell_w, row * cell_h), im)

    buf = BytesIO()
    canvas.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png", as_attachment=True, download_name="collage.png")


@admin_bp.route("/api/admin/turnos", methods=["GET"])
@admin_required
def admin_turnos():
    current_round = db.session.query(db.func.coalesce(db.func.max(Round.round_number), 0)).scalar()
    rows = (
        db.session.query(
            Upload.image_name,
            User.username.label("owner"),
            db.func.count(Like.id).label("likes"),
        )
        .outerjoin(User, Upload.user_id == User.id)
        .outerjoin(Like, Like.image_name == Upload.image_name)
        .filter(Upload.active == 1, Upload.eleicao == 1)
        .group_by(Upload.id)
        .order_by(db.desc("likes"), db.desc(Upload.created_at))
        .all()
    )
    history = Round.query.order_by(Round.round_number.desc()).all()

    return jsonify({
        "current_round": current_round + 1,
        "active_count": len(rows),
        "images": [{"name": r.image_name, "owner": r.owner, "likes": r.likes} for r in rows],
        "history": [{"round_number": h.round_number, "cutoff": h.cutoff, "finished_at": h.finished_at} for h in history],
    })


@admin_bp.route("/api/admin/turnos/advance", methods=["POST"])
@admin_required
def admin_turnos_advance():
    data = request.get_json(silent=True) or {}
    try:
        cutoff = int(data.get("cutoff", 3))
    except (TypeError, ValueError):
        return jsonify({"error": "cutoff invalido"}), 400
    if cutoff < 1:
        return jsonify({"error": "cutoff deve ser >= 1"}), 400

    rows = (
        db.session.query(Upload.image_name)
        .filter(Upload.active == 1, Upload.eleicao == 1)
        .outerjoin(Like, Like.image_name == Upload.image_name)
        .group_by(Upload.id)
        .order_by(db.desc(db.func.count(Like.id)), db.desc(Upload.created_at))
        .all()
    )
    names = [r.image_name for r in rows]

    if len(names) <= cutoff:
        return jsonify({"error": "Nada a fazer: posts de eleição ativos <= cutoff"}), 400

    survivors = names[:cutoff]
    eliminated = names[cutoff:]

    img_dir = Config.BASE_DIR / "images"
    thumb_dir = Config.THUMB_DIR
    for name in eliminated:
        filepath = img_dir / name
        if filepath.exists():
            filepath.unlink()
        thumb_path = thumb_dir / (name + ".webp")
        if thumb_path.exists():
            thumb_path.unlink()
        legacy_thumb = thumb_dir / (name + ".jpg")
        if legacy_thumb.exists():
            legacy_thumb.unlink()

    Upload.query.filter(Upload.image_name.in_(eliminated)).delete(synchronize_session=False)
    from db.models import Comment, PushNotification
    Comment.query.filter(Comment.image_name.in_(eliminated)).delete(synchronize_session=False)
    PushNotification.query.filter(PushNotification.image_name.in_(eliminated)).delete(synchronize_session=False)

    Like.query.filter(Like.image_name.in_(names)).delete(synchronize_session=False)

    current_round = db.session.query(db.func.coalesce(db.func.max(Round.round_number), 0)).scalar()
    db.session.add(Round(round_number=current_round + 1, cutoff=cutoff))
    db.session.commit()

    return jsonify({"round": current_round + 1, "passed": survivors, "removed": eliminated})


@admin_bp.route("/api/admin/turnos/mode", methods=["GET", "POST"])
@admin_required
def admin_turnos_mode():
    if request.method == "GET":
        return jsonify({"single_vote_mode": get_setting("single_vote_mode") == "1"})

    data = request.get_json(silent=True) or {}
    enabled = bool(data.get("enabled"))
    set_setting("single_vote_mode", "1" if enabled else "0")
    return jsonify({"single_vote_mode": enabled})


@admin_bp.route("/api/admin/turnos/reset", methods=["POST"])
@admin_required
def admin_turnos_reset():
    Round.query.delete()
    db.session.commit()
    return jsonify({"ok": True})
