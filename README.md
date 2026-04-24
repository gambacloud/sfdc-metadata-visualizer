# SFDC Metadata Visualizer

Parses a Salesforce metadata ZIP and gives you three interactive views:

- **DAG** — execution flow left-to-right, swimlanes by type
- **Object-Centric** — pick any object, see every automation that touches it
- **Table** — searchable, filterable index with smart filters

---

## Requirements

- [Node.js 18+](https://nodejs.org) — the only thing you need to install manually
- Git (optional, only needed if cloning)

---

## First Time Setup

```bat
setup.bat
```

That's it. This will:
1. Install all dependencies (parser + viewer)
2. Generate and parse the demo metadata
3. Copy the output so the viewer can read it

---

## Daily Use

**Launch the viewer:**
```bat
run.bat
```
Opens `http://localhost:5173` in your browser.

**Parse new metadata:**
```bat
parse.bat C:\path\to\your\metadata.zip
```
Or just **drag and drop** your ZIP file onto `parse.bat` in Explorer.

Then `run.bat` again to see the updated data.

---

## How to Get Your Metadata ZIP from Salesforce

Use the included `package.xml` with Salesforce CLI:

```bash
sf project retrieve start --manifest package.xml --target-dir ./retrieved
```

Then zip the `retrieved/` folder and point `parse.bat` at it.

---

## Full Flow (First Time)

```
1. git clone https://github.com/gambacloud/sfdc-metadata-visualizer
2. Double-click setup.bat
3. Double-click run.bat
4. Open http://localhost:5173
```

**Next time metadata changes:**
```
1. Drag your new ZIP onto parse.bat
2. Double-click run.bat
```

---

## Sharing the Viewer with Someone Else

There are two ways depending on what the other person needs:

---

### Option A — Full repo (they can re-parse)

```
git clone https://github.com/gambacloud/sfdc-metadata-visualizer
setup.bat
```

They run `parse.bat` against their own ZIP, then `run.bat`.

---

### Option B — Viewer only (read-only, no Node required)

Run this on your machine after parsing:

```bat
export-viewer.bat
```

This creates a folder called `sfdc-viewer-export\` containing a fully built,
self-contained static site. You can:

- **Share the folder** — recipient opens `index.html` directly in any browser. No Node, no install, no server.
- **Host it** — drop the folder on any static host (GitHub Pages, Netlify, S3, internal SharePoint).
- **Zip and email it** — the whole thing is typically under 2MB.

The export includes the `index.json` snapshot baked in, so the data is frozen at
the time you exported it.

---

## Repo Structure

```
sfdc-metadata-visualizer/
├── setup.bat              ← Run once after cloning
├── run.bat                ← Run daily to launch viewer
├── parse.bat              ← Run when metadata changes
├── export-viewer.bat      ← Build standalone viewer to share
├── init-and-push.bat      ← One-time git push to GitHub
├── generate-demo-zip.js   ← Creates demo-metadata.zip from demo-zip-source/
├── package.xml            ← Use with SF CLI to retrieve metadata from your org
│
├── parser/                ← Node.js — parses ZIP → data/index.json
│   ├── index.js
│   └── parsers/
│       ├── flow.js
│       ├── trigger.js
│       ├── apexClass.js
│       ├── customObject.js
│       ├── lwc.js
│       ├── aura.js
│       └── graph.js
│
├── viewer/                ← React/Vite app
│   └── src/
│       ├── App.jsx
│       ├── constants.js
│       ├── useForceLayout.js
│       └── components/
│           ├── DAGView.jsx
│           ├── ObjectCentricView.jsx
│           ├── TableView.jsx
│           └── DetailPanel.jsx
│
├── demo-zip-source/       ← Synthetic Order Management demo metadata
│   ├── objects/
│   ├── triggers/
│   ├── classes/
│   ├── flows/
│   ├── lwc/
│   ├── aura/
│   └── platformEvents/
│
└── data/                  ← Gitignored — parser output lives here
    └── index.json
```

---

## What Gets Parsed

| Type            | Files                        | What's extracted                                      |
|-----------------|------------------------------|-------------------------------------------------------|
| Flows           | `*.flow-meta.xml`            | Object, trigger type, subflows, apex calls, DML       |
| Apex Triggers   | `*.trigger`                  | Object, events, handler class                         |
| Apex Classes    | `*.cls`                      | Extends, DML, EventBus.publish, REST, Batch, Queueable, @future |
| Custom Objects  | `*.object-meta.xml`          | Label, fields, relationships                          |
| Platform Events | `*__e.object-meta.xml`       | Fields                                                |
| LWC             | `*.html` + `*.js`            | Flow references, Apex wire imports                    |
| Aura            | `*.cmp` + `*Controller.js`   | Flow references, Apex controller                      |

---

## Edge Types

| Edge            | Meaning                                              |
|-----------------|------------------------------------------------------|
| `handler-call`  | Trigger → TriggerHandler class                       |
| `class-call`    | Apex class → Apex class                              |
| `dml-triggers`  | ⚠ Inferred: Apex/Flow DML on Object X → Trigger on X |
| `event-publish` | Apex → Platform Event                                |
| `event-subscribe` | Platform Event → Trigger                           |
| `flow-subflow`  | Flow → subflow                                       |
| `flow-apex`     | Flow → Apex invocable action                         |
| `lwc-apex`      | LWC → Apex via `@wire` or `import`                   |
| `lwc-flow`      | LWC → embedded Screen Flow                          |
| `aura-apex`     | Aura → Apex controller                               |
| `aura-flow`     | Aura → embedded Flow                                 |
| `batch-call`    | Apex → `Database.executeBatch(new X())`              |
| `queueable-call`| Apex → `System.enqueueJob(new X())`                  |
| `rest-callout`  | Apex → outbound REST via Named Credential            |

Dashed lines = inferred edges (not in source, derived from DML + trigger registry).

---

## Known Limitations

- Dynamic Apex (`Type.forName()`) cannot be statically resolved
- Runtime-only chains (e.g. conditional DML paths) require log analysis
- FFLIB dynamic dispatch requires Custom Metadata parsing (not yet implemented)
- LWC → Flow via `NavigationMixin` is only detected when the flow name is a string literal
