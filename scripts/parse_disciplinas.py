"""
Parse UTFPR disciplinas HTML files into structured JSON files.
Run: python3 scripts/parse_disciplinas.py
"""

import json
import os
import re
from datetime import datetime, timezone
from html.parser import HTMLParser

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
DISCIPLINAS_DIR = os.path.join(DATA_DIR, "disciplinas")
COURSE_CONFIG_PATH = os.path.join(DATA_DIR, "courses.json")
ENV_PATH = os.path.join(PROJECT_ROOT, ".env")
SUPABASE_TABLE = "course_disciplines"


class DisciplinaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.disciplines = []
        self.current_discipline = None
        self.current_cell = -1
        self.cell_data = ""
        self.in_td = False
        self.in_bold = False
        self.td_class = ""
        self.row_cells = []
        self.header_row = False

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "b":
            self.in_bold = True
            self.cell_data = ""
        elif tag == "td":
            self.in_td = True
            self.td_class = attrs_dict.get("class", "")
            self.cell_data = ""
            self.current_cell += 1
        elif tag == "tr":
            self.current_cell = -1
            self.row_cells = []
            self.header_row = False
        elif tag == "br" and self.in_td:
            self.cell_data += "|"

    def handle_endtag(self, tag):
        if tag == "b":
            self.in_bold = False
            text = self.cell_data.strip()
            if " - " in text:
                code, name = text.split(" - ", 1)
                self.current_discipline = {
                    "codigo": code.strip(),
                    "nome": name.strip(),
                    "aulasPresenciais": 0,
                    "aulasAssincronas": 0,
                    "horasExtensionistas": 0,
                    "turmas": [],
                }
                self.disciplines.append(self.current_discipline)
        elif tag == "td":
            self.in_td = False
            if self.td_class not in ("t", "dn") and not self.header_row:
                self.row_cells.append(
                    (self.td_class, self.cell_data.strip().strip("|"))
                )
            if self.td_class == "bl" and self.cell_data.strip() == "Turma":
                self.header_row = True
        elif (
            tag == "tr"
            and not self.header_row
            and self.current_discipline
            and len(self.row_cells) >= 8
        ):
            self._process_turma_row(self.row_cells)

    def handle_data(self, data):
        if self.in_td or self.in_bold:
            self.cell_data += data

    def handle_entityref(self, name):
        if name == "nbsp":
            self.cell_data += " "

    def _process_turma_row(self, cells):
        # cells order: turma, enquadramento, vagasTotal, vagasCalouros, reserva,
        # prioridade, horario, professor, optativa
        try:
            turma_code = cells[0][1].strip()
            if not turma_code or turma_code == "&nbsp;":
                return

            enquadramento = cells[1][1].strip()
            vagas_total = int(cells[2][1].strip()) if cells[2][1].strip().isdigit() else 0
            vagas_calouros = int(cells[3][1].strip()) if cells[3][1].strip().isdigit() else 0
            reserva = cells[4][1].strip()

            prioridades_raw = cells[5][1].strip()
            prioridades = [
                p.strip()
                for p in prioridades_raw.split("|")
                if p.strip() and p.strip() != "&nbsp;"
            ]

            horario_raw = cells[6][1].strip()
            horarios = self._parse_horarios(horario_raw)

            professores_raw = cells[7][1].strip()
            professores = [
                p.strip()
                for p in professores_raw.split("|")
                if p.strip() and p.strip() != "&nbsp;"
            ]

            optativa_raw = cells[8][1].strip() if len(cells) > 8 else "Nao"
            optativa_first = optativa_raw.lower().replace("ã", "a").split("|")[0] if optativa_raw else ""
            optativa = "nao" not in optativa_first if optativa_raw else False

            turma = {
                "turma": turma_code,
                "enquadramento": enquadramento,
                "vagasTotal": vagas_total,
                "vagasCalouros": vagas_calouros,
                "reserva": reserva,
                "prioridades": prioridades,
                "horarios": horarios,
                "professores": professores,
                "optativa": optativa,
            }
            self.current_discipline["turmas"].append(turma)
        except (IndexError, ValueError):
            return

    def _parse_horarios(self, raw):
        """Parse schedule strings like '5M1(CQ-203) - 5M2(CQ-203)'."""
        horarios = []
        clean = re.sub(r"<[^>]+>", "", raw)
        matches = re.findall(r"(\d)([MTN])(\d)(?:\(([^)]*)\))?", clean)
        for dia, turno, aula, sala in matches:
            horarios.append(
                {
                    "dia": int(dia),
                    "turno": turno,
                    "aula": int(aula),
                    "sala": sala.strip() if sala else "",
                }
            )
        return horarios


