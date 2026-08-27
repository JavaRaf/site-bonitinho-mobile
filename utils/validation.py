import re

USERNAME_RE = re.compile(r"^[a-z0-9_.]{3,30}$")


def normalize_username(raw):
    return (raw or "").strip().lower()


def validate_username(username):
    if not username or len(username) < 3:
        return False, "usuário mínimo 3 caracteres"
    if len(username) > 30:
        return False, "usuário máximo 30 caracteres"
    if not USERNAME_RE.match(username):
        return False, "apenas letras, números, ponto e underscore (sem espaços/símbolos)"
    return True, ""