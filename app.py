from pathlib import Path
from flask import Flask, jsonify, render_template, session, send_from_directory
from config import Config


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    from db import init_app
    init_app(app)

    from routes import register_blueprints
    register_blueprints(app)

    register_page_routes(app)
    register_service_worker(app)

    return app


def register_page_routes(app):

    @app.route("/health", methods=["GET"])
    def health_check():
        return jsonify({"status": "ok"}), 200

    @app.route("/", methods=["GET"])
    def main():
        if "user_id" not in session:
            return render_template("login.html")
        from db.models import User
        user = User.query.get(session["user_id"])
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
        from db.models import User
        user = User.query.get(session["user_id"])
        if not user or not user.is_admin:
            return (
                "<h2>Voce nao e admin</h2>"
                "<p>Redirecionando para a tela inicial...</p>"
                '<script>setTimeout(() => location.href = "/", 2000);</script>'
            )
        return render_template("admin.html")

    @app.route("/votos", methods=["GET"])
    def votos_page():
        return render_template("votos.html")


def register_service_worker(app):

    @app.route("/firebase-messaging-sw.js")
    def service_worker():
        return send_from_directory(
            Config.BASE_DIR, "firebase-messaging-sw.js",
            mimetype="application/javascript",
        )


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, host="0.0.0.0", port=5000)