def extract_hours_info(html_content):
    """Extract weekly hours from discipline headers."""
    pattern = r"<b>([^<]+)</b>\s*&nbsp;\s*&nbsp;\((\d+)\s+Aulas semanais presenciais,\s*(\d+)\s+Aulas semanais ass[^,]+,\s*(\d+)\s+horas semestrais extensionistas\)"
    return {
        match[0].split(" - ")[0].strip(): {
            "presenciais": int(match[1]),
            "assincronas": int(match[2]),
            "extensionistas": int(match[3]),
        }
        for match in re.findall(pattern, html_content)
    }


def parse_file(html_path, output_path):
    """Parse a single HTML file and write JSON output."""
    html_abs_path = html_path if os.path.isabs(html_path) else os.path.join(PROJECT_ROOT, html_path)
    output_abs_path = output_path if os.path.isabs(output_path) else os.path.join(PROJECT_ROOT, output_path)
    os.makedirs(os.path.dirname(output_abs_path), exist_ok=True)

    with open(html_abs_path, encoding="latin-1") as f:
        html = f.read()

    hours_info = extract_hours_info(html)
    parser = DisciplinaParser()
    parser.feed(html)

    for disc in parser.disciplines:
        code = disc["codigo"]
        if code in hours_info:
            disc["aulasPresenciais"] = hours_info[code]["presenciais"]
            disc["aulasAssincronas"] = hours_info[code]["assincronas"]
            disc["horasExtensionistas"] = hours_info[code]["extensionistas"]

    with open(output_abs_path, "w", encoding="utf-8") as f:
        json.dump(parser.disciplines, f, ensure_ascii=False, indent=2)

    total_turmas = sum(len(d["turmas"]) for d in parser.disciplines)
    print(f"✓ {html_path} -> {output_path}: {len(parser.disciplines)} disciplines, {total_turmas} turmas")
    return parser.disciplines


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


def get_env_var(name):
    return os.getenv(name) or ENV_VALUES.get(name)


def load_supabase_config(optional=False):
    url = get_env_var("SUPABASE_URL")
    service_role_key = get_env_var("SUPABASE_SERVICE_ROLE_KEY")
    if optional and (not url or not service_role_key):
        return None, None
    if not url or not service_role_key:
        raise RuntimeError(
            "Variáveis SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente ou .env."
        )
    return url.rstrip("/"), service_role_key


def upsert_course_disciplines(supabase_url, service_role_key, slug, label, disciplines):
    endpoint = f"{supabase_url}/rest/v1/{SUPABASE_TABLE}?on_conflict=course_id"
    turmas_count = sum(len(d.get("turmas", [])) for d in disciplines)
    payload = [
        {
            "course_id": slug,
            "course_label": label,
            "disciplines": disciplines,
            "disciplines_count": len(disciplines),
            "turmas_count": turmas_count,
            "source": "html_sample",
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


def load_courses_config():
    try:
        with open(COURSE_CONFIG_PATH, encoding="utf-8") as f:
            courses = json.load(f)
    except FileNotFoundError:
        print(f"ERRO: arquivo de cursos nao encontrado: {COURSE_CONFIG_PATH}")
        return []
    except json.JSONDecodeError as e:
        print(f"ERRO: JSON invalido em {COURSE_CONFIG_PATH}: {e}")
        return []

    if not isinstance(courses, list):
        print(f"ERRO: {COURSE_CONFIG_PATH} deve conter uma lista de cursos.")
        return []

    return [course for course in courses if isinstance(course, dict)]


def main():
    courses = load_courses_config()
    if not courses:
        return
    os.makedirs(DATA_DIR, exist_ok=True)
    supabase_url, supabase_service_role_key = load_supabase_config(optional=True)
    if supabase_url and supabase_service_role_key:
        print("Supabase detectado: resultados também serão enviados para o banco.")
    else:
        print("Supabase não configurado: gerando apenas JSON local.")

    parsed_any = False
    for course in courses:
        slug = str(course.get("id", "")).strip()
        label = str(course.get("label", "")).strip() or slug
        if not slug:
            continue

        html_path = str(course.get("sampleHtml", "")).strip() or f"disciplinas_{slug}.html"
        output_path = os.path.join("data", "disciplinas", f"{slug}.json")
        html_abs_path = html_path if os.path.isabs(html_path) else os.path.join(PROJECT_ROOT, html_path)

        if not os.path.exists(html_abs_path):
            print(f"- Pulando {slug}: arquivo HTML nao encontrado ({html_path})")
            continue

        disciplines = parse_file(html_path, output_path)
        if supabase_url and supabase_service_role_key:
            upsert_course_disciplines(
                supabase_url,
                supabase_service_role_key,
                slug,
                label,
                disciplines,
            )
            print(f"  ↳ Upsert Supabase concluído para {slug}.")
        parsed_any = True

    if not parsed_any:
        print("Nenhum HTML encontrado para parse.")


if __name__ == "__main__":
    main()
