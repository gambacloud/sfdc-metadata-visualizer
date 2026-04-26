/**
 * electron/main.js
 * Electron main process.
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

// Suppress GPU cache errors — not needed for a text/SVG app
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-software-rasterizer');

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
            preload:          path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration:  false,
        },
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        icon: path.join(__dirname, 'icon.png'),
    });

    if (fs.existsSync(INDEX_JSON)) {
        loadViewer();
    } else {
        mainWindow.loadURL(`http://localhost:${serverPort}/loader.html`);
    }

    // Show devtools in dev mode to help debug
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

    mainWindow.on('closed', () => { mainWindow = null; });
}

function loadViewer() {
    mainWindow.loadURL(`http://localhost:${serverPort}/index.html`);
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('pick-zip', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title:      'Select Salesforce Metadata ZIP',
        filters:    [{ name: 'ZIP files', extensions: ['zip'] }],
        properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, zipPath: result.filePaths[0] };
});

ipcMain.handle('run-parser', async (event, zipPath) => {
    return new Promise((resolve) => {
        // ── Key fix: find Node.js correctly in both dev and packaged mode ─────
        // In packaged Electron, process.execPath = the app EXE, not node.
        // We bundle Node.js separately, or use the node binary from PATH.
        // Strategy: try bundled node first, fall back to system node.

        const { execFile, exec } = require('child_process');

        // Find node executable
        findNodePath((nodePath, nodeErr) => {
            if (nodeErr || !nodePath) {
                event.sender.send('parser-log', `❌ Cannot find Node.js: ${nodeErr}\n`);
                resolve({ ok: false, error: 'Node.js not found. Please install Node.js 18+ from nodejs.org' });
                return;
            }

            event.sender.send('parser-log', `Using Node: ${nodePath}\n`);
            event.sender.send('parser-log', `Parser dir: ${PARSER_DIR}\n`);
            event.sender.send('parser-log', `Output: ${INDEX_JSON}\n\n`);

            const parserScript = path.join(PARSER_DIR, 'index.js');
            const child = execFile(nodePath, [parserScript, '--zip', zipPath, '--out', INDEX_JSON], {
                cwd:     PARSER_DIR,
                timeout: 10 * 60 * 1000, // 10 minute timeout for large ZIPs
            });

            child.stdout?.on('data', d => {
                const msg = d.toString();
                console.log(msg);
                event.sender.send('parser-log', msg);
            });
            child.stderr?.on('data', d => {
                const msg = d.toString();
                console.error(msg);
                event.sender.send('parser-log', msg);
            });

            child.on('close', code => {
                if (code === 0) {
                    try {
                        fs.copyFileSync(INDEX_JSON, path.join(VIEWER_DIR, 'index.json'));
                    } catch (e) {
                        console.error('Failed to copy index.json to viewer:', e);
                    }
                    resolve({ ok: true });
                } else {
                    resolve({ ok: false, error: `Parser exited with code ${code}` });
                }
            });

            child.on('error', err => {
                resolve({ ok: false, error: err.message });
            });
        });
    });
});

ipcMain.on('open-external', (_, url) => shell.openExternal(url));

// ── Find Node.js path ─────────────────────────────────────────────────────────
function findNodePath(callback) {
    const { exec } = require('child_process');

    // 1. Check common Windows locations
    const candidates = [
        'node',                                           // system PATH
        'C:\\Program Files\\nodejs\\node.exe',
        'C:\\Program Files (x86)\\nodejs\\node.exe',
        path.join(os.homedir(), 'AppData', 'Roaming', 'nvm', 'current', 'node.exe'),
        path.join(os.homedir(), '.nvm', 'current', 'node'),
    ];

    // 2. First try `where node` / `which node`
    const whereCmd = process.platform === 'win32' ? 'where node' : 'which node';
    exec(whereCmd, (err, stdout) => {
        if (!err && stdout.trim()) {
            const nodePath = stdout.trim().split('\n')[0].trim();
            callback(nodePath, null);
            return;
        }

        // 3. Try candidates in order
        tryNext(candidates, 0, callback);
    });
}

function tryNext(candidates, i, callback) {
    if (i >= candidates.length) {
        callback(null, 'Node.js not found in any known location');
        return;
    }

    const { execFile } = require('child_process');
    execFile(candidates[i], ['--version'], { timeout: 3000 }, (err) => {
        if (!err) {
            callback(candidates[i], null);
        } else {
            tryNext(candidates, i + 1, callback);
        }
    });
}

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
            filePath = filePath.split('?')[0];

            if (!fs.existsSync(filePath)) {
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
