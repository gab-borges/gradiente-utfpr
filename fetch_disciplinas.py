"""
Fetch and parse UTFPR schedule pages for all courses.
Usage: python3 fetch_disciplinas.py
"""

import os
import sys
import json
import time

import requests

from parse_disciplinas import DisciplinaParser, extract_hours_info

MAX_RETRIES = 3
MIN_RESPONSE_SIZE = 5000  # responses under this are likely incomplete

COURSES = [
    ("computacao", "Eng. Computação", "24E94D0948FFF26325BC0F8134D01085"),
    ("eletrica", "Eng. Elétrica", "7EBF66F10F6A806CC41F8317125C5F2F"),
    ("administracao", "Administração", "ACB4A522B0C83D8A2A55DED21174B3E5"),
    ("design", "Design", "B2E16FAF8EDA193BDEE36592C5318E0D"),
    ("edfisica", "Educação Física", "91CCF7FF29FAD9C536E53A3EA82A7918"),
]

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


def load_token():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("UTFPRSSO="):
                return line.split("=", 1)[1]
    print("ERRO: UTFPRSSO não encontrado no .env")
    sys.exit(1)


def fetch_html(course_code, token):
    url = f"{BASE_URL}?p_arquivoNomeVc={course_code}"
    headers = {
        **HEADERS,
        "Cookie": f"testcookie=abc; UTFPRSSO={token}; style=null; myFavCards=%5B%5D",
    }

    for attempt in range(1, MAX_RETRIES + 1):
        resp = requests.get(url, headers=headers, timeout=60)

        if resp.status_code in (401, 403):
            print(f"\n  ERRO: Token expirado ou inválido (HTTP {resp.status_code}).")
            print("  Pegue um novo token da sessão do navegador e atualize o .env.")
            sys.exit(1)

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


def main():
    token = load_token()
    print(f"Token carregado ({len(token)} chars)")
    print(f"Buscando {len(COURSES)} cursos...\n")

    for slug, name, code in COURSES:
        print(f"  [{name}] Buscando...", end=" ", flush=True)
        try:
            html = fetch_html(code, token)
            print(f"({len(html):,} bytes)", end=" -> ")

            disciplines = parse_html(html)
            total_turmas = sum(len(d["turmas"]) for d in disciplines)

            output_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "src",
                f"disciplinas_{slug}.json",
            )
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(disciplines, f, ensure_ascii=False, indent=2)

            print(f"{len(disciplines)} disciplinas, {total_turmas} turmas")
        except requests.RequestException as e:
            print(f"ERRO DE REDE: {e}")
        except Exception as e:
            print(f"ERRO DE PARSE: {e}")

    print("\nPronto!")


if __name__ == "__main__":
    main()
