# Gradiente

Aplicação web para montar grade de horários da UTFPR, com busca de disciplinas, seleção de turmas e visualização de conflitos.

## Preview

![Screenshot do Gradiente](./media/gradiente_screenshot.png)

## Funcionalidades

- Busca de disciplinas por código, nome e professor.
- Abas por curso com troca rápida.
- Seleção de uma turma por disciplina.
- Visualização de conflitos de horário na lista e na grade.
- Preview na grade ao passar o mouse sobre uma turma na sidebar.
- Navegação por teclado na busca/lista e nas abas de cursos.
- Tema claro/escuro com persistência.
- Persistência local do estado da sessão (`localStorage`):
  - curso ativo
  - texto da busca
  - turmas selecionadas
- Configuração centralizada de cursos em `data/courses.json` (frontend + scripts Python).

## Cursos disponíveis

- Engenharia de Computação
- Engenharia Elétrica
- Administração
- Design
- Educação Física
- Engenharia Mecatrônica
- Sistemas de Informação

## Stack

- Frontend: Vite + JavaScript (ES modules)
- Banco de dados: Supabase Postgres (via REST API)
- Coleta e parse de dados: Python (`requests` + parser HTML)

## Requisitos

- Node.js 18+ (recomendado)
- npm
- Python 3.10+
- pacote Python `requests`
- Projeto Supabase com tabela `public.course_disciplines`

## Instalação

```bash
npm install
python3 -m pip install requests
```

## Rodando em desenvolvimento

```bash
npm run dev
```

Servidor padrão: `http://localhost:5173`

## Build de produção

```bash
npm run build
npm run preview
```

## Atalhos de teclado

- `/`: foca a busca.
- `Esc` (na busca): limpa o texto.
- `↑/↓`: navega entre disciplinas/turmas na sidebar (com foco na busca).
- `→/←`: expande/colapsa disciplina e navega entre disciplina/turma.
- `Enter`: seleciona/aciona item ativo da sidebar.
- `Ctrl + ←/→` (na busca): troca de curso.
- `←/→` com foco nas tabs de curso: navega entre cursos.

## Estrutura principal

```text
.
├── src/
│   ├── main.js        # estado global, persistência e orquestração da UI
│   ├── sidebar.js     # tabs, busca, lista, navegação por teclado
│   ├── grid.js        # grade semanal, conflitos e preview por hover
│   ├── data.js        # loader Supabase, busca e utilitários
│   └── style.css      # design system e layout responsivo
├── data/
│   ├── courses.json       # catálogo de cursos (id, label, utfprCode, sampleHtml opcional)
│   └── disciplinas_*.json # snapshots locais (debug/backup)
├── scripts/
│   └── parse_disciplinas.py # parser de HTML local -> JSON
├── fetch_disciplinas.py   # coleta na UTFPR e faz upsert no Supabase
├── sql/
│   └── create_course_disciplines.sql # schema + políticas
├── media/                 # assets de mídia (logo/screenshot)
├── public/                # assets estáticos servidos pelo Vite
├── index.html             # shell da aplicação
└── vite.config.js
```

## Dados das disciplinas (Supabase)

O app consome dados da tabela `public.course_disciplines` no Supabase.

### 1) Criar a tabela

No SQL Editor do Supabase, execute:

```sql
-- cole aqui o conteúdo de:
-- sql/create_course_disciplines.sql
```

ou cole o conteúdo de `sql/create_course_disciplines.sql`.

### 2) Variáveis de ambiente

Defina no `.env` da raiz:

```dotenv
# frontend (lidas no browser via Vite)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# scripts python (upload no banco)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# coleta UTFPR
UTFPRSSO=...
```

### 3) Como adicionar um curso sem mexer no codigo

Edite apenas `data/courses.json` e adicione um item com:

- `id`: identificador do curso (chave usada em `course_id`)
- `label`: nome exibido na aba do frontend
- `utfprCode`: código usado na URL da UTFPR
- `sampleHtml` (opcional): nome do HTML local para `scripts/parse_disciplinas.py`

Exemplo:

```json
{
  "id": "mecanica",
  "label": "Eng. Mecanica",
  "utfprCode": "SEU_CODIGO_AQUI",
  "sampleHtml": "disciplinas_mecanica.html"
}
```

### 4) Popular o banco com dados atuais da UTFPR

```bash
python3 fetch_disciplinas.py
```

Esse script:

- lê `data/courses.json`
- busca e faz parse dos horários da UTFPR
- faz upsert em `public.course_disciplines` por `course_id`
- mantém snapshot local em `data/disciplinas_<id>.json`

### 5) Parse de HTML local (amostras) + upload opcional

```bash
python3 scripts/parse_disciplinas.py
```

Esse script converte `sampleHtml` (ou `disciplinas_<id>.html`) e:

- sempre gera `data/disciplinas_<id>.json`
- envia para Supabase quando `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estiverem definidos

## Scripts disponíveis

- `npm run dev`: inicia o servidor de desenvolvimento
- `npm run build`: gera build de produção em `dist/`
- `npm run preview`: sobe servidor para validar o build

## Observações

- O favicon usa `public/media/gradiente_logo.jpg`.
- O repositório ignora `data/disciplinas_*.json` e `*.html`; os snapshots são locais.
- Não há suíte de testes automatizados no momento.
