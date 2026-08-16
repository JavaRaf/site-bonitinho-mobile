import os

from pathlib import Path
import sqlite3
import uuid
import zipfile
from datetime import timedelta
from io import BytesIO
from flask import (
    Flask,
    jsonify,
    render_template,
    send_from_directory,
    send_file,
    session,
    request,
)
from PIL import Image, ImageOps
from flask.cli import load_dotenv

from db.schema import init_db, get_db
from routes.auth import auth_bp

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DB_PATH = BASE_DIR / "db" / "app.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB per individual image (ZIP not limited)

app = Flask(__name__)

app.secret_key = os.getenv("SECRET_KEY") or "dev-secret-key-change-me"
app.config["SESSION_PERMANENT"] = True
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)

init_db()
app.register_blueprint(auth_bp)


def get_setting(key, default=None):
    db = get_db()
    row = db.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    db.close()
    return row["value"] if row else default


def set_setting(key, value):
    db = get_db()
    db.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    db.commit()
    db.close()


def is_admin():
    if "user_id" not in session:
        return False
    db = get_db()
    row = db.execute(
        "SELECT is_admin FROM users WHERE id = ?", (session["user_id"],)
    ).fetchone()
    db.close()
    return bool(row and row["is_admin"])


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"}), 200


@app.route("/", methods=["GET"])
def main():
    if "user_id" not in session:
        return render_template("login.html")
    # verify user still exists
    db = get_db()
    user = db.execute(
        "SELECT id FROM users WHERE id = ?", (session["user_id"],)
    ).fetchone()
    db.close()
    if not user:
        session.clear()
        return render_template("login.html")
    return render_template("index.html")


@app.route("/login", methods=["GET"])
def login_page():
    return render_template("login.html")


@app.route("/register", methods=["GET"])
def register_page():
    return render_template("register.html")


@app.route("/perfil", methods=["GET"])
def perfil_page():
    if "user_id" not in session:
        return render_template("login.html")
    return render_template("perfil.html")


@app.route("/admin", methods=["GET"])
def admin_page():
    if "user_id" not in session:
        return render_template("login.html")
    if not is_admin():
        return (
            "<h2>Você não é admin</h2>"
            "<p>Redirecionando para a tela inicial...</p>"
            '<script>setTimeout(() => location.href = "/", 2000);</script>'
        )
    return render_template("admin.html")


@app.route("/api/images", methods=["GET"])
def list_images():
    img_dir = BASE_DIR / "images"
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    db = get_db()
    rows = db.execute("""SELECT u.image_name, us.username, us.avatar AS owner_avatar, u.caption,
                  (SELECT COUNT(*) FROM likes l WHERE l.image_name = u.image_name) AS likes
           FROM uploads u LEFT JOIN users us ON u.user_id = us.id
           WHERE u.active = 1
           ORDER BY likes DESC, u.created_at DESC""").fetchall()
    db.close()

    disk_images = {f.name for f in img_dir.iterdir() if f.suffix.lower() in allowed}
    result = []
    seen = set()
    for r in rows:
        if r["image_name"] in disk_images:
            result.append(
                {
                    "name": r["image_name"],
                    "owner": r["username"],
                    "likes": r["likes"],
                    "owner_avatar": r["owner_avatar"] or "default-avatar.svg",
                    "caption": r["caption"] or "",
                }
            )
            seen.add(r["image_name"])
    for fname in sorted(disk_images - seen, reverse=True):
        result.append(
            {"name": fname, "owner": None, "likes": 0, "owner_avatar": "default-avatar.svg", "caption": ""}
        )

    return jsonify(result)


