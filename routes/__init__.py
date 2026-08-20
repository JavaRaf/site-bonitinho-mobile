from routes.auth import auth_bp
from routes.push import push_bp
from routes.admin import admin_bp
from routes.images import images_bp
from routes.comments import comments_bp
from routes.likes import likes_bp


def register_blueprints(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(push_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(images_bp)
    app.register_blueprint(comments_bp)
    app.register_blueprint(likes_bp)
