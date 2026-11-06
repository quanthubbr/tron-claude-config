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

O workflow usa `ubuntu-latest`, instala Claude Code na versão fixa `2.1.318` e seleciona `EXONOUS_REVIEW_BACKEND=claude` com `EXONOUS_REVIEW_MODEL=sonnet`. Configure o secret `CLAUDE_CODE_OAUTH_TOKEN` com o token de assinatura Pro/Max gerado por `claude setup-token`. Transfira o valor diretamente para GitHub Secrets, sem colocá-lo em chat, linha de comando ou arquivo versionado. O token só é disponibilizado ao passo de compilação. A revisão usa a assinatura e seus limites; não há fallback para API com cobrança por saldo. O job não instala nem conecta VPN e não usa os secrets antigos do gateway. As três actions continuam fixadas por SHA completo.

O revisor executa Claude em processo separado, com diretório de trabalho, HOME e configuração temporários e privados. `--safe-mode`, ferramentas desabilitadas, MCP vazio, comandos desabilitados e ausência de persistência isolam a chamada de hooks, plugins e configurações locais. O processo recebe somente o token OAuth e variáveis necessárias à execução; chaves de API, URLs das fontes, credenciais GitHub e configuração do gateway não são herdadas. O contexto segue por stdin, e stdout/stderr ficam capturados em memória. O limite é de 180 segundos e 256 KiB combinados de saída por fonte; falha ou resposta inválida interrompe a revisão, sem publicar saída bruta. O diretório privado é removido ao encerrar a chamada.

O backend Responses continua disponível para uso local e rollback: omita `EXONOUS_REVIEW_BACKEND` ou defina `responses`, configure `EXONOUS_REVIEW_API_KEY`, `EXONOUS_REVIEW_MODEL` e `EXONOUS_REVIEW_BASE_URL`, e providencie conectividade ao gateway. A URL base deve usar HTTPS, sem credenciais, query ou fragmento; informe o prefixo da API, pois o revisor acrescenta `/responses`. Redirecionamentos são recusados e o modelo deve suportar Structured Outputs com JSON Schema estrito. A escolha de backend é explícita, sem troca automática após erro. Secrets anteriores são preservados; restaurar o workflow anterior também exige restaurar seus passos de rede.

## Evidência e decisão

Cada escopo recebe um identificador estável por posição no registro: `map-001`, `watch-001` ou `discovery-001`. O manifesto registra baseline, candidato, quantidade de commits, arquivos alterados, linhas adicionadas/removidas e arquivos binários por escopo. Escopos podem se sobrepor; seus números não devem ser somados como total único. Commits desfeitos podem gerar escopo com commits e sem diferença final. Escopos de descoberta indicam mudanças no diretório, não uma lista confirmada de novos itens adotáveis.

O agente recebe, em memória do runner, um diff limitado por escopo e amostras dos arquivos locais relevantes. No workflow, esses dados são enviados à Anthropic por Claude Code; no backend Responses, seguem para o endpoint configurado com `store: false`. Ambos executam sem ferramentas e usam o mesmo contrato de decisão. São dados não confiáveis: as instruções do revisor proíbem seguir comandos ou instruções embutidos no conteúdo. O contexto é limitado a 8.000 caracteres de diff por escopo e 64.000 por fonte, além de até 16 amostras locais. Contexto truncado ou ausência de evidência local impede `adopt`; fontes sem licença verificada também não podem ser adotadas.

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

O serviço de revisão recebe o contexto privado descrito acima. Ausência de persistência local no Claude e `store: false` no backend Responses não significam execução local nem alteram políticas de retenção do provedor. O runner guarda os repositórios temporariamente no cache local, cujo `origin` contém a URL. Esse cache não é publicado pelo workflow. Use runners efêmeros e não adicione o cache aos artefatos.

A troca de URLs por secrets não remove dados do histórico Git, de registros antigos, de caches existentes ou de arquivos de licença e proveniência obrigatórios. Remover esses registros exige trabalho separado; nunca apague avisos obrigatórios para esconder atribuição. O CI de release recebe os secrets de URL somente no passo de pré-release, dentro do job limitado a push em `main`; testes de PR não os recebem.

## Verificação

O token de assinatura foi validado com uma chamada sintética que retornou saída estruturada, e `CLAUDE_CODE_OAUTH_TOKEN` foi cadastrado no GitHub. Os secrets de fontes e escopos existentes continuam em uso. Nenhum valor é registrado nesta documentação. A execução completa no runner hospedado depende da publicação do workflow atualizado; testes locais não comprovam esse resultado.

`node --test test/source-review.test.js` cria repositórios Git locais, usa um transporte Responses injetado e um executável Claude de teste. Os testes provam compilação de diferenças reais, isolamento do processo, timeout, limite de saída, histórico divergente, falha por segredo ausente ou inválido, redação de erros e rejeição de respostas que não cumprem o contrato. Nenhuma fonte remota ou API é chamada pelos testes. A execução real exige configuração dos secrets e um modelo compatível.
