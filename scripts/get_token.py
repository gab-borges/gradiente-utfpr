import os
import time
from playwright.sync_api import sync_playwright

def get_utfprsso_token(username, password):
    if not username or not password:
        raise ValueError("Username or password not provided")
        
    print(f"Iniciando login via headless browser para o usuário: {username}")
    
    with sync_playwright() as p:
        # Utilize chromium headless
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        # Acessa a página de login
        login_url = "https://sistemas2.utfpr.edu.br/login?returnUrl=%2Fdpls%2Fsistema%2Faluno01%2Fmpmenu.inicio"
        page.goto(login_url)
        
        # Espera a aplicação Angular carregar
        page.wait_for_selector('input[type="text"]', timeout=15000)
        
        # Tenta preencher login e senha
        # Geralmente há apenas um input text (login) e um password
        page.locator('input[type="text"]').first.fill(username)
        page.locator('input[type="password"]').first.fill(password)
        
        # Clica no botão de acessar (geralmente tem texto Acessar, Entrar, ou type=submit)
        # Vamos tentar pressionar Enter no password field
        page.locator('input[type="password"]').first.press("Enter")
        
        print("Aguardando redirecionamento após o login...")
        
        # Espera a navegação ou aparecimento de algum elemento pós login
        try:
            page.wait_for_url("**/dpls/sistema/aluno01/mpmenu.inicio**", timeout=15000)
        except Exception as e:
            print("Aviso: Timeout aguardando redirecionamento. Verificando cookies mesmo assim.")
            
        # Extrai os cookies
        cookies = context.cookies()
        
        utfprsso = None
        for cookie in cookies:
            if cookie['name'] == 'UTFPRSSO':
                utfprsso = cookie['value']
                break
                
        browser.close()
        
        if utfprsso:
            print("Cookie UTFPRSSO obtido com sucesso.")
            return utfprsso
        else:
            raise RuntimeError("Falha ao obter o cookie UTFPRSSO. Verifique suas credenciais.")

def update_env_token(env_path, new_token):
    if not os.path.exists(env_path):
        return
        
    with open(env_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    updated = False
    for i, line in enumerate(lines):
        if line.startswith("UTFPRSSO="):
            lines[i] = f"UTFPRSSO={new_token}\n"
            updated = True
            break
            
    if not updated:
        lines.append(f"UTFPRSSO={new_token}\n")
        
    with open(env_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Arquivo .env atualizado com o novo token.")

if __name__ == "__main__":
    # Teste local
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    env_values = {}
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                raw = line.strip()
                if not raw or raw.startswith("#") or "=" not in raw:
                    continue
                k, v = raw.split("=", 1)
                env_values[k.strip()] = v.strip().strip('"').strip("'")
                
    user = os.getenv("UTFPR_ID") or env_values.get("UTFPR_ID")
    pw = os.getenv("UTFPR_PASSWORD") or env_values.get("UTFPR_PASSWORD")
    
    if user and pw:
        token = get_utfprsso_token(user, pw)
        print("Novo token:", token)
        update_env_token(env_path, token)
    else:
        print("Credenciais UTFPR_ID ou UTFPR_PASSWORD nao encontradas no .env")
