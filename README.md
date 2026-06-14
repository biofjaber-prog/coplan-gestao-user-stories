# Gestao de User Stories | Coplan

Sistema de gestao do Modulo Fiscalizacao com login, fila de prioridade por sprint e desenvolvedor, cadastros em popup, drag-and-drop, dashboard executivo e exportacao XLSX.

## Acesso

- Login: `coplan`
- Senha: `coplan123`

## Uso

- `index.html`: abre a Gestao de User Stories.
- `Abrir Dashboard`: abre o painel em uma nova aba.
- `Nova US`: cadastra uma User Story em popup.
- `Nova Sprint`: cadastra sprint em popup, incluindo cor usada nos graficos.
- `Novo Dev`: cadastra desenvolvedor em popup.
- Arraste uma US entre desenvolvedores ou dentro da mesma coluna para recalcular a prioridade automaticamente.
- No Dashboard, o roadmap mostra as sprints lado a lado com rolagem horizontal.
- No Dashboard, o Backlog Completo mostra 10 registros por pagina.
- No Dashboard, clicar em uma US abre apenas consulta em modo leitura.
- `Exportar XLSX`: baixa o backlog filtrado com colunas estruturadas.

## Arquivos principais

- `index.html`: sistema de gestao.
- `dashboard.html`: dashboard.
- `assets/data.js`: base inicial.
- `assets/app.js`: login, dados, gestao, drag-and-drop, paginacao, graficos e exportacao.
- `assets/styles.css`: layout, identidade visual e fundos modernos.
