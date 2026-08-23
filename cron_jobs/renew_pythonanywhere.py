import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)

USERNAME = os.getenv("PYTHONANYWHERE_USER")
PASSWORD = os.getenv("PYTHONANYWHERE_PASS")


def renew():
    if not USERNAME or not PASSWORD:
        print("PYTHONANYWHERE_USER e PYTHONANYWHERE_PASS devem estar definidos.")
        sys.exit(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            print("Acessando a página de login...")
            page.goto("https://www.pythonanywhere.com/login/")

            print("Preenchendo credenciais...")
            page.fill("input[name='auth-username']", USERNAME)
            page.fill("input[name='auth-password']", PASSWORD)

            print("Enviando login...")
            page.click("button#id_next")
            page.wait_for_load_state("networkidle")

            # Verifica se logou com sucesso
            if "login" in page.url:
                print("Falha ao logar. Verifique o usuário e a senha.")
                page.screenshot(path="failure.png")
                sys.exit(1)

            print(f"Login efetuado com sucesso para: {USERNAME}")

            print("Navegando para a página da Webapp...")
            page.goto(f"https://www.pythonanywhere.com/user/{USERNAME}/webapps/")
            page.wait_for_load_state("networkidle")

            # Procura pelo formulário ou botão de renovação
            # O texto padrão do botão é "Run until 3 months from today"
            renew_button = page.locator("form[action*='extend'] input[type='submit'], form[action*='extend'] button, input[value*='Run until']")
            
            if renew_button.count() > 0:
                print("Botão de renovação encontrado! Clicando...")
                renew_button.first.click()
                page.wait_for_load_state("networkidle")
                msg = "Botão clicado com sucesso e renovado."
                print(msg)
                with open("renew_result.txt", "w") as f:
                    f.write(f"SUCCESS: {msg}")
            else:
                print("Botão de renovação padrão não encontrado. Tentando XPath alternativo...")
                xpath_btn = page.locator("xpath=/html/body/div[1]/div[2]/div/div[2]/div/div/div[6]/div/div/div/form/input[2]")
                if xpath_btn.count() > 0:
                    xpath_btn.click()
                    page.wait_for_load_state("networkidle")
                    msg = "Botão clicado via XPath e renovado."
                    print(msg)
                    with open("renew_result.txt", "w") as f:
                        f.write(f"SUCCESS: {msg}")
                else:
                    msg = "Não foi possível encontrar o botão de renovação. O site pode já estar renovado ou o layout mudou."
                    print(msg)
                    page.screenshot(path="failure.png")
                    with open("renew_result.txt", "w") as f:
                        f.write(f"WARNING: {msg}")

            # Tira um print final do status do painel
            page.screenshot(path="success_dashboard.png")
            print("Processo finalizado. Print do painel salvo em success_dashboard.png.")

        except Exception as e:
            msg = f"Ocorreu um erro durante a execução: {e}"
            print(msg)
            try:
                page.screenshot(path="failure.png")
            except Exception:
                pass
            with open("renew_result.txt", "w") as f:
                f.write(f"FAILED: {msg}")
            sys.exit(1)
        finally:
            browser.close()


if __name__ == "__main__":
    renew()
