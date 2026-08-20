from db import db
from datetime import datetime


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.Text, nullable=False, unique=True)
    password = db.Column(db.Text, nullable=False)
    is_admin = db.Column(db.Integer, nullable=False, default=0)
    avatar = db.Column(db.Text, nullable=False, default="default-avatar.svg")
    color = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))

    uploads = db.relationship("Upload", backref="owner", lazy=True, cascade="all, delete-orphan")
    likes = db.relationship("Like", backref="user", lazy=True, cascade="all, delete-orphan")
    comments = db.relationship("Comment", backref="author", lazy=True, cascade="all, delete-orphan")


class Upload(db.Model):
    __tablename__ = "uploads"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    post_id = db.Column(db.Text, nullable=False, default="")
    image_name = db.Column(db.Text, nullable=False, unique=True)
    original_name = db.Column(db.Text, nullable=False)
    media_type = db.Column(db.Text, nullable=False, default="image")
    caption = db.Column(db.Text, nullable=False, default="")
    post_type = db.Column(db.Text, nullable=False, default="image")
    nsfw = db.Column(db.Integer, nullable=False, default=0)
    active = db.Column(db.Integer, nullable=False, default=1)
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))


class Like(db.Model):
    __tablename__ = "likes"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    image_name = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))
    __table_args__ = (db.UniqueConstraint("user_id", "image_name"),)


class Comment(db.Model):
    __tablename__ = "comments"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    image_name = db.Column(db.Text, nullable=False)
    text = db.Column(db.Text, nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey("comments.id", ondelete="CASCADE"), nullable=True)
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))


class CommentLike(db.Model):
    __tablename__ = "comment_likes"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    comment_id = db.Column(db.Integer, db.ForeignKey("comments.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))
    __table_args__ = (db.UniqueConstraint("user_id", "comment_id"),)


class Round(db.Model):
    __tablename__ = "rounds"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    round_number = db.Column(db.Integer, nullable=False)
    cutoff = db.Column(db.Integer, nullable=False)
    finished_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))


class Setting(db.Model):
    __tablename__ = "settings"
    key = db.Column(db.Text, primary_key=True)
    value = db.Column(db.Text, nullable=False)


class PushToken(db.Model):
    __tablename__ = "push_tokens"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    token = db.Column(db.Text, nullable=False, unique=True)
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))


class PushNotification(db.Model):
    __tablename__ = "push_notifications"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.Text, nullable=False)
    body = db.Column(db.Text, nullable=False)
    image_name = db.Column(db.Text, nullable=False, default="")
    read = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))
