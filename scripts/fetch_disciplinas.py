"""
Fetch and parse UTFPR schedule pages for all courses.
Usage: python3 scripts/fetch_disciplinas.py
"""

import os
import sys
import json
import time
from datetime import datetime, timezone

import requests

MAX_RETRIES = 3
MIN_RESPONSE_SIZE = 5000  # responses under this are likely incomplete
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from scripts.parse_disciplinas import DisciplinaParser, extract_hours_info

DATA_DIR = os.path.join(ROOT_DIR, "data")
DISCIPLINAS_DIR = os.path.join(DATA_DIR, "disciplinas")
COURSE_CONFIG_PATH = os.path.join(
    DATA_DIR,
    "courses.json",
)
ENV_PATH = os.path.join(ROOT_DIR, ".env")
SUPABASE_TABLE = "course_disciplines"

BASE_URL = "https://sistemas2.utfpr.edu.br/dpls/sistema/aluno01/mpListaHorario.pcExibirTurmas"

HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Connection": "keep-alive",
    "Referer": "https://sistemas2.utfpr.edu.br/dpls/sistema/aluno01/mplistahorario.inicioAluno",
    "Sec-Fetch-Dest": "iframe",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
}


def load_env_file(path):
    values = {}
    if not os.path.exists(path):
        return values

    with open(path, encoding="utf-8") as f:
        for line in f:
            raw = line.strip()
            if not raw or raw.startswith("#") or "=" not in raw:
                continue
            key, value = raw.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


ENV_VALUES = load_env_file(ENV_PATH)


def get_env_var(name, required=False):
    value = os.getenv(name) or ENV_VALUES.get(name)
    if required and not value:
        print(f"ERRO: variável {name} não encontrada no ambiente ou no .env")
        sys.exit(1)
    return value


def load_token():
    token = get_env_var("UTFPRSSO", required=False)
    if not token:
        print("Aviso: Token UTFPRSSO não encontrado. Iniciando login headless...")
        from scripts.get_token import get_utfprsso_token, update_env_token
        user = get_env_var("UTFPR_ID", required=True)
        pw = get_env_var("UTFPR_PASSWORD", required=True)
        token = get_utfprsso_token(user, pw)
        update_env_token(ENV_PATH, token)
    return token


def load_supabase_config():
    url = get_env_var("SUPABASE_URL", required=True)
    service_role_key = get_env_var("SUPABASE_SERVICE_ROLE_KEY", required=True)
    return url.rstrip("/"), service_role_key


def load_courses_config():
    try:
        with open(COURSE_CONFIG_PATH, encoding="utf-8") as f:
            courses = json.load(f)
    except FileNotFoundError:
        print(f"ERRO: arquivo de cursos não encontrado: {COURSE_CONFIG_PATH}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"ERRO: JSON inválido em {COURSE_CONFIG_PATH}: {e}")
        sys.exit(1)

    if not isinstance(courses, list):
        print(f"ERRO: {COURSE_CONFIG_PATH} deve conter uma lista de cursos.")
        sys.exit(1)

    normalized = []
    for course in courses:
        if not isinstance(course, dict):
            continue
        slug = str(course.get("id", "")).strip()
        name = str(course.get("label", "")).strip()
        code = str(course.get("utfprCode", "")).strip()
        if not slug or not name or not code:
            continue
        normalized.append((slug, name, code))

    if not normalized:
        print(f"ERRO: nenhum curso válido encontrado em {COURSE_CONFIG_PATH}.")
        print("Cada curso precisa de: id, label, utfprCode.")
        sys.exit(1)

    return normalized


def fetch_html(course_code, token):
    url = f"{BASE_URL}?p_arquivoNomeVc={course_code}"
    headers = {
        **HEADERS,
        "Cookie": f"testcookie=abc; UTFPRSSO={token}; style=null; myFavCards=%5B%5D",
    }

    for attempt in range(1, MAX_RETRIES + 1):
        resp = requests.get(url, headers=headers, timeout=60)

        if resp.status_code in (401, 403):
            print(f"\n  Aviso: Token expirado ou inválido (HTTP {resp.status_code}). Tentando renovar via headless login...")
            from scripts.get_token import get_utfprsso_token, update_env_token
            user = get_env_var("UTFPR_ID", required=True)
            pw = get_env_var("UTFPR_PASSWORD", required=True)
            new_token = get_utfprsso_token(user, pw)
            update_env_token(ENV_PATH, new_token)
            headers["Cookie"] = f"testcookie=abc; UTFPRSSO={new_token}; style=null; myFavCards=%5B%5D"
            token = new_token
            continue

        resp.raise_for_status()
        resp.encoding = "latin-1"

        if len(resp.content) >= MIN_RESPONSE_SIZE:
            return resp.text

        if attempt < MAX_RETRIES:
            print(f"(resposta pequena: {len(resp.content)}B, tentativa {attempt}/{MAX_RETRIES})...", end=" ", flush=True)
            time.sleep(2)

    return resp.text


def parse_html(html_content):
    hours_info = extract_hours_info(html_content)
    parser = DisciplinaParser()
    parser.feed(html_content)
    for disc in parser.disciplines:
        code = disc["codigo"]
        if code in hours_info:
            disc["aulasPresenciais"] = hours_info[code]["presenciais"]
            disc["aulasAssincronas"] = hours_info[code]["assincronas"]
            disc["horasExtensionistas"] = hours_info[code]["extensionistas"]
    return parser.disciplines


def upsert_course_disciplines(supabase_url, service_role_key, slug, name, disciplines):
    endpoint = f"{supabase_url}/rest/v1/{SUPABASE_TABLE}?on_conflict=course_id"
    turmas_count = sum(len(d.get("turmas", [])) for d in disciplines)
    payload = [
        {
            "course_id": slug,
            "course_label": name,
            "disciplines": disciplines,
            "disciplines_count": len(disciplines),
            "turmas_count": turmas_count,
            "source": "utfpr",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ]

    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    response = requests.post(endpoint, headers=headers, json=payload, timeout=60)
    if not response.ok:
        raise RuntimeError(
            f"Falha no upsert do curso {slug} no Supabase (HTTP {response.status_code}): {response.text[:300]}"
        )


def main():
    courses = load_courses_config()
    token = load_token()
    supabase_url, supabase_service_role_key = load_supabase_config()
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(DISCIPLINAS_DIR, exist_ok=True)
    print(f"Token carregado ({len(token)} chars)")
    print(f"Buscando {len(courses)} cursos...\n")

    for slug, name, code in courses:
        print(f"  [{name}] Buscando...", end=" ", flush=True)
        try:
            html = fetch_html(code, token)
            print(f"({len(html):,} bytes)", end=" -> ")

            disciplines = parse_html(html)
            total_turmas = sum(len(d["turmas"]) for d in disciplines)

            output_path = os.path.join(
                DISCIPLINAS_DIR,
                f"{slug}.json",
            )
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(disciplines, f, ensure_ascii=False, indent=2)

            upsert_course_disciplines(
                supabase_url,
                supabase_service_role_key,
                slug,
                name,
                disciplines,
            )

            print(f"{len(disciplines)} disciplinas, {total_turmas} turmas")
        except requests.RequestException as e:
            print(f"ERRO DE REDE: {e}")
        except Exception as e:
            print(f"ERRO DE PARSE: {e}")

    print("\nPronto!")


if __name__ == "__main__":
    main()