@app.route("/api/upload", methods=["POST"])
def upload_images():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    files = request.files.getlist("images")
    zip_file = request.files.get("zip")
    has_files = any(f and f.filename for f in files)
    has_zip = bool(zip_file and zip_file.filename)
    if not has_files and not has_zip:
        return jsonify({"error": "no files"}), 400

    # Cap individual image files only; ZIP uploads are not limited
    for f in files:
        if not f.filename:
            continue
        f.seek(0, os.SEEK_END)
        size = f.tell()
        f.seek(0)
        if size > MAX_IMAGE_BYTES:
            return jsonify({"error": "image too large (max 10 MB per image)"}), 413

    allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    img_dir = BASE_DIR / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    db = get_db()

    # verify user still exists
    user = db.execute(
        "SELECT id FROM users WHERE id = ?", (session["user_id"],)
    ).fetchone()
    if not user:
        db.close()
        session.clear()
        return jsonify({"error": "session expired, please login again"}), 401

    caption = (request.form.get("caption") or "").strip()[:250]

    saved = []

    def save_image(data, filename):
        ext = Path(filename).suffix.lower()
        if ext not in allowed:
            return
        base_name = Path(filename).name
        salt = uuid.uuid4().hex[:8]
        new_name = f"{salt}_{base_name}"
        (img_dir / new_name).write_bytes(data)
        db.execute(
            "INSERT INTO uploads (user_id, image_name, original_name, caption) VALUES (?, ?, ?, ?)",
            (session["user_id"], new_name, base_name, caption),
        )
        saved.append(new_name)

    try:
        for f in files:
            if not f.filename:
                continue
            save_image(f.read(), f.filename)

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
                    save_image(zf.read(entry.filename), name)

        db.commit()
    finally:
        db.close()

    return jsonify({"saved": saved}), 201


@app.route("/api/admin/images", methods=["DELETE"])
def admin_delete_images():
    if not is_admin():
        return jsonify({"error": "admin only"}), 403

    data = request.get_json()
    names = data.get("images", [])
    if not names:
        return jsonify({"error": "no images"}), 400

    img_dir = BASE_DIR / "images"
    db = get_db()

    for name in names:
        filepath = img_dir / name
        if filepath.exists():
            filepath.unlink()
        db.execute("DELETE FROM uploads WHERE image_name = ?", (name,))

    db.commit()
    db.close()
    return jsonify({"ok": True, "deleted": len(names)})


@app.route("/api/admin/likes", methods=["DELETE"])
def admin_remove_likes():
    if not is_admin():
        return jsonify({"error": "admin only"}), 403

    data = request.get_json()
    names = data.get("images", [])
    if not names:
        return jsonify({"error": "no images"}), 400

    db = get_db()
    for name in names:
        db.execute("DELETE FROM likes WHERE image_name = ?", (name,))
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/api/admin/likes/<path:image_name>/<int:user_id>", methods=["DELETE"])
def admin_remove_single_like(image_name, user_id):
    if not is_admin():
        return jsonify({"error": "admin only"}), 403
    db = get_db()
    db.execute(
        "DELETE FROM likes WHERE image_name = ? AND user_id = ?", (image_name, user_id)
    )
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/api/admin/users", methods=["GET"])
def admin_list_users():
    if not is_admin():
        return jsonify({"error": "admin only"}), 403
    db = get_db()
    users = db.execute(
        "SELECT id, username, is_admin FROM users ORDER BY id"
    ).fetchall()
    db.close()
    return jsonify([dict(u) for u in users])


