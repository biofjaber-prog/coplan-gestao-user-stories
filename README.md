# Gestao de User Stories | Coplan

Sistema de gestao do Modulo Fiscalizacao com login, fila de prioridade por sprint e desenvolvedor, cadastros em popup, drag-and-drop, dashboard executivo e exportacao XLSX.

## Acesso

- Login: `coplan`
- Senha: `coplan123`

## Uso

- `index.html`: abre a Gestao de User Stories.
- `Abrir Dashboard`: abre o painel em uma nova aba.
- O menu lateral da Gestao concentra navegacao e o acesso `GitHub / Publicar`, que abre em popup.
- No Dashboard, o topo exibe apenas `Exportar XLSX` e `Sair`.
- `Nova US`: cadastra uma User Story em popup.
- US em `Em desenvolvimento` podem receber data de inicio e fim do desenvolvimento; o Dashboard mostra esse planejamento no card e no backlog.
- No Dashboard, e possivel filtrar por periodo de planejamento usando as datas de inicio/fim do desenvolvimento.
- No Dashboard, as US em `Em desenvolvimento` aparecem primeiro, os demais status ficam no meio e as concluidas ficam no final.
- `Nova Sprint`: cadastra sprint em popup, incluindo cor usada nos graficos.
- Em `Gestao de Sprints`, use `Editar` para alterar nome, inicio, fim, cor e objetivo da sprint. Se renomear uma sprint com US, as US acompanham o novo nome.
- Em `Gestao de Sprints`, os campos de inicio, fim, cor e objetivo tambem continuam editaveis direto na tabela.
- Em `Gestao de Sprints`, use `Excluir` para remover uma sprint vazia criada por engano. Sprints com US vinculadas nao sao excluidas para evitar perda de dados.
- Em `Gestao de Sprints`, use `Fechar` para arquivar a sprint: US com status diferente de `Concluido Homologacao` sao movidas automaticamente para a sprint posterior.
- Se nao houver sprint posterior aberta, o sistema cria automaticamente a proxima sprint numerica para receber essas US.
- Use `Reabrir` para devolver uma sprint fechada ao Roadmap.
- `Novo Dev`: cadastra desenvolvedor em popup.
- Em `Gestao de Desenvolvedores`, clique no card do desenvolvedor para editar nome/cor ou excluir.
- Ao excluir um desenvolvedor, as US dele nao sao apagadas; elas sao movidas para `DEFINIR DESENVOLVEDOR`.
- `GitHub / Publicar`: abre a tela para token, teste de conexao, carregar nuvem e publicar alteracoes.
- `Backups Locais`: lista pontos salvos automaticamente antes de publicar, carregar nuvem, importar JSON, restaurar base ou excluir itens.
- Arraste uma US entre desenvolvedores ou dentro da mesma coluna para recalcular a prioridade automaticamente.
- No Dashboard, o roadmap fica logo abaixo dos indicadores e organiza as sprints em grade sem rolagem horizontal.
- No Dashboard, sprints vazias nao aparecem na visao geral dos graficos/roadmap para evitar espaco em branco; ao filtrar por uma sprint especifica, ela aparece mesmo sem US.
- No Dashboard, `Alertas da Sprint Atual` compara a data de hoje com o fim da sprint aberta atual.
- Faltando 4 dias para o fim da sprint, US em `Em testes` ou `Apresentar e planejar` recebem alerta piscante.
- No ultimo dia da sprint, US em `Em homologacao` tambem recebem alerta piscante.
- Se a sprint estiver perto do fim e a US ainda estiver em `Em desenvolvimento`, o Dashboard tambem exibe alerta de prazo.
- US em `Concluido Homologacao` nao exibem alerta de prazo.
- No Dashboard, a area abaixo de `US por Sprint` traz `Saude por Sprint` e `Sprint x Desenvolvedor` para preencher a leitura executiva.
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

## Protecao contra perda de dados

Esta versao continua funcionando em GitHub Pages com `data/store.json`. Nenhum banco ou hospedagem nova foi adicionada.

Antes de operacoes criticas, o sistema cria backup local automatico no navegador. Para recuperar, abra `GitHub / Publicar` e clique em `Backups Locais`.
