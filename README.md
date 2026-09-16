# Local Draw.io MCP server

A local, Docker-ready MCP server that creates and edits **native, editable `.drawio` XML**. It runs over standard input/output and works with MCP clients directly or through Docker MCP Toolkit/Gateway. No Draw.io account, API key, browser process, remote diagram service, or runtime network access is required.

The connected AI client translates your request into a graph; this server handles layout, XML generation, inspection, editing, validation and storage. Draw.io's XML format is the integration surface—there is no hosted XML API call.

## Diagram support

Twelve starter templates are included:

- Flowcharts, including decisions and loops
- UML class, use-case and sequence diagrams
- ERDs with entity fields and crow's-foot connectors
- Network topologies
- BPMN process drawings
- Cloud architectures
- State machines, mind maps, organization charts and data-flow diagrams

These are starting points, not a closed list. Nodes support custom Draw.io style strings, arbitrary labels, nested containers, explicit geometry and edge waypoints. Use those for other diagram families and AWS/Azure/GCP/Kubernetes stencils supported by your target Draw.io editor. Built-in cloud examples use portable generic shapes rather than vendor logos. BPMN is visual notation, **not executable BPMN 2.0 XML**.

## Run with Docker

Requires Docker Engine with Linux containers, or Docker Desktop.

```sh
docker build -t draw-io-mcp:local .
docker run --rm -i --network=none --read-only --cap-drop=ALL --security-opt=no-new-privileges -v drawio-diagrams:/data draw-io-mcp:local
```

The process waits for MCP messages on stdin; it is not an HTTP server or interactive shell. Do not add `-t` because a pseudo-terminal interferes with the protocol. A client launches one process/container per connection. No port needs to be exposed.

Copy the `mcpServers` entry from [docker/client-config.json](docker/client-config.json) into your client's MCP configuration. Clients such as VS Code use a `servers` root instead of `mcpServers`; retain the same command and args.

For files directly accessible on the host, replace the named volume argument with a bind mount to an existing absolute directory:

```text
--mount type=bind,source=/absolute/path/to/diagrams,target=/data
```

On Windows the source can be `D:\Diagrams`; in JSON escape backslashes (`D:\\Diagrams`). On Linux, the bind directory must be writable by container UID 1000. The image runs as the non-root `node` user. A named volume is initialized with suitable ownership on first use.

The tool returns paths **inside the container**. To retrieve files from the named volume on PowerShell:

```powershell
New-Item -ItemType Directory -Force ./output
docker run --rm --network=none --mount type=volume,source=drawio-diagrams,target=/data,readonly --mount "type=bind,source=$((Resolve-Path ./output).Path),target=/export" --entrypoint sh draw-io-mcp:local -c 'cp /data/*.drawio /export/'
```

Compose is also available:

```sh
docker compose build
docker compose run --rm -T drawio-mcp
```

Compose uses its own project-scoped named volume. Configure a client to launch `docker compose -f /absolute/path/compose.yaml run --rm -T drawio-mcp`; `compose up -d` alone does not connect an MCP client.

## Docker MCP Toolkit

For Docker Desktop **4.62 or later**, enable MCP Toolkit and run these commands from this repository:

```sh
docker build -t draw-io-mcp:local .
docker mcp profile create --name diagrams
docker mcp profile server add diagrams --server file://./docker/mcp-server.yaml
docker mcp gateway run --profile diagrams
```

Configure a client to launch the gateway:

```json
{
  "mcpServers": {
    "MCP_DOCKER": {
      "command": "docker",
      "args": ["mcp", "gateway", "run", "--profile", "diagrams"]
    }
  }
}
```

The supplied Toolkit definition needs no secrets or host access. **Use XML returned by the tools as the portable artifact.** The basic Toolkit definition does not attach a persistent named volume; files saved inside those containers may not survive gateway restarts. For durable saved files use the direct Docker client configuration above. Older Toolkit versions use different catalog commands; the direct `docker run` configuration also works without Toolkit.

