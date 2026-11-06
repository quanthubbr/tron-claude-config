# Decisão sobre a leva de fontes de 2026-11-06

Decisão: adotar correções pequenas com benefício local demonstrável. Rejeitar a importação integral dos novos motores, catálogos e workflows. A análise original abaixo registra a seleção para implementação. O estado da entrega está na seção seguinte; os pins das fontes permanecem inalterados.

## Estado da entrega

- [PR #69](https://github.com/zaqueu-1/exonous/pull/69), versão 2.10.5: guard de todos os destinos de edições em lote, extensões adicionais, associação exata de diagnósticos, pipelines com consumo integral e propriedade de buffers Go. Merge concluído após CI multiplataforma verde; 577 testes Node passaram localmente.
- [PR #70](https://github.com/zaqueu-1/exonous/pull/70), versão 2.10.6: integridade do engine 0.1.5 em todos os launchers automáticos, com manifesto fixado, staging privado e override explícito. 591 testes Node e 136 Rust, fmt e Clippy completos passaram localmente. Merge concluído após CI multiplataforma verde, incluindo os launchers e seletores Windows, WSL e instalações npm.
- Esta unidade documental aplica as orientações selecionadas de UI e motion nas referências existentes: desempenho condicionado à versão e ao perfil, interrupções, gestos, texto, crítica nativa, assets e limites da aprovação de hooks.

O relatório dos 56 escopos permanece como registro da análise inicial. As implementações selecionadas não importam escopos inteiros nem resolvem as perguntas dos itens adiados.

## Base da análise

Artefatos recebidos: `port-manifest.json` e `summary.md`, gerados em `2026-11-06T05:54:06.746Z`. São 15 fontes e 56 escopos: 2 propostas `adopt`, 16 `reject` e 38 `defer`. Os 15 baselines coincidem com o registro local. IDs, decisões e tarefas são consistentes entre si.

Os documentos foram identificados pelo instante de geração acima e tiveram seus SHA-256 calculados durante a análise.

Inspeção dirigida comparou os pares exatos de commits, consultou os alvos locais e reproduziu lacunas selecionadas. Catálogos, binários e todos os arquivos de descobertas amplas não foram auditados integralmente. Nas linhas marcadas como provisórias, a rejeição preparada não foi revalidada no delta específico.

## O que portar, em ordem

| Prioridade | Unidade de implementação | Origem da oportunidade | Decisão e limite |
| --- | --- | --- | --- |
| P0 | Guard de configurações | techne/map-077 | Examinar todos os destinos de edições em lote e reconhecer extensões adicionais de configurações protegidas. Lacuna reproduzida. |
| P0 | Integridade dos lançadores de UI | seleção de ui-design/watch-001 | Validar cache e versão antes da execução, com referência de integridade fixada em manifesto local. Implementação própria e verificação separada; sem atualizar o engine junto. |
| P1 | Pipelines de verificação | parte de techne/map-055 | Consumir a saída inteira ao limitar sua exibição, preservando o resultado do produtor sob `pipefail`. Lacuna reproduzida. |
| P1 | Associação de diagnósticos TypeScript | parte de techne/map-079 | Comparar o caminho diagnosticado com o arquivo editado, substituindo correspondência por substring. |
| P1 | Recomendações de desempenho de animação | ui-motion/map-001, map-006, map-008, map-012 | Uma única correção documental: considerar versão, recurso, navegador e perfil medido antes de trocar atalhos por `transform`. |
| P2 | Propriedade dos bytes de buffers reutilizados | techne/map-030 | Explicar que o resultado precisa conservar memória própria antes de devolver o buffer ao pool. |
| P2 | Diagnóstico e remoção de animações | seleção de ui-motion/discovery-001 | Acrescentar orientações curtas às referências existentes: interrupção, entrada de contêiner/filhos, foco, visibilidade e callbacks. |
| P2 | Correções documentais de UI | seleção de ui-design/watch-001 e watch-002 | Gestos, internacionalização, tipografia progressiva, crítica nativa e briefs compatíveis com os agentes locais. Sem importar protocolo ou papéis novos. |
| P2 | Critérios de entrega visual | seleção de ui-design-styles/map-001 | Verificar assets nas larguras entregues, dimensões/carregamento de imagens, fallback estático e distinção entre medição de laboratório e de campo. Sem catálogo obrigatório. |

As prioridades definem a fila; cada unidade precisa passar por sua própria prova antes da próxima. Escopos sobrepostos não geram implementações adicionais.

### Provas e limites dos ports selecionados

**Guard de configurações.** Alvo: `assets/techne/scripts/hooks/config-guard.js`. A chamada direta ao módulo bloqueou `.eslintrc.json` existente, mas permitiu `.prettierrc.json5`, `.prettierrc.mts` e `.prettierrc.cts` existentes. Também permitiu arquivo protegido somente em `edits`, inclusive quando o caminho compartilhado apontava para arquivo comum. A implementação deve cobrir cada posição do lote, fallback de caminho, criação de arquivo novo, autorização explícita, entrada truncada e payload inválido. O plugin Techne continua instalado pelo caminho nativo de Claude; a migração Rust não aposentou esses hooks JS.

**Lançadores.** Alvos: `assets/skills/ui-design/scripts/impeccable` e `assets/skills/ui-design/scripts/impeccable.cmd`. O cache versionado atual é executado diretamente; o download usa checksum obtido junto ao artefato. Adotar validação de integridade ancorada no conteúdo distribuído e correspondência de versão. Antes de implementação, fixar o contrato para overrides explícitos e binários adjacentes. Aceitação com fixtures inertes: cache válido/adulterado, manifesto ausente, versão divergente, ferramenta de hash indisponível e concorrência. Não executar downloads reais nesses testes. A implementação candidata não foi validada em Windows nesta análise.

**Pipelines.** Alvo: `assets/techne/skills/quality/reference/verification-loop.md`. Os exemplos de tipos e lint usam `head`. Um produtor sintético bem-sucedido, com saída maior que o pipe, retornou pipeline `1` com `head -n 30` e `0` com consumo integral por `sed -n '1,30p'`, sob `pipefail`. Aceitação: limitar a exibição sem encerrar o produtor e preservar também um resultado de falha real. Não portar automaticamente os demais critérios do escopo.

**Diagnósticos.** Alvo: `assets/techne/scripts/hooks/stop-checks.js`. A implementação usa substring do caminho relativo: editar `index.ts` pode atribuir a ele um diagnóstico de `src/index.ts`. Exigir regressão pelo chamador do hook, com diagnóstico do arquivo correto, arquivo de nome semelhante, normalização e separadores Windows. A seleção da sessão e o prazo total já existem; não acrescentar controles apenas por paridade.

**Desempenho de animação.** Alvos: `assets/skills/ui-motion/SKILL.md`, `reference/web.md` e `reference/review.md`. Remover a afirmação geral de que atalhos `x`/`y`/`scale` sempre executam na thread principal. Identificar versão instalada e recursos utilizados; separar animações de layout e atualizações por quadro; exigir perfil sob carga para conclusão de desempenho. Não garantir aceleração por GPU, atualizar dependência ou inventar benchmark.

**Buffers Go.** Alvo: `assets/techne/skills/go/reference/patterns.md`. O material recomenda reutilização via pool, mas não explicita a propriedade da memória retornada. Acrescentar a regra com redação própria. Se houver exemplo executável, forçar reutilização do buffer e verificar a estabilidade do resultado anterior; não criar teste que apenas procure uma frase.

**Orientações de UI.** Usar as referências existentes de `ui-motion` e os arquivos `harden.md`, `adapt.md`, `typeset.md`, `critique.md` e briefs compatíveis de `ui-design`. Cobrir cancelamento/perda de captura, segundo ponteiro, conflito com scroll e recuperação; distinguir armazenamento de texto de normalização para busca; aplicar formatação por locale; tratar quebra de texto como melhoria progressiva; permitir crítica nativa sem detector web inaplicável. Screenshot comprova layout, não gesto. Configuração de hook não comprova carregamento/aprovação pelo host. Critérios de estilo entram na referência apropriada, sem impor runtime, assets, animação universal ou altura fixa de seção.

## O que não portar como pacote

- **Techne:** não importar o interpretador ampliado de comandos nem todas as descobertas. A possível lacuna de inclusão de configuração Git em `map-076` merece reprodução dirigida antes de selecionar uma correção. `map-080` corrige descoberta de alterações via Git; o Stop local recebe a lista da sessão e não usa esse mecanismo.
- **UI styles:** não importar os 1.631 arquivos e 151 binários da descoberta. Não apagar referências locais porque foram removidas na fonte: `ui-mockup` continua encaminhando para brandkit, comps e extração de imagem para código; as direções locais continuam tendo função.
- **UI design:** não atualizar engine, comandos, protocolo de revisão humana ou momento dos hooks junto às correções documentais. Um número de versão isolado não comprova compatibilidade.
- **Nomos:** não incorporar runtime, HTTP, autenticação e modelos à regra permanente. Ela já ocupa 4.459 bytes de um orçamento de 4.500 bytes; mudança editorial precisa de benefício específico.
- **Deliver:** não reintroduzir o motor substituído nem ampliar o roster de 12 agentes. O fluxo local já define coordenação, verificação, retomada e memória.
- **Atlas:** não atualizar motor pelo volume de commits ou pela versão do registro. O wrapper local já fixa `0.12.1`, SHA-256 e três tentativas, enquanto o registro ainda informa `0.8.1`. Reconciliar proveniência antes de decidir atualização; comparar correções de plataforma/instalador separadamente.
- **Biblos e browser:** mudanças documentais não demonstram necessidade de alterar registro HTTP ou configuração MCP. Preservar contratos e credenciais existentes.

## Matriz completa dos 56 escopos

“Adiar” significa não portar agora, mantendo uma pergunta concreta de verificação. “Adaptar” aprova somente a seleção descrita acima, nunca o escopo inteiro. “Provisório” identifica parecer preparado sem revalidação semântica suficiente nesta análise.

| Fonte | Escopos | Decisão | Motivo |
| --- | --- | --- | --- |
| techne | map-003, map-020, map-022, map-054, map-063, map-078 | Não portar agora; provisório | Benefício específico ou equivalência local não revalidados; não tratar o parecer automático como prova. |
| techne | map-030 | Adaptar | Propriedade da memória retornada ao reutilizar buffers. |
| techne | map-055 | Adaptar parcialmente | Corrigir pipelines; outros critérios ficam fora desta seleção. |
| techne | map-075 | Não portar agora; provisório | Não ampliar regras sem necessidade específica demonstrada. |
| techne | map-076 | Adiar | Reproduzir inclusão de configuração Git; rejeitar refatoração integral por paridade. |
| techne | map-077 | Adaptar | Extensões e destinos de lote escapam ao guard local. |
| techne | map-079 | Adaptar parcialmente | Correspondência exata do diagnóstico; sessão e orçamento já têm solução local. |
| techne | map-080 | Não portar | Mecanismo corrigido de descoberta via Git não existe no Stop local. |
| techne | watch-001, discovery-001, discovery-002, discovery-003 | Adiar | Inventários amplos sem avaliação integral; deduplicar sobreposições antes de selecionar. |
| ui-motion | map-001, map-006, map-008, map-012 | Adaptar | Uma unidade documental sobre versão, recurso e medição. |
| ui-motion | discovery-001 | Adaptar parcialmente | Diagnóstico, orquestração e remoção segura; dispensar workflows completos. |
| ui-design-styles | map-001 | Adaptar parcialmente | Extrair critérios de entrega; rejeitar substituição por catálogo/runtime. |
| ui-design-styles | map-002, map-003, map-004, map-005, map-006, map-007, map-008, map-009, map-010, map-011, map-012, map-013 | Não portar exclusões | Responsabilidades e rotas locais permanecem válidas. |
| ui-design-styles | discovery-001 | Não portar integralmente | Sobrepõe mapas; seleção de critérios já contabilizada em map-001. |
| ui-design | watch-001, discovery-001 | Adaptar parcialmente | Correções documentais e integridade em tarefas distintas; adiar migração de engine/protocolo. |
| ui-design | watch-002, discovery-002 | Adaptar parcialmente | Somente briefs compatíveis; não criar novos agentes ou protocolo. |
| ui-design | watch-003 | Adiar | Mudança de momento do hook exige prova no host e na instalação. |
| ui-design | watch-005 | Não portar isoladamente | Versão declarada sem migração comprovada. |
| nomos-terse | watch-001, watch-002 | Adiar | Benefício textual ainda não demonstrado; regra local já cobre comunicação. |
| nomos-terse | discovery-001 | Não portar subsistema | Runtime e serviços excedem a responsabilidade da regra. |
| deliver-engine | watch-001, discovery-001 | Não portar | Mesma mudança líquida; responsabilidade já coberta pelo fluxo local. |
| deliver-engine | watch-002, discovery-002 | Não portar integralmente | Mesma mudança líquida; evitar expansão de agentes/runtime. |
| deliver-engine | watch-003 | Não portar integralmente | Não há necessidade demonstrada de outro mecanismo de entrega/retomada. |
| atlas | watch-001, watch-002 | Adiar | Comparar garantias de instalação/plataforma com versão efetiva e reconciliar registro. |
| atlas | watch-003 | Não portar integralmente | Documentação ampla não justifica novo conjunto de regras. |
| biblos | watch-001, watch-002 | Não portar agora | Delta real sem alteração necessária demonstrada no transporte/registro local. |
| browser | watch-001 | Não portar agora | Documentação não demonstra necessidade de mudar configuração MCP. |

## Fontes sem escopo alterado nesta leva

| Fonte | Decisão |
| --- | --- |
| nomos-principles | Nenhum port novo: baseline igual ao candidato. |
| praxis | Nenhum port novo nos escopos observados; preservar interpretação própria e restrição de licença. |
| deliver-ideas | Nenhum port novo: baseline igual ao candidato. |
| project-memory-ideas | Nenhum port novo: baseline igual ao candidato. |
| metis | Manter revisão inicial pendente; igualdade ao baseline não comprova adoção. |
| sophia | Manter revisão inicial pendente; igualdade ao baseline não comprova adoção. |

## Confiabilidade do manifesto

Onze escopos têm `evidence: no-net-change` e deltas não zero: `techne/map-003`, `techne/map-022`, `techne/map-054`, `techne/map-063`, `techne/map-078`, `ui-design-styles/map-004`, `ui-design/watch-005`, `deliver-engine/watch-001`, `deliver-engine/discovery-001`, `atlas/watch-001` e `biblos/watch-002`.

Isso não prova que a rejeição esteja errada: ausência de benefício local pode justificar rejeição apesar de mudanças reais. A classificação de evidência, porém, não serve como prova de ausência de diferença. O revisor valida enums e cardinalidade, mas não demonstra essa equivalência semântica. Corrigir o critério do relatório em trabalho separado; não recalcular pins a partir dessa etiqueta.

Duplicação confirmada: `ui-design` watch/discovery 001 e 002; `deliver-engine` watch/discovery 001 e 002. Contagens dos escopos não são totais únicos de arquivos, commits ou ganhos.

## Verificação e registro de ações

- Validei os dois documentos e confrontei os baselines com `maintainer/pege/sources.json` para ancorar a decisão na leva recebida.
- Usei Atlas e leituras dirigidas dos alvos locais; cobertura consultada sem problemas registrados nos arquivos de código usados pelo coordenador. Isso é sinal best-effort, não prova de auditoria integral.
- Dividi a inspeção privada entre Techne, design/motion e núcleo para comparar responsabilidades independentes sem importar conteúdo original para este relatório.
- Reproduzi a interrupção do pipeline e recebi a reprodução dirigida das falhas do guard para separar oportunidades concretas de suposições.
- Executei `node --test test/source-review.test.js test/techne-hooks.test.js`: **36 testes, 36 passaram, 0 falharam, 0 ignorados**. São provas da baseline existente; não cobrem os ports selecionados ainda não implementados.
- Dois comandos amplos de inspeção dos agentes foram recusados pelo gate como possíveis operações Git protegidas. Nenhuma operação Git de escrita foi tentada; o relatório marca a inspeção incompleta em vez de afirmar verificação integral.
- Esta entrega altera somente esta nota. Não houve implementação, execução de código das fontes, avanço de pins, commit, push ou PR. Licenças, avisos e originalidade devem ser verificados por port antes de aceitar qualquer candidato.