@app.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
def admin_delete_user(user_id):
    if not is_admin():
        return jsonify({"error": "admin only"}), 403

    db = get_db()
    target = db.execute(
        "SELECT id, is_admin FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if not target:
        db.close()
        return jsonify({"error": "not found"}), 404

    # can't delete self if you're admin and no other admin exists
    if target["is_admin"]:
        other_admins = db.execute(
            "SELECT COUNT(*) FROM users WHERE is_admin = 1 AND id != ?", (user_id,)
        ).fetchone()[0]
        if other_admins == 0:
            db.close()
            return jsonify({"error": "cannot delete the only admin"}), 403

    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/api/admin/users/<int:user_id>/promote", methods=["PUT"])
def admin_promote_user(user_id):
    if not is_admin():
        return jsonify({"error": "admin only"}), 403
    db = get_db()
    db.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (user_id,))
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/api/admin/collage", methods=["POST"])
def admin_export_collage():
    if not is_admin():
        return jsonify({"error": "admin only"}), 403

    data = request.get_json(silent=True) or {}
    names = data.get("images", [])
    img_dir = BASE_DIR / "images"

    if not names:
        allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
        names = sorted(f.name for f in img_dir.iterdir() if f.suffix.lower() in allowed)

    paths = [img_dir / n for n in names if (img_dir / n).exists()]
    if not paths:
        return jsonify({"error": "no images"}), 400

    SIZE = 1600
    n = len(paths)
    cols = int(n**0.5) + (1 if int(n**0.5) ** 2 < n else 0)
    rows = (n + cols - 1) // cols

    cell_w = SIZE // cols
    cell_h = SIZE // rows

    canvas = Image.new("RGB", (SIZE, SIZE), "white")

    for i, path in enumerate(paths):
        col = i % cols
        row = i // cols
        with Image.open(path) as im:
            im = im.convert("RGBA")
            # cover-fit the image into the cell
            im = ImageOps.fit(im, (cell_w, cell_h), method=Image.Resampling.LANCZOS)
            canvas.paste(im, (col * cell_w, row * cell_h), im)

    buf = BytesIO()
    canvas.save(buf, format="PNG")
    buf.seek(0)
    return send_file(
        buf, mimetype="image/png", as_attachment=True, download_name="collage.png"
    )


@app.route("/api/admin/turnos", methods=["GET"])
def admin_turnos():
    if not is_admin():
        return jsonify({"error": "admin only"}), 403

    db = get_db()
    current_round = db.execute(
        "SELECT COALESCE(MAX(round_number), 0) FROM rounds"
    ).fetchone()[0]
    rows = db.execute("""SELECT u.image_name, us.username AS owner,
                  (SELECT COUNT(*) FROM likes l WHERE l.image_name = u.image_name) AS likes
           FROM uploads u LEFT JOIN users us ON u.user_id = us.id
           WHERE u.active = 1
           ORDER BY likes DESC, u.created_at DESC""").fetchall()
    history = db.execute(
        "SELECT round_number, cutoff, finished_at FROM rounds ORDER BY round_number DESC"
    ).fetchall()
    db.close()

    return jsonify(
        {
            "current_round": current_round + 1,
            "active_count": len(rows),
            "images": [
                {"name": r["image_name"], "owner": r["owner"], "likes": r["likes"]}
                for r in rows
            ],
            "history": [dict(h) for h in history],
        }
    )


@app.route("/api/admin/turnos/advance", methods=["POST"])
def admin_turnos_advance():
    if not is_admin():
        return jsonify({"error": "admin only"}), 403

    data = request.get_json(silent=True) or {}
    try:
        cutoff = int(data.get("cutoff", 3))
    except (TypeError, ValueError):
        return jsonify({"error": "cutoff inválido"}), 400
    if cutoff < 1:
        return jsonify({"error": "cutoff deve ser >= 1"}), 400

    db = get_db()
    rows = db.execute("""SELECT image_name FROM uploads WHERE active = 1
           ORDER BY (SELECT COUNT(*) FROM likes l WHERE l.image_name = uploads.image_name) DESC,
                    created_at DESC""").fetchall()
    names = [r["image_name"] for r in rows]

    if len(names) <= cutoff:
        db.close()
        return jsonify({"error": "Nada a fazer: imagens ativas <= cutoff"}), 400

    survivors = names[:cutoff]
    eliminated = names[cutoff:]

    # remove eliminated images from disk and DB
    img_dir = BASE_DIR / "images"
    for name in eliminated:
        filepath = img_dir / name
        if filepath.exists():
            filepath.unlink()
    db.executemany(
        "DELETE FROM uploads WHERE image_name = ?", [(n,) for n in eliminated]
    )
    db.executemany(
        "DELETE FROM comments WHERE image_name = ?", [(n,) for n in eliminated]
    )
    db.execute("DELETE FROM likes")
    current_round = db.execute(
        "SELECT COALESCE(MAX(round_number), 0) FROM rounds"
    ).fetchone()[0]
    db.execute(
        "INSERT INTO rounds (round_number, cutoff) VALUES (?, ?)",
        (current_round + 1, cutoff),
    )
    db.commit()
    db.close()

    return jsonify(
        {"round": current_round + 1, "passed": survivors, "removed": eliminated}
    )


