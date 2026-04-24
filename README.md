# SFDC Metadata Visualizer

Salesforce org knowledge base — static analysis from metadata ZIP.

---

## Repo Structure

```
sfdc-metadata-visualizer/
├── demo-zip-source/       # Synthetic demo metadata (Order Management scenario)
├── parser/                # Node.js — parses ZIP → index.json  (run once)
├── viewer/                # React/Vite — loads index.json, interactive UI
├── data/                  # Gitignored — parser output lives here
├── package.xml            # Use with SF CLI to retrieve all relevant metadata
└── generate-demo-zip.js   # Packs demo-zip-source/ into demo-metadata.zip
```

---

## Quickstart

### 1. Generate the demo ZIP
```bash
node generate-demo-zip.js
# → creates demo-metadata.zip
```

### 2. Parse the ZIP
```bash
cd parser
npm install
node index.js --zip ../demo-metadata.zip
# → writes ../data/index.json
```

### 3. Run the viewer
```bash
cd viewer
npm install
npm run dev
# → opens http://localhost:5173
```

---

## Retrieving Real Metadata from Your Org

```bash
sf project retrieve start --manifest package.xml --target-dir ./retrieved
# then zip the retrieved/ folder and point the parser at it
```

---

## What Gets Parsed

| Type              | File Pattern                  | What's extracted                          |
|-------------------|-------------------------------|-------------------------------------------|
| Flows             | `*.flow-meta.xml`             | Object, triggerType, subflows, apex calls, DML objects |
| Apex Triggers     | `*.trigger`                   | Object, events, handler class             |
| Apex Classes      | `*.cls`                       | extends, DML, EventBus.publish, REST, Batch, Queueable, @future |
| Custom Objects    | `*.object-meta.xml`           | Label, fields                             |
| Platform Events   | `*__e.object-meta.xml`        | Fields                                    |
| LWC               | `*.html` + `*.js`             | Flow references, Apex imports             |
| Aura              | `*.cmp` + `*Controller.js`    | Flow references, Apex calls               |

---

## Requirements

- Node.js 18+
- Nothing else
