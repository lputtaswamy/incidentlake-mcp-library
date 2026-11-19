# SIGQ Incident Lake MCP

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that connects Claude Desktop, Cursor, and other MCP clients to your SIGQ Incident Lake. Ask questions about your incidents in natural language — it queries the SIGQ API directly.

**Package:** `@sigq/incidentlake-mcp-library` on [NPM Packages](https://www.npmjs.com/package/@sigq/incidentlake-mcp-library)

---

## Remote connection (no API key)

Incident Lake also hosts this server over Streamable HTTP with OAuth sign-in. Open **User settings → AI tools (MCP)** in Incident Lake to get the server URL, add it to your MCP client (Claude connectors, Cursor, VS Code, Claude Code), and sign in when prompted. The rest of this README covers the local stdio server, which uses an API token instead.

Hosts embedding the server use the `@sigq/incidentlake-mcp-library/server` entry point, which exports `handleStreamableHttpRequest(req, res, parsedBody, { apiUrl, apiToken })`. Tools that read or write the local disk (`export_incidents` and the file upload/download tools) are not offered there. A `toolsets` query parameter on the request URL (for example `?toolsets=default,specs`) chooses the [tool groups](#tool-groups) for that client.

---

## Tool groups

The core tools stay registered no matter what: incidents, notes, tags, checklists, severities, tasks, commanders, related resources, reports, members, the CMDB service graph (`save_cmdb_graph_batch` and the service and dependency tools), risks, integrations, the response timeline, drills and knowledge. These groups only add Public API operations that had no tool yet. Group names match Incident Lake features.

| Group | Default | Adds |
| --- | --- | --- |
| `incidents` | yes | Custom fields, analytics dashboards, the incident query language, the self-service portal, ITIL fields, AI field fill, severity detection, checklist templates, roles, task reports, linked changes, the emergency chat room |
| `task_board` | yes | Task board projects, tasks, scopes, comments and files |
| `service_requests` | | Service request catalog, submissions, approvals and fulfilment |
| `problems` | | Problem candidates, risk history and links, improvement tasks |
| `knowledge` | | Portal publication, semantic search, versions, CSV import, classification, and the evidence library |
| `changes` | | GitHub repository access, changes, releases, deployments, GitHub sync |
| `specs` | | Traceability, acceptance criteria, spaces, pages, reviews, change requests, sources, judgements |
| `emergency` | | Emergency plans, contacts, activations, consultations |
| `services` | | IT assets, Jamf Pro, service incident counts, ITIL attributes, dependency extraction, NetBox, the service catalog, locations and business operations |
| `settings` | | Custom field definitions, workflow automations and tenant configuration (templates, roles, severity criteria, RBAC, ITIL settings) |

## Approval for destructive operations

Tools that delete or change existing data ask you to approve each call before anything is changed. A tool is one of these when it is marked `destructiveHint: true`, or its name starts with `delete_`, `remove_`, `update_`, `replace_`, `upsert_`, `resolve_`, `reopen_`, `publish_`, `cancel_`, `dismiss_`, `approve_`, `unlink_`, `uncomplete_`, `sync_`, `save_`, `set_`, `link_`, `close_`, `reject_`, `fulfill_`, `escalate_`, `import_` or `confirm_` (a `bulk_` prefix is allowed). Clients that support MCP form elicitation show an approval dialog with the tool's arguments (secrets, tokens and passwords are hidden); a client that still advertises `elicitation: {}` counts. The call runs only if you tick **Approve** and accept. On the current protocol, which has no server-to-client request, the same question comes back as an input-required result and the tool runs when you approve the retry. An approval only counts for the tool and arguments it was shown for; a different call asks again. Every one of these tools is marked `destructiveHint: true`, so clients without form elicitation (and the stateless remote HTTP server) fall back to the client's own tool-call confirmation. A declined, unticked or timed-out approval changes nothing, and the model is told not to retry on its own.

Nothing is required. With `SIGQ_TOOLSETS` unset, the two default groups are added on top of the core tools. `all` adds every group, `none` keeps only the core tools, and `default,specs` adds one more group.

```json
{
  "mcpServers": {
    "incidentlake-mcp": {
      "command": "npx",
      "args": ["@sigq/incidentlake-mcp-library"],
      "env": { "SIGQ_TOOLSETS": "default,specs" }
    }
  }
}
```

---

## How It Works

The server runs as a local process on your machine and communicates with the SIGQ backend over HTTP using your API token. MCP clients connect to it via stdio transport.

```
Claude Desktop  ──stdio──►  incidentlake-mcp  ──HTTPS──►  SIGQ API
```

---

## Prerequisites

- Node.js 20+
- A SIGQ API token (starts with `sigq_`) — generate one from SIGQ tenant settings

---

## Step 1 — Run the setup wizard

```bash
npx @sigq/incidentlake-mcp-library configure
```

This will:

- Ask for your SIGQ API URL and token
- Test the connection to make sure it works
- Save credentials to `~/.sigq/config.json`
- Print the exact config block to paste into your MCP client

```
Welcome to Incident Lake MCP setup!

? Enter your SIGQ API URL (press Enter for default):
  [https://api.prod.incidentlake.sigq.io/incidentlake/public-api]:
? Enter your API token (starts with sigq_): sigq_xxxx

? Testing connection... ✓ Connected successfully!
✓ Config saved to ~/.sigq/config.json
```

**Default API URL:** `https://api.prod.incidentlake.sigq.io/incidentlake/public-api`

---

## Step 2 — Configure your MCP client

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "incidentlake-mcp": {
      "command": "npx",
      "args": ["@sigq/incidentlake-mcp-library"]
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json` or your workspace `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "incidentlake-mcp": {
      "command": "npx",
      "args": ["@sigq/incidentlake-mcp-library"]
    }
  }
}
```

> No `env` block needed — credentials are read from `~/.sigq/config.json` set up in Step 1.

---

## Step 3 — Restart your MCP client

Restart Claude Desktop or Cursor. You should see `incidentlake-mcp` listed with its tools.

## Example Prompts

- "List the 5 most recent ongoing incidents"
- "Search for incidents related to database timeout"
- "List incidents filtered by tags client:acme and urgency:high"
- "Show me incident analytics for January 2025"
- "Get the full details of incident `<uuid>`"
- "Create an incident called 'Auth service degraded'"
- "What SOP steps are completed for incident `<uuid>`?"
- "Update incident `<uuid>` summary to include the latest customer impact"
- "Resolve incident `<uuid>`"
- "Reopen incident `<uuid>`"
- "Delete incident `<uuid>`"
- "What categorization tags are on incident `<uuid>`?"
- "Add tags client:acme and urgency:high to incident `<uuid>`"
- "Replace all tags on incident `<uuid>` with region:us-east and team:platform"
- "Remove tag device:legacy from incident `<uuid>`"
- "Link Slack thread `<slack thread URL>` to incident `<uuid>`"
- "Unlink Slack thread `<thread id>` from incident `<uuid>`"
- "List all active tenant members"
- "List all knowledge articles"
- "Search knowledge for runbook checkout failure"
- "Show knowledge tags and their item counts"
- "Get the full knowledge article for `<uuid>`"
- "Create a knowledge article titled Weekly deploy checklist with plain-text content"
- "Update knowledge item `<uuid>` title to On-call handoff v2"
- "Delete knowledge item `<uuid>`"
- "Set tags on knowledge item `<uuid>` to runbook, operations"

---

## Setup for Local Development

### 1. Clone and install

```bash
git clone https://github.com/sigq-io/incidentlake-mcp-library.git
cd incidentlake-mcp-library
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set SIGQ_API_URL and SIGQ_API_TOKEN
```

### 3. Run

```bash
npm run dev      # run directly with tsx (no build needed)
npm run build    # compile TypeScript → dist/
npm run start    # run compiled output
```

### 4. Configure Claude Desktop (local build)

```json
{
  "mcpServers": {
    "sigq-local": {
      "command": "node",
      "args": ["/path/to/incidentlake-mcp-library/dist/index.js"]
    }
  }
}
```

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## License

MIT License - see [LICENSE](LICENSE) for details.
