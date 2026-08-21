import os
import uuid
import zipfile
from io import BytesIO
from pathlib import Path

from flask import Blueprint, request, jsonify, session, send_from_directory, send_file
from PIL import Image, ImageOps
from db import db
from db.models import User, Upload, Like, Comment, Block
from utils.security import login_required, safe_path
from config import Config

images_bp = Blueprint("images", __name__)

VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
MAX_VIDEO_BYTES = 10 * 1024 * 1024


def _get_video_duration_seconds(filepath):
    try:
        import subprocess
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(filepath)],
            capture_output=True, text=True, timeout=10,
        )
        return float(result.stdout.strip())
    except Exception:
        return 0


def _blocked_ids():
    viewer_id = session.get("user_id")
    if not viewer_id:
        return set()
    rows = db.session.query(Block.user_id, Block.blocked_id).filter(
        (Block.user_id == viewer_id) | (Block.blocked_id == viewer_id)
    ).all()
    return {r.blocked_id if r.user_id == viewer_id else r.user_id for r in rows}


@images_bp.route("/api/images", methods=["GET"])
def list_images():
    img_dir = Config.BASE_DIR / "images"

    like_count = (
        db.session.query(db.func.count(Like.id))
        .filter(Like.image_name == Upload.image_name)
        .correlate(Upload)
        .scalar_subquery()
    )
    comment_count = (
        db.session.query(db.func.count(Comment.id))
        .filter(Comment.image_name == Upload.image_name)
        .correlate(Upload)
        .scalar_subquery()
    )

    uploads = (
        db.session.query(
            Upload,
            User.username,
            User.avatar.label("owner_avatar"),
            like_count.label("likes"),
            comment_count.label("comments"),
        )
        .outerjoin(User, Upload.user_id == User.id)
        .filter(Upload.active == 1)
        .order_by(db.desc(like_count), db.desc(Upload.created_at))
        .all()
    )

    disk_files = {
        f.name for f in img_dir.iterdir()
        if f.suffix.lower() in Config.ALL_MEDIA_EXTENSIONS
    }

    blocked = _blocked_ids()
    result = []
    post_index = {}
    for upload, username, owner_avatar, likes, comments in uploads:
        if upload.user_id and upload.user_id in blocked:
            continue
        if upload.post_type == "text" or upload.image_name in disk_files:
            pid = upload.post_id or upload.image_name
            media = {
                "name": upload.image_name,
                "media_type": upload.media_type,
            }
            entry = {
                "post_id": pid,
                "name": upload.image_name,
                "owner": username,
                "owner_id": upload.user_id,
                "likes": likes,
                "comments": comments,
                "created_at": upload.created_at,
                "owner_avatar": owner_avatar or "default-avatar.svg",
                "caption": upload.caption or "",
                "post_type": upload.post_type,
                "nsfw": bool(upload.nsfw),
                "eleicao": bool(upload.eleicao),
                "media": [media],
            }
            if upload.eleicao:
                entry["post_id"] = upload.image_name
                result.append(entry)
            elif pid not in post_index:
                post_index[pid] = len(result)
                result.append(entry)
            else:
                grouped = result[post_index[pid]]
                grouped["media"].append(media)
                grouped["likes"] += likes
                grouped["comments"] += comments

    orphan_names = disk_files - {
        m["name"] for p in result for m in p["media"]
    }
    for fname in sorted(orphan_names, reverse=True):
        result.append({
            "post_id": fname, "name": fname, "owner": None, "likes": 0,
            "comments": 0, "created_at": "", "owner_avatar": "default-avatar.svg",
            "caption": "", "post_type": "image", "nsfw": False,
            "media": [{"name": fname, "media_type": "image"}],
        })

    return jsonify(result)


@images_bp.route("/api/images/since", methods=["GET"])
def list_images_since():
    after = request.args.get("after", "")
    if not after:
        return jsonify([])

    img_dir = Config.BASE_DIR / "images"

    like_count = (
        db.session.query(db.func.count(Like.id))
        .filter(Like.image_name == Upload.image_name)
        .correlate(Upload)
        .scalar_subquery()
    )
    comment_count = (
        db.session.query(db.func.count(Comment.id))
        .filter(Comment.image_name == Upload.image_name)
        .correlate(Upload)
        .scalar_subquery()
    )

    uploads = (
        db.session.query(
            Upload,
            User.username,
            User.avatar.label("owner_avatar"),
            like_count.label("likes"),
            comment_count.label("comments"),
        )
        .outerjoin(User, Upload.user_id == User.id)
        .filter(Upload.active == 1, Upload.created_at > after)
        .order_by(db.desc(Upload.created_at))
        .all()
    )

    disk_files = {
        f.name for f in img_dir.iterdir()
        if f.suffix.lower() in Config.ALL_MEDIA_EXTENSIONS
    }

    blocked = _blocked_ids()
    result = []
    post_index = {}
    for upload, username, owner_avatar, likes, comments in uploads:
        if upload.user_id and upload.user_id in blocked:
            continue
        if upload.post_type == "text" or upload.image_name in disk_files:
            pid = upload.post_id or upload.image_name
            media = {
                "name": upload.image_name,
                "media_type": upload.media_type,
            }
            entry = {
                "post_id": pid,
                "name": upload.image_name,
                "owner": username,
                "owner_id": upload.user_id,
                "likes": likes,
                "comments": comments,
                "created_at": upload.created_at,
                "owner_avatar": owner_avatar or "default-avatar.svg",
                "caption": upload.caption or "",
                "post_type": upload.post_type,
                "nsfw": bool(upload.nsfw),
                "eleicao": bool(upload.eleicao),
                "media": [media],
            }
            if upload.eleicao:
                entry["post_id"] = upload.image_name
                result.append(entry)
            elif pid not in post_index:
                post_index[pid] = len(result)
                result.append(entry)
            else:
                grouped = result[post_index[pid]]
                grouped["media"].append(media)
                grouped["likes"] += likes
                grouped["comments"] += comments

    return jsonify(result)


