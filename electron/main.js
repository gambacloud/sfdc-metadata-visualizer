/**
 * electron/main.js
 * Electron main process.
 *
 * What this does:
 *  1. On launch — opens a file picker for the metadata ZIP
 *  2. Runs the parser (Node.js, bundled inside the app)
 *  3. Writes index.json to a temp folder
 *  4. Serves the built viewer via a local HTTP server
 *  5. Opens the viewer in an Electron BrowserWindow
 */

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const http   = require('http');
const os     = require('os');

// ── Paths ─────────────────────────────────────────────────────────────────────
const isDev       = !app.isPackaged;
const PARSER_DIR  = isDev
    ? path.join(__dirname, '../parser')
    : path.join(process.resourcesPath, 'parser');
const VIEWER_DIR  = isDev
    ? path.join(__dirname, '../viewer/dist')
    : path.join(process.resourcesPath, 'viewer-dist');
const DATA_DIR    = path.join(os.tmpdir(), 'sfdc-kb');
const INDEX_JSON  = path.join(DATA_DIR, 'index.json');

let mainWindow = null;
let server     = null;
let serverPort = 0;

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    serverPort = await startStaticServer(VIEWER_DIR);
    createWindow();
});

app.on('window-all-closed', () => {
    if (server) server.close();
    if (process.platform !== 'darwin') app.quit();
});

// ── Browser window ────────────────────────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width:  1400,
        height: 860,
        minWidth:  900,
        minHeight: 600,
        title: 'SFDC Metadata Visualizer',
        backgroundColor: '#080d18',
        webPreferences: {
            preload:         path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration:  false,
        },
        // Custom titlebar feel
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        icon: path.join(__dirname, 'icon.png'),
    });

    // If index.json already exists from a previous run, load viewer directly
    if (fs.existsSync(INDEX_JSON)) {
        loadViewer();
    } else {
        // Show loading page asking user to pick a ZIP
        mainWindow.loadURL(`http://localhost:${serverPort}/loader.html`);
    }

    mainWindow.on('closed', () => { mainWindow = null; });
}

function loadViewer() {
    mainWindow.loadURL(`http://localhost:${serverPort}/index.html`);
}

// ── IPC — from renderer ───────────────────────────────────────────────────────

// User clicked "Open ZIP" button
ipcMain.handle('pick-zip', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title:      'Select Salesforce Metadata ZIP',
        filters:    [{ name: 'ZIP files', extensions: ['zip'] }],
        properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, zipPath: result.filePaths[0] };
});

// Run parser on selected ZIP
ipcMain.handle('run-parser', async (event, zipPath) => {
    return new Promise((resolve) => {
        const { execFile } = require('child_process');
        const parserScript = path.join(PARSER_DIR, 'index.js');
        const node = process.execPath; // bundled Node

        const child = execFile(node, [parserScript, '--zip', zipPath, '--out', INDEX_JSON], {
            cwd: PARSER_DIR,
        });

        let stdout = '', stderr = '';
        child.stdout?.on('data', d => { stdout += d; event.sender.send('parser-log', d.toString()); });
        child.stderr?.on('data', d => { stderr += d; event.sender.send('parser-log', d.toString()); });

        child.on('close', code => {
            if (code === 0) {
                // Copy index.json into viewer dist so the static server can serve it
                fs.copyFileSync(INDEX_JSON, path.join(VIEWER_DIR, 'index.json'));
                resolve({ ok: true });
            } else {
                resolve({ ok: false, error: stderr || stdout });
            }
        });
    });
});

// Open external links in default browser
ipcMain.on('open-external', (_, url) => shell.openExternal(url));

// ── Static HTTP server ────────────────────────────────────────────────────────
function startStaticServer(dir) {
    return new Promise((resolve) => {
        const mime = {
            '.html': 'text/html',
            '.js':   'application/javascript',
            '.css':  'text/css',
            '.json': 'application/json',
            '.png':  'image/png',
            '.svg':  'image/svg+xml',
            '.ico':  'image/x-icon',
            '.woff2':'font/woff2',
        };

        server = http.createServer((req, res) => {
            let filePath = path.join(dir, req.url === '/' ? 'index.html' : req.url);
            // Strip query strings
            filePath = filePath.split('?')[0];

            if (!fs.existsSync(filePath)) {
                // SPA fallback
                filePath = path.join(dir, 'index.html');
            }

            const ext = path.extname(filePath);
            res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
            fs.createReadStream(filePath).pipe(res);
        });

        server.listen(0, '127.0.0.1', () => {
            resolve(server.address().port);
        });
    });
}