@app.route("/api/admin/turnos/mode", methods=["GET", "POST"])
def admin_turnos_mode():
    if not is_admin():
        return jsonify({"error": "admin only"}), 403

    if request.method == "GET":
        return jsonify({"single_vote_mode": get_setting("single_vote_mode") == "1"})

    data = request.get_json(silent=True) or {}
    enabled = bool(data.get("enabled"))
    set_setting("single_vote_mode", "1" if enabled else "0")
    return jsonify({"single_vote_mode": enabled})


@app.route("/api/admin/turnos/reset", methods=["POST"])
def admin_turnos_reset():
    if not is_admin():
        return jsonify({"error": "admin only"}), 403

    db = get_db()
    db.execute("DELETE FROM rounds")
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/votos", methods=["GET"])
def votos_page():
    return render_template("votos.html")


@app.route("/api/votos", methods=["GET"])
def ranking_api():
    db = get_db()
    rows = db.execute("""SELECT u.image_name, us.username AS owner,
                  (SELECT COUNT(*) FROM likes l WHERE l.image_name = u.image_name) AS likes
           FROM uploads u LEFT JOIN users us ON u.user_id = us.id
           WHERE u.active = 1
           ORDER BY likes DESC, u.created_at DESC""").fetchall()

    result = []
    for r in rows:
        likers = db.execute(
            "SELECT us.username, l.user_id FROM likes l JOIN users us ON l.user_id = us.id WHERE l.image_name = ?",
            (r["image_name"],),
        ).fetchall()
        result.append(
            {
                "name": r["image_name"],
                "owner": r["owner"],
                "likes": r["likes"],
                "likers": [
                    {"username": lr["username"], "id": lr["user_id"]} for lr in likers
                ],
            }
        )

    img_dir = BASE_DIR / "images"
    result = [x for x in result if (img_dir / x["name"]).exists()]
    db.close()
    return jsonify(result)


@app.route("/images/<path:filename>")
def serve_image(filename):
    return send_from_directory(BASE_DIR / "images", filename)


@app.route("/avatars/<path:filename>")
def serve_avatar(filename):
    return send_from_directory(BASE_DIR / "static" / "avatars", filename)


@app.route("/api/auth/avatar", methods=["POST", "DELETE"])
def avatar_upload():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    avatar_dir = BASE_DIR / "static" / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    db = get_db()

    if request.method == "DELETE":
        old = db.execute(
            "SELECT avatar FROM users WHERE id = ?", (session["user_id"],)
        ).fetchone()
        old_name = old["avatar"] if old else ""
        db.execute(
            "UPDATE users SET avatar = 'default-avatar.svg' WHERE id = ?",
            (session["user_id"],),
        )
        db.commit()
        db.close()
        session["avatar"] = "default-avatar.svg"
        if old_name and old_name != "default-avatar.svg":
            old_path = avatar_dir / old_name
            if old_path.exists():
                old_path.unlink()
        return jsonify({"avatar": "default-avatar.svg"})

    file = request.files.get("avatar")
    if not file or not file.filename:
        db.close()
        return jsonify({"error": "no file"}), 400

    ext = Path(file.filename).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
        db.close()
        return jsonify({"error": "invalid file type"}), 400

    name = f"{session['user_id']}_{uuid.uuid4().hex[:8]}.png"
    try:
        with Image.open(file.stream) as im:
            im = im.convert("RGB")
            im = ImageOps.fit(im, (128, 128), method=Image.Resampling.LANCZOS)
            im.save(str(avatar_dir / name), format="PNG")
    except Exception:
        db.close()
        return jsonify({"error": "invalid image"}), 400

    old = db.execute(
        "SELECT avatar FROM users WHERE id = ?", (session["user_id"],)
    ).fetchone()
    old_name = old["avatar"] if old else ""
    db.execute(
        "UPDATE users SET avatar = ? WHERE id = ?", (name, session["user_id"])
    )
    db.commit()
    db.close()
    session["avatar"] = name

    if old_name and old_name != "default-avatar.svg":
        old_path = avatar_dir / old_name
        if old_path.exists():
            old_path.unlink()

    return jsonify({"avatar": name})


