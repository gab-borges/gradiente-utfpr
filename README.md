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

## Cursos disponíveis

- Engenharia de Computação
- Engenharia Elétrica
- Administração
- Design
- Educação Física
- Engenharia Mecatrônica

## Stack

- Frontend: Vite + JavaScript (ES modules)
- Coleta e parse de dados: Python (`requests` + parser HTML)

## Requisitos

- Node.js 18+ (recomendado)
- npm
- Python 3.10+
- pacote Python `requests`

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
│   ├── data.js        # datasets, busca e utilitários
│   └── style.css      # design system e layout responsivo
├── fetch_disciplinas.py   # coleta na UTFPR e gera JSON por curso
├── parse_disciplinas.py   # parser de HTML local -> JSON
├── media/                 # assets de mídia (logo/screenshot)
├── public/                # assets estáticos servidos pelo Vite
├── index.html             # shell da aplicação
└── vite.config.js
```

## Dados das disciplinas

O app consome arquivos `src/disciplinas_*.json`.

### Opção 1: Coletar dados atuais da UTFPR

1. Crie um arquivo `.env` na raiz com:

```dotenv
UTFPRSSO=seu_token_aqui
```

2. Rode:

```bash
python3 fetch_disciplinas.py
```

Esse script gera/atualiza:

- `src/disciplinas_computacao.json`
- `src/disciplinas_eletrica.json`
- `src/disciplinas_administracao.json`
- `src/disciplinas_design.json`
- `src/disciplinas_edfisica.json`
- `src/disciplinas_mecatronica.json`

### Opção 2: Parse de HTML local (amostras)

Se você tiver HTMLs salvos localmente:

```bash
python3 parse_disciplinas.py
```

No estado atual, esse script converte:

- `disciplinas.html` -> `src/disciplinas_computacao.json`
- `disciplinas_eletrica.html` -> `src/disciplinas_eletrica.json`

## Scripts disponíveis

- `npm run dev`: inicia o servidor de desenvolvimento
- `npm run build`: gera build de produção em `dist/`
- `npm run preview`: sobe servidor para validar o build

## Observações

- O favicon usa `public/media/gradiente_logo.jpg`.
- O repositório ignora `src/*.json` e `*.html` no `.gitignore`; se necessário, gere os arquivos localmente.
- Não há suíte de testes automatizados no momento.
