"""
Parse disciplinas.html from UTFPR into a structured JSON file.
Run once: python3 parse_disciplinas.py
"""

import re
import json
from html.parser import HTMLParser


class DisciplinaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.disciplines = []
        self.current_discipline = None
        self.current_turma = None
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
        elif tag == "br":
            if self.in_td:
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
            if self.td_class == "bl":
                content = self.cell_data.strip()
                if content == "Turma":
                    self.header_row = True
        elif tag == "tr":
            if (
                not self.header_row
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
        #              prioridade, horario, professor, optativa
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

            optativa_raw = cells[8][1].strip() if len(cells) > 8 else "Não"
            optativa = "não" not in optativa_raw.lower().split("|")[0] if optativa_raw else False

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
        except (IndexError, ValueError) as e:
            pass

    def _parse_horarios(self, raw):
        """Parse schedule strings like '5M1(CQ-203) - 5M2(CQ-203)'"""
        horarios = []
        # Clean HTML tags from the raw string
        clean = re.sub(r"<[^>]+>", "", raw)
        # Match patterns like 5M1(CQ-203) or 5M1
        matches = re.findall(r"(\d)([MTN])(\d)(?:\(([^)]*)\))?", clean)
        for dia, turno, aula, sala in matches:
            h = {
                "dia": int(dia),
                "turno": turno,
                "aula": int(aula),
                "sala": sala.strip() if sala else "",
            }
            horarios.append(h)
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
    with open(html_path, encoding="latin-1") as f:
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

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(parser.disciplines, f, ensure_ascii=False, indent=2)

    total_turmas = sum(len(d["turmas"]) for d in parser.disciplines)
    print(f"✓ {html_path} → {output_path}: {len(parser.disciplines)} disciplines, {total_turmas} turmas")

    for d in parser.disciplines[:2]:
        print(f"  {d['codigo']} - {d['nome']} ({d['aulasPresenciais']}h)")


def main():
    courses = [
        ("disciplinas.html", "src/disciplinas_computacao.json"),
        ("disciplinas_eletrica.html", "src/disciplinas_eletrica.json"),
    ]
    for html_path, output_path in courses:
        parse_file(html_path, output_path)


if __name__ == "__main__":
    main()
