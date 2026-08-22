import os
import re
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta
import requests
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)

USERNAME = os.getenv("PYTHONANYWHERE_USER")
PASSWORD = os.getenv("PYTHONANYWHERE_PASS")

LOGIN_URL = "https://www.pythonanywhere.com/login/"
WEBAPP_URL = f"https://www.pythonanywhere.com/user/{USERNAME}/webapps/"
LOG_FILE = Path(__file__).resolve().parent / "renew_log.json"


def load_log():
    if LOG_FILE.exists():
        with open(LOG_FILE, "r") as f:
            return json.load(f)
    return {}


def save_log(data):
    with open(LOG_FILE, "w") as f:
        json.dump(data, f, indent=2)


def extract_expiry_date(html):
    match = re.search(
        r"This site will be disabled on\s+(\w+ \d+ \w+ \d+)", html
    )
    if match:
        return match.group(1)
    return None


def parse_expiry_date(date_str):
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%A %d %B %Y")
    except ValueError:
        return None


def should_renew():
    log = load_log()
    expiry_str = log.get("expiry_date")
    expiry = parse_expiry_date(expiry_str)
    if not expiry:
        return True
    days_left = (expiry - datetime.now()).days
    return days_left <= 25


def renew():
    if not USERNAME or not PASSWORD:
        print("PYTHONANYWHERE_USER e PYTHONANYWHERE_PASS devem estar no .env")
        sys.exit(1)

    session = requests.Session()

    login_page = session.get(LOGIN_URL)
    csrf_token = session.cookies.get("csrftoken")

    response = session.post(LOGIN_URL, data={
        "auth-username": USERNAME,
        "auth-password": PASSWORD,
        "csrfmiddlewaretoken": csrf_token,
        "login_view-current_step": "auth",
    }, headers={"Referer": LOGIN_URL})

    if response.status_code != 200 or "Log out" not in response.text:
        print("Falha no login")
        sys.exit(1)
    print(f"Login realizado como {USERNAME}")

    webapp_page = session.get(WEBAPP_URL)
    csrf_token = session.cookies.get("csrftoken")

    date_before = extract_expiry_date(webapp_page.text)
    print(f"Data de expiracao antes: {date_before}")

    domain = f"{USERNAME}.pythonanywhere.com"
    reload_url = f"https://www.pythonanywhere.com/user/{USERNAME}/webapps/{domain}/reload"

    response = session.post(reload_url, data={
        "csrfmiddlewaretoken": csrf_token,
    }, headers={"Referer": WEBAPP_URL})

    if response.status_code != 200:
        print(f"Erro ao renovar: {response.status_code}")
        sys.exit(1)

    webapp_page = session.get(WEBAPP_URL)
    date_after = extract_expiry_date(webapp_page.text)
    print(f"Data de expiracao depois: {date_after}")

    log = load_log()
    previous_date = log.get("expiry_date")

    updated = date_after != previous_date
    log["previous_expiry_date"] = previous_date
    log["expiry_date"] = date_after
    log["last_run"] = datetime.now().isoformat()
    log["updated"] = updated
    save_log(log)

    if updated:
        print(f"Data atualizada! {previous_date} -> {date_after}")
    else:
        print(f"Data nao mudou: {date_after}")


if __name__ == "__main__":
    if not should_renew():
        log = load_log()
        expiry = parse_expiry_date(log.get("expiry_date"))
        days_left = (expiry - datetime.now()).days
        print(f"Faltam {days_left} dias para expirar. Renovacao nao necessaria ainda.")
        sys.exit(0)
    renew()
