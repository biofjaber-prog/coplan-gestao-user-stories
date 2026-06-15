# Gestao de User Stories | Coplan

Sistema de gestao do Modulo Fiscalizacao com login, fila de prioridade por sprint e desenvolvedor, cadastros em popup, drag-and-drop, dashboard executivo e exportacao XLSX.

## Acesso

- Login: `coplan`
- Senha: `coplan123`

## Uso

- `index.html`: abre a Gestao de User Stories.
- `Abrir Dashboard`: abre o painel em uma nova aba.
- O menu lateral da Gestao concentra navegacao e o acesso `GitHub / Publicar`.
- No Dashboard, o topo exibe apenas `Exportar XLSX` e `Sair`.
- `Nova US`: cadastra uma User Story em popup.
- `Nova Sprint`: cadastra sprint em popup, incluindo cor usada nos graficos.
- `Novo Dev`: cadastra desenvolvedor em popup.
- Em `Gestao de Desenvolvedores`, edite nome e cor do desenvolvedor; o novo nome atualiza todas as US vinculadas.
- `GitHub / Publicar`: abre a tela para token, teste de conexao, carregar nuvem e publicar alteracoes.
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

## Sincronizacao via GitHub JSON

1. No GitHub, crie um Fine-grained personal access token.
2. Restrinja o token ao repositorio `coplan-gestao-user-stories`.
3. Em Repository permissions, libere `Contents` como `Read and write`.
4. No sistema, clique em `Configurar Nuvem`.
5. Use:
   - Owner: `biofjaber-prog`
   - Repositorio: `coplan-gestao-user-stories`
   - Branch: `main`
   - Arquivo JSON: `data/store.json`
6. Cole o token e salve.
7. Clique em `Salvar Nuvem` depois de alterar dados.

O token nao fica no codigo do site. Ele fica somente no navegador onde foi configurado.
