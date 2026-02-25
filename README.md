# Gradiente

Aplicação web para montar grade de horários da UTFPR, com busca de disciplinas, seleção de turmas e visualização de conflitos.

## Stack

- Frontend: Vite + JavaScript (ES modules)
- Ingestão de dados: Python (`requests` + parser HTML customizado)

## Requisitos

- Node.js 18+ (recomendado)
- npm
- Python 3.10+
- `requests` para os scripts Python

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

## Estrutura principal

```text
.
├── src/
│   ├── main.js        # estado global e orquestração da UI
│   ├── sidebar.js     # abas de cursos, busca e lista de turmas
│   ├── grid.js        # renderização da grade semanal e conflitos
│   ├── data.js        # datasets, busca e utilitários de horário/cor
│   └── style.css      # design system e layout responsivo
├── fetch_disciplinas.py   # coleta HTML da UTFPR e gera JSONs por curso
├── parse_disciplinas.py   # parser de HTML -> JSON estruturado
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

Isso gera/atualiza os arquivos:

- `src/disciplinas_computacao.json`
- `src/disciplinas_eletrica.json`
- `src/disciplinas_administracao.json`
- `src/disciplinas_design.json`
- `src/disciplinas_edfisica.json`

### Opção 2: Parse de HTML local (amostras)

Se você tiver os arquivos HTML salvos localmente:

```bash
python3 parse_disciplinas.py
```

No estado atual, esse script converte:

- `disciplinas.html` -> `src/disciplinas_computacao.json`
- `disciplinas_eletrica.html` -> `src/disciplinas_eletrica.json`

## Fluxo funcional (resumo)

1. Usuário busca disciplina na sidebar.
2. Seleciona uma turma por disciplina.
3. A grade semanal é renderizada com cores por disciplina.
4. Conflitos de horário aparecem visualmente na grade e na lista.
5. Tema claro/escuro é persistido em `localStorage`.

## Scripts disponíveis

- `npm run dev` - inicia o servidor de desenvolvimento
- `npm run build` - gera build de produção em `dist/`
- `npm run preview` - sobe servidor para validar o build

## Observações

- O repositório atual ignora `src/*.json` e `*.html` no `.gitignore`, então esses artefatos podem precisar ser gerados localmente antes de rodar.
- Não há suíte de testes automatizados no momento.
