from pathlib import Path
import sqlite3
import uuid
from datetime import timedelta
from flask import Flask, jsonify, render_template, send_from_directory, session, request

from db.schema import init_db, get_db
from routes.auth import auth_bp

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "db" / "app.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.secret_key = "change-this-to-a-random-secret-in-production"
app.config["SESSION_PERMANENT"] = True
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=20)

init_db()
app.register_blueprint(auth_bp)


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"}), 200


@app.route("/", methods=["GET"])
def main():
    if "user_id" not in session:
        return render_template("login.html")
    # verify user still exists
    db = get_db()
    user = db.execute("SELECT id FROM users WHERE id = ?", (session["user_id"],)).fetchone()
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
    if not session.get("is_admin"):
        return render_template("login.html")
    return render_template("admin.html")


@app.route("/api/images", methods=["GET"])
def list_images():
    img_dir = BASE_DIR / "images"
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    db = get_db()
    rows = db.execute(
        """SELECT u.image_name, us.username,
                  (SELECT COUNT(*) FROM likes l WHERE l.image_name = u.image_name) AS likes
           FROM uploads u LEFT JOIN users us ON u.user_id = us.id
           ORDER BY likes DESC, u.created_at DESC"""
    ).fetchall()
    db.close()

    disk_images = {f.name for f in img_dir.iterdir() if f.suffix.lower() in allowed}
    result = []
    seen = set()
    for r in rows:
        if r["image_name"] in disk_images:
            result.append({"name": r["image_name"], "owner": r["username"], "likes": r["likes"]})
            seen.add(r["image_name"])
    for fname in sorted(disk_images - seen, reverse=True):
        result.append({"name": fname, "owner": None, "likes": 0})

    return jsonify(result)


@app.route("/api/upload", methods=["POST"])
def upload_images():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    files = request.files.getlist("images")
    if not files or all(not f.filename for f in files):
        return jsonify({"error": "no files"}), 400

    allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    img_dir = BASE_DIR / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    db = get_db()

    # verify user still exists
    user = db.execute("SELECT id FROM users WHERE id = ?", (session["user_id"],)).fetchone()
    if not user:
        db.close()
        session.clear()
        return jsonify({"error": "session expired, please login again"}), 401

    saved = []

    try:
        for f in files:
            if not f.filename:
                continue
            ext = Path(f.filename).suffix.lower()
            if ext not in allowed:
                continue
            salt = uuid.uuid4().hex[:8]
            new_name = f"{salt}_{f.filename}"
            f.save(str(img_dir / new_name))
            db.execute(
                "INSERT INTO uploads (user_id, image_name, original_name) VALUES (?, ?, ?)",
                (session["user_id"], new_name, f.filename)
            )
            saved.append(new_name)
        db.commit()
    finally:
        db.close()

    return jsonify({"saved": saved}), 201


@app.route("/api/admin/images", methods=["DELETE"])
def admin_delete_images():
    if not session.get("is_admin"):
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
    if not session.get("is_admin"):
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
    if not session.get("is_admin"):
        return jsonify({"error": "admin only"}), 403
    db = get_db()
    db.execute("DELETE FROM likes WHERE image_name = ? AND user_id = ?", (image_name, user_id))
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/api/admin/users", methods=["GET"])
def admin_list_users():
    if not session.get("is_admin"):
        return jsonify({"error": "admin only"}), 403
    db = get_db()
    users = db.execute("SELECT id, username, is_admin FROM users ORDER BY id").fetchall()
    db.close()
    return jsonify([dict(u) for u in users])


@app.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
def admin_delete_user(user_id):
    if not session.get("is_admin"):
        return jsonify({"error": "admin only"}), 403

    db = get_db()
    target = db.execute("SELECT id, is_admin FROM users WHERE id = ?", (user_id,)).fetchone()
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
    if not session.get("is_admin"):
        return jsonify({"error": "admin only"}), 403
    db = get_db()
    db.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (user_id,))
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/votos", methods=["GET"])
def votos_page():
    return render_template("votos.html")


@app.route("/api/votos", methods=["GET"])
def ranking_api():
    db = get_db()
    rows = db.execute(
        """SELECT u.image_name, us.username AS owner,
                  (SELECT COUNT(*) FROM likes l WHERE l.image_name = u.image_name) AS likes
           FROM uploads u LEFT JOIN users us ON u.user_id = us.id
           ORDER BY likes DESC, u.created_at DESC"""
    ).fetchall()

    result = []
    for r in rows:
        likers = db.execute(
            "SELECT us.username, l.user_id FROM likes l JOIN users us ON l.user_id = us.id WHERE l.image_name = ?",
            (r["image_name"],)
        ).fetchall()
        result.append({
            "name": r["image_name"],
            "owner": r["owner"],
            "likes": r["likes"],
            "likers": [{"username": lr["username"], "id": lr["user_id"]} for lr in likers]
        })

    img_dir = BASE_DIR / "images"
    result = [x for x in result if (img_dir / x["name"]).exists()]
    db.close()
    return jsonify(result)


@app.route("/images/<path:filename>")
def serve_image(filename):
    return send_from_directory(BASE_DIR / "images", filename)


@app.route("/avatars/<path:filename>")
def serve_avatar(filename):
    return send_from_directory(BASE_DIR / "avatars", filename)


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


@app.route("/api/likes/<path:image_name>", methods=["POST"])
def toggle_like(image_name):
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    db = get_db()
    existing = db.execute(
        "SELECT id FROM likes WHERE user_id = ? AND image_name = ?",
        (session["user_id"], image_name)
    ).fetchone()

    if existing:
        db.execute("DELETE FROM likes WHERE id = ?", (existing["id"],))
        db.commit()
        db.close()
        return jsonify({"liked": False})
    else:
        db.execute(
            "INSERT INTO likes (user_id, image_name) VALUES (?, ?)",
            (session["user_id"], image_name)
        )
        db.commit()
        db.close()
        return jsonify({"liked": True})


@app.route("/api/comments/<path:image_name>", methods=["GET", "POST"])
def handle_comments(image_name):
    db = get_db()

    if request.method == "GET":
        rows = db.execute(
            """SELECT c.id, c.text, c.created_at, u.username, c.user_id
               FROM comments c JOIN users u ON c.user_id = u.id
               WHERE c.image_name = ?
               ORDER BY c.created_at ASC""",
            (image_name,)
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
        (session["user_id"], image_name, text)
    )
    db.commit()

    row = db.execute(
        """SELECT c.id, c.text, c.created_at, u.username
           FROM comments c JOIN users u ON c.user_id = u.id
           WHERE c.id = ?""",
        (db.execute("SELECT last_insert_rowid()").fetchone()[0],)
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
