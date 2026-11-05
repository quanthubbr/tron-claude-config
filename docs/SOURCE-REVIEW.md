# Revisão semanal de fontes

A action `source-review.yml` roda às segundas, 06:00 UTC, e por `workflow_dispatch`. Ela compara o pin de cada fonte com o HEAD, revisa necessidade e viabilidade por agente e prepara propostas pequenas de implementação local. Atualização da fonte não é requisito de paridade: adotar exige benefício concreto para a interpretação simplificada do Exonous.

O job tem `contents: read`, checkout sem credenciais persistidas e nenhum passo de execução de scripts recebidos. Ele não implementa ports, abre PRs, altera pins ou faz merge. A saída é o artefato `source-port-preparation`, retido por 14 dias, com `summary.md` e `port-manifest.json`.

## Configuração privada

Configure os seguintes **GitHub Actions repository secrets**, nunca variáveis públicas. Cada URL deve usar HTTPS, host exato `github.com`, dois componentes de caminho, sem credenciais, porta, query ou fragmento. O sufixo `.git` é opcional. O runner não usa credenciais Git para acessar fontes privadas.

| ID local | Secret da URL |
| --- | --- |
| techne | EXONOUS_SOURCE_01_URL |
| ui-motion | EXONOUS_SOURCE_02_URL |
| ui-design-styles | EXONOUS_SOURCE_03_URL |
| ui-design | EXONOUS_SOURCE_04_URL |
| nomos-principles | EXONOUS_SOURCE_05_URL |
| nomos-terse | EXONOUS_SOURCE_06_URL |
| praxis | EXONOUS_SOURCE_07_URL |
| deliver-engine | EXONOUS_SOURCE_08_URL |
| deliver-ideas | EXONOUS_SOURCE_09_URL |
| project-memory-ideas | EXONOUS_SOURCE_10_URL |
| atlas | EXONOUS_SOURCE_11_URL |
| biblos | EXONOUS_SOURCE_12_URL |
| browser | EXONOUS_SOURCE_13_URL |
| metis | EXONOUS_SOURCE_14_URL |
| sophia | EXONOUS_SOURCE_15_URL |

`EXONOUS_SOURCE_14_SCOPE_JSON` e `EXONOUS_SOURCE_15_SCOPE_JSON` contêm arrays JSON privados com os padrões de caminho observados. Não publique esses valores. Os demais escopos e mapas locais existentes continuam em `maintainer/pege/sources.json`. Os novos registros são baselines de observação, com `status: review-pending`; registrar um baseline não declara port concluído ou aceito.

Configure também `EXONOUS_REVIEW_API_KEY`, `EXONOUS_REVIEW_MODEL` e `EXONOUS_REVIEW_BASE_URL`. Eles podem reutilizar a credencial, o modelo e o endpoint Responses do gateway já configurado nos clientes locais. Transfira a credencial do armazenamento seguro diretamente para o secret; nunca a copie para chat, logs ou arquivos versionados. A URL base deve usar HTTPS, sem credenciais, query ou fragmento; informe o prefixo da API, pois o runner acrescenta `/responses`. Redirecionamentos HTTP são recusados. O modelo deve suportar a Responses API com Structured Outputs no formato JSON Schema estrito; aliases com `/` são aceitos. Não há endpoint ou modelo padrão nem revisão simulada de fallback. Ausência de configuração, recusa do modelo, resposta incompleta, histórico divergente ou formato inválido interrompem o job antes de publicar artefatos.

O workflow usa `ubuntu-latest` hospedado pelo GitHub, com conexão VPN OpenVPN antes da revisão. Configure `EXONOUS_REVIEW_VPN_PROFILE` com o perfil `.ovpn` e certificados/chaves inline. Se exigir autenticação, configure `EXONOUS_REVIEW_VPN_AUTH` com usuário e senha em duas linhas. Não publique os valores. O cliente é instalado pelo gerenciador de pacotes do runner; as três actions estão fixadas por SHA completo.

O perfil não pode executar hooks, carregar plugins, incluir outros arquivos ou apontar credenciais para caminhos externos. O processo inicia com o privilégio necessário para criar interface e rotas e depois passa para `nobody`. Perfil, autenticação, PID e log ficam em diretório privado no temporário do runner, com permissões `0700` no diretório e `0600` nos arquivos. Nenhum desses arquivos entra no artefato ou nos logs públicos. O runner aguarda a inicialização do túnel e faz uma requisição HTTPS anônima limitada a `/models` do gateway, aceitando sucesso ou `401`; não envia a chave de revisão nesse teste e não segue redirects. Túnel ou gateway indisponível interrompe a execução antes do passo com chave de revisão.

A limpeza usa `always()`: valida o PID e os argumentos do processo criado pelo job antes de encerrá-lo e remove os arquivos privados. Não encerra outras conexões VPN. O perfil deve fornecer rotas suficientes e um nome de gateway já resolvível pelo runner; scripts de alteração de DNS não são executados. Uma VPN que dependa desses scripts exige um perfil compatível antes da execução real.