@images_bp.route("/api/users/search", methods=["GET"])
def search_users():
    q = (request.args.get("q") or "").strip()
    if len(q) < 1:
        return jsonify([])
    users = User.query.filter(
        User.username.like(f"%{q}%")
    ).order_by(User.username).limit(8).all()
    return jsonify([{"id": u.id, "username": u.username, "avatar": u.avatar} for u in users])


@images_bp.route("/api/upload", methods=["POST"])
@login_required
def upload_images():
    from routes.push import send_push

    files = request.files.getlist("images")
    zip_file = request.files.get("zip")
    has_files = any(f and f.filename for f in files)
    has_zip = bool(zip_file and zip_file.filename)
    caption = (request.form.get("caption") or "").strip()[:400]
    caption_template = (request.form.get("caption_template") or "").strip()[:400]
    nsfw = 1 if request.form.get("nsfw") == "1" else 0
    eleicao = 1 if request.form.get("eleicao") == "1" else 0

    if not has_files and not has_zip and not caption:
        return jsonify({"error": "no content"}), 400

    user = User.query.get(session["user_id"])
    if not user:
        session.clear()
        return jsonify({"error": "session expired, please login again"}), 401

    for f in files:
        if not f.filename:
            continue
        f.seek(0, os.SEEK_END)
        size = f.tell()
        f.seek(0)
        if size > Config.MAX_IMAGE_BYTES:
            return jsonify({"error": "image too large (max 10 MB per image)"}), 413

    img_dir = Config.BASE_DIR / "images"
    img_dir.mkdir(parents=True, exist_ok=True)

    post_id = uuid.uuid4().hex[:12]
    saved = []

    def save_file(data, filename, post_id, caption_override=None):
        ext = Path(filename).suffix.lower()
        is_video = ext in VIDEO_EXTENSIONS
        is_image = ext in Config.ALLOWED_EXTENSIONS
        if not is_video and not is_image:
            return

        base_name = Path(filename).name
        salt = uuid.uuid4().hex[:8]
        new_name = f"{salt}_{base_name}"
        (img_dir / new_name).write_bytes(data)

        media_type = "video" if is_video else "image"
        post_type = "video" if is_video else "image"

        upload = Upload(
            user_id=session["user_id"],
            post_id=post_id,
            image_name=new_name,
            original_name=base_name,
            media_type=media_type,
            caption=caption if caption_override is None else caption_override,
            post_type=post_type,
            nsfw=nsfw,
            eleicao=eleicao,
        )
        db.session.add(upload)
        saved.append(new_name)

    try:
        for f in files:
            if not f.filename:
                continue
            save_file(f.read(), f.filename, post_id)

        if zip_file and zip_file.filename:
            with zipfile.ZipFile(BytesIO(zip_file.read())) as zf:
                for entry in zf.infolist():
                    if entry.is_dir():
                        continue
                    if "__MACOSX" in entry.filename:
                        continue
                    name = Path(entry.filename).name
                    if not name or name.startswith("."):
                        continue
                    save_file(zf.read(entry.filename), name, post_id)

        if not saved and caption:
            text_name = f"text_{uuid.uuid4().hex[:8]}"
            upload = Upload(
                user_id=session["user_id"],
                post_id=post_id,
                image_name=text_name,
                original_name="",
                media_type="text",
                caption=caption,
                post_type="text",
                nsfw=nsfw,
                eleicao=eleicao,
            )
            db.session.add(upload)
            saved.append(text_name)

        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    if saved:
        link_image = saved[0]
        uploader_name = user.username
        uploader_id = user.id
        num_saved = len(saved)

        try:
            from db.models import PushToken
            users_with_tokens = (
                db.session.query(User.id)
                .join(PushToken, PushToken.user_id == User.id)
                .filter(User.id != uploader_id)
                .distinct()
                .all()
            )
            for u in users_with_tokens:
                send_push(
                    f"Novo post de @{uploader_name}",
                    f"@{uploader_name} postou {num_saved} arquivo(s)",
                    u.id,
                    image_name=link_image,
                )
        except Exception:
            pass

    return jsonify({"saved": saved, "post_id": post_id}), 201


