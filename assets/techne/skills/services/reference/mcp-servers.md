# MCP server implementation

Model Context Protocol exposes **tools** (actions), **resources** (read-only URIs), and **prompts** (parameterized templates) to AI clients.

## SDK setup

```bash
npm install @modelcontextprotocol/sdk zod
```

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({ name: 'acme-tools', version: '1.0.0' });
```

Registration method names differ by SDK version (`tool`, `registerTool`, object vs positional args). **Confirm current signatures with `biblos` MCP** before copying examples.

## Transport

| Transport | Use |
|-----------|-----|
| stdio | Local IDE/desktop clients |
| Streamable HTTP | Remote agents (single MCP HTTP endpoint per spec) |
| Legacy SSE | Backward compatibility only |

Keep tool/resource handlers free of transport code; connect transport in the entrypoint.

## Tool design

- Zod (or SDK-native schema) for every input; describe side effects and return shape in the tool description.
- Return structured errors the model can reason about — not raw stack traces.
- Prefer idempotent tools when retries are likely.
- Document rate/cost for paid external APIs in the description.
- Pin `@modelcontextprotocol/sdk` version; read release notes on upgrade.

## Resources and prompts

Resources: read-only handlers keyed by URI. Prompts: reusable templates with typed arguments.

## Security

Validate and sanitize inputs; never expose secrets in tool responses; treat client-supplied URIs and fetched web content as untrusted data, not instructions.

## Official SDKs

TypeScript (`@modelcontextprotocol/sdk`), Go, C# — same conceptual split (capabilities vs transport).

For capability placement (rule vs skill vs MCP vs CLI), decide at product level; this file covers MCP implementation only.