The registration format and commands follow [Docker's MCP CLI documentation](https://docs.docker.com/ai/mcp-catalog-and-toolkit/cli/).

## Run without Docker

Requires Node.js 22+ and pnpm 11.19.0.

```sh
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm start
```

A local client may use `command: "node"`, `args: ["/absolute/path/to/src/server.js"]`, and an absolute `DRAWIO_OUTPUT_DIR` environment variable. The default is `./output` relative to the process working directory; inside the container it is `/data`.

## Tools

| Tool | Purpose |
| --- | --- |
| `list_diagram_templates` | Discover starter diagrams |
| `get_diagram_template` | Return a template graph and XML |
| `list_diagram_shapes` | Discover built-in shapes and connector styles |
| `create_diagram` | Generate XML from a graph |
| `validate_diagram` | Check XML structure, IDs, references, cycles and geometry |
| `inspect_diagram` | Read pages and cells from existing XML |
| `edit_diagram` | Update or remove existing cells, preserving other XML |
| `combine_diagrams` | Assemble a multi-page drawing |
| `get_editor_url` | Return a URL for your chosen editor; no request is sent |
| `save_diagram` | Validate and save XML; overwrite defaults to false |
| `read_diagram` | Read a saved drawing |
| `list_saved_diagrams` | List saved filenames |

Also exposes the `drawio://guide` resource and `design_diagram` prompt. Every tool has an input schema and returns JSON text plus MCP structured content; operational errors return `isError: true`. `validate_diagram` instead returns `valid: false` with errors for invalid XML.

### Example graph

Pass this to `create_diagram`:

```json
{
  "graph": {
    "name": "Request flow",
    "layout": "LR",
    "nodes": [
      {"id": "client", "label": "Client", "shape": "actor"},
      {"id": "api", "label": "API", "shape": "component"},
      {"id": "db", "label": "Database", "shape": "database"}
    ],
    "edges": [
      {"source": "client", "target": "api", "label": "HTTPS"},
      {"source": "api", "target": "db", "label": "SQL", "relation": "arrow"}
    ]
  }
}
```

Then pass the returned `xml` with `filename: "request-flow.drawio"` to `save_diagram`. Open the result in Draw.io Desktop or diagrams.net.

### Graph details

- Layout is `LR`, `TB`, `RL`, `BT` or `manual`. Dagre positions siblings bottom-up and containers grow around children. Cyclic graphs are supported. Explicit `x`/`y` pairs are retained; manual layout requires both for every node. Fixed coordinates may overlap other nodes—use manual layout for precise placement.
- Nodes require unique IDs starting with a letter or underscore. Set `parent` to another node ID for containment. Child coordinates are relative to that parent. Use `container` or `lane` shapes for visible groups.
- Use `body: ["PK id: UUID", "name: varchar"]` on `entity` or `class` nodes for editable rows. Generated row IDs are `NODE__row_N`.
- Edges require valid `source` and `target` IDs. IDs default to `edge_1`, etc. Set explicit IDs when they would collide. Relations include inheritance, realization, aggregation, composition, dependencies, ERD cardinalities and BPMN flows.
- `style` appends raw Draw.io style properties during generation. For example, `fillColor=#d5e8d4;strokeColor=#82b366;` changes colors. `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;` can use a vendor stencil where supported. Arbitrary stencils are not validated by this server.
- `points: [{"x": 200, "y": 100}]` on an edge sets absolute waypoints. Draw.io computes final orthogonal routing when opened; this server does not run the Draw.io rendering engine.
- Labels are plain text (`html=0`) and XML-escaped. Set `html=1` in a custom style only when intentionally supplying HTML labels. Raw imported XML/styles are retained, so open untrusted documents with appropriate care.

### Editing and importing

`edit_diagram` takes XML, a zero-based `page` (default 0), and operations:

```json
[
  {"action": "update", "id": "api", "label": "Order API", "geometry": {"x": 320, "y": 80}},
  {"action": "remove", "id": "db"}
]
```

Updates can change `label`, `style` (replaces the full style), `parent`, `source`, `target` and geometry. Removal cascades to children and connected edges. The whole edit is validated before returning; it never writes a file implicitly. To add new elements, update the graph specification and regenerate, or modify/import XML using the documented Draw.io format. Arbitrary XML metadata and wrapped `UserObject` cells are preserved by edits, though whitespace/serialization may change.

XML tools accept full uncompressed `.drawio` documents, bare `mxGraphModel` elements and Draw.io-compressed pages (URI-encoded XML, raw DEFLATE, Base64). Output is uncompressed XML for portability and inspection. Limits: 5 MB per XML document including expanded compressed data, 100 pages, 2,000 graph nodes and 4,000 graph edges per creation call. Validation is structural and reference-based, not full XSD validation or proof of domain correctness.

## Viewing and exporting

Open [examples/all-diagrams.drawio](examples/all-diagrams.drawio) in Draw.io to browse all templates. Individual examples include both graph JSON and XML. `get_editor_url` defaults to diagrams.net; you can provide `base_url: "http://localhost:8080/"` for a separately hosted local Draw.io editor. Opening a generated URL loads that editor; generation itself stays offline.

PNG, SVG and PDF rendering is deliberately outside this server. Use Draw.io's File → Export menu or a separately installed Draw.io Desktop CLI:

```sh
drawio --export --format svg --output diagram.svg diagram.drawio
drawio --export --format png --output diagram.png diagram.drawio
drawio --export --format pdf --output diagram.pdf diagram.drawio
```

The Docker image does not include Chromium, Xvfb or Draw.io Desktop.

## Development and verification

```sh
pnpm test
pnpm examples
docker build --target test -t draw-io-mcp:test .
docker build -t draw-io-mcp:local .
pnpm test:docker
```

Tests cover all templates, XML escaping, layouts/containers, compressed imports, edits, invalid XML, decompression limits, storage boundaries, concurrent creates and a real MCP SDK client/server stdio session. The Docker smoke test checks the actual runtime image, including a volume write with a read-only root filesystem. CI runs both suites on Linux. Symlink tests are skipped on Windows because creating symlinks may require additional privileges.

Implementation references: [Draw.io XML format and style guidance](https://www.drawio.com/docs/reference/diagram-generation/) and the [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x).