## Evidência e decisão

Cada escopo recebe um identificador estável por posição no registro: `map-001`, `watch-001` ou `discovery-001`. O manifesto registra baseline, candidato, quantidade de commits, arquivos alterados, linhas adicionadas/removidas e arquivos binários por escopo. Escopos podem se sobrepor; seus números não devem ser somados como total único. Commits desfeitos podem gerar escopo com commits e sem diferença final. Escopos de descoberta indicam mudanças no diretório, não uma lista confirmada de novos itens adotáveis.

O agente recebe, em memória do runner, um diff limitado por escopo e amostras dos arquivos locais relevantes. Esses dados são enviados ao endpoint Responses configurado para a revisão, com `store: false`, sem ferramentas. São dados não confiáveis: as instruções do revisor proíbem seguir comandos ou instruções embutidos no conteúdo. O contexto é limitado a 8.000 caracteres de diff por escopo e 64.000 por fonte, além de até 16 amostras locais. Contexto truncado ou ausência de evidência local impede `adopt`; fontes sem licença verificada também não podem ser adotadas.

A decisão de cada escopo alterado persiste como `adopt`, `defer` ou `reject`, com códigos de justificativa, aderência local, evidência e risco. Exemplos de justificativa são `already-covered`, `outside-local-purpose`, `simplification-conflict`, `compatibility-fix`, `insufficient-evidence` e `license-review-required`. O código valida IDs, cardinalidade e todos os enums depois da resposta; texto livre do modelo não entra no relatório.

Somente `adopt` gera um plano de implementação com alvo local, etapas escolhidas pelo revisor e critérios de aceitação. O plano exige teste de regressão, mudança local mínima, verificações relevantes, revisão de licença e avaliação humana antes de aceitar o pin. `defer` e `reject` mantêm justificativa e risco, sem plano de implementação. A decisão do agente é uma proposta sujeita à revisão; ela não autoriza execução ou aceitação automática.

## Revisão e port local

1. Leia as decisões e encontre o escopo simbólico no registro privado correspondente.
2. Inspecione a alteração original em ambiente privado e confirme a necessidade local.
3. Implemente uma interpretação própria, com a menor mudança verificável. Preserve licenças e avisos obrigatórios.
4. Execute os testes afetados e `npm run pege:originality -- <id>` com a URL secreta disponível no ambiente.
5. Depois da revisão e das verificações, aceite explicitamente o candidato: `npm run pege:watch -- --accept <id> --ref <sha>`.

Para gerar a revisão local, use `node maintainer/pege/source-review.js --output /private/tmp/source-review` com os secrets disponíveis no ambiente. `npm run pege:watch -- --json <id>` usa o mesmo revisor e contrato sanitizado. Não coloque valores secretos na linha de comando ou em arquivos versionados. Os comandos falham com mensagens simbólicas; stderr/stdout de subprocessos Git não são propagados.

## Limites de privacidade

Relatórios não incluem URLs das fontes, nomes de caminhos originais, mensagens de commit, texto de diff, amostras locais ou respostas brutas do modelo. Erros também não incluem esses valores. O artefato contém somente IDs locais, alvos locais do registro, hashes, contagens e decisões validadas. Não há patch bruto publicado.

O serviço de revisão recebe o contexto privado descrito acima; `store: false` não significa execução local nem altera políticas de retenção do provedor. O runner guarda os repositórios temporariamente no cache local, cujo `origin` contém a URL. Esse cache não é publicado pelo workflow. Use runners efêmeros e não adicione o cache aos artefatos.

A troca de URLs por secrets não remove dados do histórico Git, de registros antigos, de caches existentes ou de arquivos de licença e proveniência obrigatórios. Remover esses registros exige trabalho separado; nunca apague avisos obrigatórios para esconder atribuição. O CI de release recebe os secrets de URL somente no passo de pré-release, dentro do job limitado a push em `main`; testes de PR não os recebem.

## Verificação

Nesta configuração, os 15 secrets de URL, os dois escopos privados, a credencial/modelo/endpoint do revisor e os dois secrets da VPN estão cadastrados. O gateway passou por um teste sintético Responses com saída estruturada. O importador do perfil foi executado pelo usuário com sucesso e o validador aceita as diretivas operacionais seguras do cliente existente. Nenhum valor é registrado nesta documentação. A primeira execução no runner hospedado ainda precisa validar túnel, autenticação e alcance do gateway após a publicação do workflow.

`node --test test/source-review.test.js` cria repositórios Git locais e usa um transporte de revisão injetado. Os testes provam compilação de diferenças reais, histórico divergente, falha por segredo ausente ou inválido, redação de erros e rejeição de respostas que não cumprem o contrato. Nenhuma fonte remota ou API é chamada pelos testes. A execução real exige configuração dos secrets e um modelo compatível.