@images_bp.route("/api/my-images/<path:image_name>", methods=["DELETE"])
@login_required
def delete_my_image(image_name):
    safe_name = Path(image_name).name
    upload = Upload.query.filter_by(image_name=safe_name).first()
    if not upload or upload.user_id != session["user_id"]:
        return jsonify({"error": "not found or not owner"}), 403

    siblings = Upload.query.filter_by(post_id=upload.post_id, active=1).all()
    img_dir = Config.BASE_DIR / "images"
    for sib in siblings:
        filepath = img_dir / sib.image_name
        if filepath.exists():
            filepath.unlink()
        thumb_path = Config.THUMB_DIR / (sib.image_name + ".webp")
        if thumb_path.exists():
            thumb_path.unlink()
        legacy_thumb = Config.THUMB_DIR / (sib.image_name + ".jpg")
        if legacy_thumb.exists():
            legacy_thumb.unlink()
        Like.query.filter_by(image_name=sib.image_name).delete()
        Comment.query.filter_by(image_name=sib.image_name).delete()
        from db.models import PushNotification
        PushNotification.query.filter_by(image_name=sib.image_name).delete()
        db.session.delete(sib)

    db.session.commit()
    return jsonify({"ok": True})


@images_bp.route("/api/auth/avatar", methods=["POST", "DELETE"])
@login_required
def avatar_upload():
    avatar_dir = Config.BASE_DIR / "static" / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    user = User.query.get(session["user_id"])

    if request.method == "DELETE":
        old_name = user.avatar
        user.avatar = "default-avatar.svg"
        db.session.commit()
        session["avatar"] = "default-avatar.svg"
        if old_name and old_name != "default-avatar.svg":
            old_path = avatar_dir / old_name
            if old_path.exists():
                old_path.unlink()
        return jsonify({"avatar": "default-avatar.svg"})

    file = request.files.get("avatar")
    if not file or not file.filename:
        return jsonify({"error": "no file"}), 400

    ext = Path(file.filename).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return jsonify({"error": "invalid file type"}), 400

    if ext == ".gif":
        data = file.read()
        if len(data) > 1024 * 1024:
            return jsonify({"error": "GIF muito grande (max 1MB)"}), 400
        if not data.startswith(b"GIF8"):
            return jsonify({"error": "invalid image"}), 400
        name = f"{session['user_id']}_{uuid.uuid4().hex[:8]}.gif"
        (avatar_dir / name).write_bytes(data)
    else:
        name = f"{session['user_id']}_{uuid.uuid4().hex[:8]}.webp"
        try:
            with Image.open(file.stream) as im:
                im = im.convert("RGB")
                im = ImageOps.fit(im, (128, 128), method=Image.Resampling.LANCZOS)
                im.save(str(avatar_dir / name), format="WEBP", quality=90, method=6)
        except Exception:
            return jsonify({"error": "invalid image"}), 400

    old_name = user.avatar
    user.avatar = name
    db.session.commit()
    session["avatar"] = name

    if old_name and old_name != "default-avatar.svg":
        old_path = avatar_dir / old_name
        if old_path.exists():
            old_path.unlink()

    return jsonify({"avatar": name})


@images_bp.route("/images/<path:filename>")
def serve_image(filename):
    return send_from_directory(Config.BASE_DIR / "images", filename, max_age=604800)


@images_bp.route("/thumbs/<path:filename>")
def serve_thumb(filename):
    safe = Path(filename).name
    thumb_dir = Config.THUMB_DIR
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_path = thumb_dir / (safe + ".webp")

    if thumb_path.exists():
        return send_file(thumb_path, mimetype="image/webp", max_age=604800)

    src = Config.BASE_DIR / "images" / safe
    if not src.exists():
        return jsonify({"error": "not found"}), 404

    ext = Path(safe).suffix.lower()

    if ext == ".gif":
        return send_from_directory(Config.BASE_DIR / "images", safe, max_age=604800)

    if not (ext in Config.ALLOWED_EXTENSIONS or Path(safe).suffix.lower() in VIDEO_EXTENSIONS):
        return jsonify({"error": "unsupported"}), 404

    im = None
    try:
        with Image.open(src) as opened:
            im = ImageOps.exif_transpose(opened)
    except Exception:
        im = None
    if im is None:
        return jsonify({"error": "no preview"}), 404

    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    im.thumbnail((Config.THUMB_SIZE, Config.THUMB_SIZE))
    im.save(str(thumb_path), format="WEBP", quality=82, method=6)
    return send_file(thumb_path, mimetype="image/webp", max_age=604800)


@images_bp.route("/avatars/<path:filename>")
def serve_avatar(filename):
    return send_from_directory(Config.BASE_DIR / "static" / "avatars", filename, max_age=604800)