@app.route("/api/singlevote", methods=["GET"])
def single_vote_status():
    return jsonify({"enabled": get_setting("single_vote_mode") == "1"})


@app.route("/api/likes", methods=["GET"])
def get_likes():
    if "user_id" not in session:
        return jsonify({"likes": []})
    db = get_db()
    rows = db.execute(
        "SELECT image_name FROM likes WHERE user_id = ?", (session["user_id"],)
    ).fetchall()
    db.close()
    return jsonify({"likes": [r["image_name"] for r in rows]})


@app.route("/api/likers/<path:image_name>", methods=["GET"])
def get_likers(image_name):
    db = get_db()
    rows = db.execute(
        "SELECT us.username, l.user_id FROM likes l JOIN users us ON l.user_id = us.id "
        "WHERE l.image_name = ? ORDER BY l.created_at ASC",
        (image_name,),
    ).fetchall()
    db.close()
    return jsonify([{"username": r["username"], "id": r["user_id"]} for r in rows])


@app.route("/api/likes/<path:image_name>", methods=["POST"])
def toggle_like(image_name):
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    db = get_db()
    existing = db.execute(
        "SELECT id FROM likes WHERE user_id = ? AND image_name = ?",
        (session["user_id"], image_name),
    ).fetchone()

    if existing:
        db.execute("DELETE FROM likes WHERE id = ?", (existing["id"],))
        db.commit()
        db.close()
        return jsonify({"liked": False})
    else:
        if get_setting("single_vote_mode") == "1":
            other = db.execute(
                "SELECT id FROM likes WHERE user_id = ? AND image_name != ?",
                (session["user_id"], image_name),
            ).fetchone()
            if other:
                db.execute("DELETE FROM likes WHERE id = ?", (other["id"],))
        db.execute(
            "INSERT INTO likes (user_id, image_name) VALUES (?, ?)",
            (session["user_id"], image_name),
        )
        db.commit()
        db.close()
        return jsonify({"liked": True})


@app.route("/api/comments/<path:image_name>", methods=["GET", "POST"])
def handle_comments(image_name):
    db = get_db()

    if request.method == "GET":
        rows = db.execute(
            """SELECT c.id, c.text, c.created_at, u.username, u.color, c.user_id
               FROM comments c JOIN users u ON c.user_id = u.id
               WHERE c.image_name = ?
               ORDER BY c.created_at ASC""",
            (image_name,),
        ).fetchall()
        db.close()
        return jsonify([dict(r) for r in rows])

    # POST
    if "user_id" not in session:
        db.close()
        return jsonify({"error": "login required"}), 401

    data = request.get_json()
    text = (data.get("text") or "").strip()
    if not text:
        db.close()
        return jsonify({"error": "text is required"}), 400

    db.execute(
        "INSERT INTO comments (user_id, image_name, text) VALUES (?, ?, ?)",
        (session["user_id"], image_name, text),
    )
    db.commit()

    row = db.execute(
        """SELECT c.id, c.text, c.created_at, u.username
           FROM comments c JOIN users u ON c.user_id = u.id
           WHERE c.id = ?""",
        (db.execute("SELECT last_insert_rowid()").fetchone()[0],),
    ).fetchone()
    db.close()
    return jsonify(dict(row)), 201


@app.route("/api/comments/id/<int:comment_id>", methods=["DELETE"])
def delete_comment(comment_id):
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    db = get_db()
    comment = db.execute(
        "SELECT id, user_id FROM comments WHERE id = ?", (comment_id,)
    ).fetchone()

    if not comment:
        db.close()
        return jsonify({"error": "not found"}), 404

    is_admin = session.get("is_admin", False)
    is_owner = comment["user_id"] == session["user_id"]

    if not is_admin and not is_owner:
        db.close()
        return jsonify({"error": "forbidden"}), 403

    db.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
    db.commit()
    db.close()
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
