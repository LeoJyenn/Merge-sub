const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');

const app = express();

app.set('trust proxy', true);

const DEFAULT_USERNAME = process.env.APP_USERNAME || 'admin';
const PASSWORD = process.env.PASSWORD || 'admin';
const API_URL = process.env.API_URL || 'https://sublink.eooce.com';
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;

let CFIP = process.env.CFIP || "time.is";
let CFPORT = process.env.CFPORT || "443";
let subscriptions = [];
let nodes = '';
let SUB_TOKEN = '';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');
const LOG_DIR = path.join(DATA_DIR, 'logs');

const LOG_RETENTION_DAYS = 7;

if (!fsSync.existsSync(LOG_DIR)) {
    fsSync.mkdirSync(LOG_DIR, { recursive: true });
}

const originalLog = console.log;
const originalError = console.error;

function getLogFileName() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    return path.join(LOG_DIR, `${dateStr}.log`);
}

function writeToLogFile(type, args) {
    const now = new Date();
    const timeStr = `[${now.toLocaleTimeString('en-GB', { hour12: false })}]`;
    const msg = util.format.apply(null, args);
    const logLine = `${timeStr} [${type}] ${msg}\n`;
    try {
        fsSync.appendFileSync(getLogFileName(), logLine);
    } catch (e) {}
}

console.log = function(...args) {
    writeToLogFile('INFO', args);
    originalLog.apply(console, args);
};

console.error = function(...args) {
    writeToLogFile('ERROR', args);
    originalError.apply(console, args);
};

async function cleanOldLogs() {
    try {
        const files = await fs.readdir(LOG_DIR);
        const now = Date.now();
        const retentionMs = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

        for (const file of files) {
            if (!file.endsWith('.log')) continue;
            const filePath = path.join(LOG_DIR, file);
            const stats = await fs.stat(filePath);
            if (now - stats.mtimeMs > retentionMs) {
                await fs.unlink(filePath);
            }
        }
    } catch (e) {}
}
cleanOldLogs();
setInterval(cleanOldLogs, 24 * 60 * 60 * 1000);

app.use(express.json({ limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

let credentials = { 
    username: DEFAULT_USERNAME, 
    password: PASSWORD, 
    sub_token: '', 
    session_secret: '',
    bark_url: '',
    cf_ip: CFIP,
    cf_port: CFPORT
};

let lastBarkTime = 0;

function getCookieSecret() {
    return credentials.session_secret || crypto.randomBytes(32).toString('hex');
}

app.use((req, res, next) => cookieParser(getCookieSecret())(req, res, next));

app.use(async (req, res, next) => {
    if (SUB_TOKEN && req.path === `/${SUB_TOKEN}`) {
        const dateObj = new Date();
        const utc = dateObj.getTime() + (dateObj.getTimezoneOffset() * 60000);
        const now = new Date(utc + (3600000 * 8));
        const timeStr = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;

        let rawIP = req.headers['cf-connecting-ip'] ||
                    req.headers['x-real-ip'] ||
                    req.headers['x-forwarded-for'] ||
                    req.socket.remoteAddress || '';

        let clientIP = rawIP;
        if (clientIP.startsWith('::ffff:')) clientIP = clientIP.substring(7);
        if (clientIP.includes(',')) clientIP = clientIP.split(',')[0].trim();

        console.log(`${timeStr} 收到订阅请求 -> 来源: ${clientIP}`);

        try {
            if (req.query.CFIP && req.query.CFPORT) {
                CFIP = req.query.CFIP;
                CFPORT = req.query.CFPORT;
            }
            await loadData();
            const merged = await generateMergedSubscription();

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-store');

            const base64Data = Buffer.from(merged).toString('base64');
            res.send(base64Data);

            console.log(`${timeStr} 订阅生成成功 (${base64Data.length} bytes)`);

            if (credentials.bark_url) {
                if (Date.now() - lastBarkTime > 3000) {
                    lastBarkTime = Date.now();
                    const title = encodeURIComponent('Merge-Sub: 收到订阅请求');
                    const body = encodeURIComponent(`来源 IP:...${clientIP}\n数据大小: ${base64Data.length} bytes\n时间: ${timeStr}`);

                    let barkBase = credentials.bark_url.endsWith('/') ? credentials.bark_url : credentials.bark_url + '/';

                    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                    const host = req.get('host');
                    const iconUrl = `${protocol}://${host}/icon.png`;
                    const targetUrl = `${barkBase}${title}/${body}?icon=${encodeURIComponent(iconUrl)}&sound=alarm`;

                    axios.get(targetUrl).catch(e => console.error('Bark 推送失败:', e.message));
                }
            }

        } catch (e) {
            console.error('订阅生成错误:', e);
            res.status(500).send('Internal Server Error');
        }
    } else {
        next();
    }
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === credentials.username && password === credentials.password) {
        res.cookie('admin_session', 'valid', { httpOnly: true, signed: true, maxAge: 86400000 });
        res.json({ success: true });
    } else {
        res.status(401).json({ error: '认证失败' });
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('admin_session');
    res.redirect('/login');
});

const authMiddleware = (req, res, next) => {
    if (req.signedCookies.admin_session === 'valid') {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        next();
    } else {
        if (req.xhr || req.headers.accept?.includes('json')) {
            res.status(401).json({ error: 'Unauthorized' });
        } else {
            res.redirect('/login');
        }
    }
};

app.use(authMiddleware);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/get-sub-token', (req, res) => res.json({ token: SUB_TOKEN }));
app.get('/get-apiurl', (req, res) => res.json({ ApiUrl: API_URL }));

app.get('/admin/get-bark', (req, res) => {
    res.json({ url: credentials.bark_url || '' });
});

app.post('/admin/update-bark', async (req, res) => {
    const { url } = req.body;
    const newCredentials = { ...credentials, bark_url: url ? url.trim() : '' };
    if (await saveCredentials(newCredentials)) {
        credentials = newCredentials;
        res.json({ message: 'Bark 设置已更新' });
    } else {
        res.status(500).json({ error: '保存失败' });
    }
});

app.get('/admin/get-cf-config', (req, res) => {
    res.json({ ip: CFIP, port: CFPORT });
});

app.post('/admin/update-cf-config', async (req, res) => {
    const ip = (req.body.ip || req.body.cfip || '').toString().trim();
    const port = (req.body.port || req.body.cfport || '').toString().trim();
    const finalIp = ip || CFIP || 'time.is';
    const finalPort = port || CFPORT || '443';
    CFIP = finalIp;
    CFPORT = finalPort;
    const newCredentials = { ...credentials, cf_ip: CFIP, cf_port: CFPORT };
    if (await saveCredentials(newCredentials)) {
        credentials = newCredentials;
        res.json({ message: 'ok', ip: CFIP, port: CFPORT });
    } else {
        res.status(500).json({ error: '保存失败' });
    }
});

app.post('/admin/update-credentials', async (req, res) => {
    const { username, password, currentPassword } = req.body;
    
    if (currentPassword !== credentials.password) {
        return res.status(400).json({ error: '当前密码错误' });
    }

    const finalUsername = username && username.trim() ? username.trim() : credentials.username;

    const newCredentials = { ...credentials, username: finalUsername, password };
    
    if (await saveCredentials(newCredentials)) {
        credentials = newCredentials;
        res.json({ message: '修改成功' });
    } else {
        res.status(500).json({ error: '保存失败' });
    }
});

app.post('/admin/reset-token', async (req, res) => {
    const newToken = generateRandomString(24);
    const newCredentials = { ...credentials, sub_token: newToken };
    if (await saveCredentials(newCredentials)) {
        credentials.sub_token = newToken;
        SUB_TOKEN = newToken;
        res.json({ message: '重置成功', token: newToken });
    } else {
        res.status(500).json({ error: '保存失败' });
    }
});

app.get('/admin/backup', (req, res) => {
    res.download(DATA_FILE, 'backup.json');
});

app.post('/admin/restore', async (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: '无效的数据格式' });
    
    try {
        const newSubs = Array.isArray(data.subscriptions) ? data.subscriptions : [];
        let newNodes = '';
        if (Array.isArray(data.nodes)) newNodes = data.nodes.join('\n');
        else if (typeof data.nodes === 'string') newNodes = data.nodes;

        await saveData(newSubs, newNodes);
        res.json({ message: '数据恢复成功' });
    } catch (e) {
        res.status(500).json({ error: '恢复失败: ' + e.message });
    }
});

app.post('/admin/add-subscription', async (req, res) => {
    const url = req.body.subscription;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Invalid subscription URL' });
    if (!subscriptions.includes(url)) subscriptions.push(url);
    await saveData(subscriptions, nodes);
    res.json({ message: 'Subscription added' });
});

app.post('/admin/delete-subscription', async (req, res) => {
    const url = req.body.subscription;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Invalid subscription URL' });
    subscriptions = subscriptions.filter(s => s !== url);
    await saveData(subscriptions, nodes);
    res.json({ message: 'Subscription deleted' });
});

app.post('/admin/add-node', async (req, res) => {
    const input = req.body.node;
    if (!input || typeof input !== 'string') return res.status(400).json({ error: 'Invalid node data' });
    const lines = input.split('\n').map(l => l.trim()).filter(l => l);
    if (!nodes) nodes = lines.join('\n');
    else nodes += '\n' + lines.join('\n');
    await saveData(subscriptions, nodes);
    res.json({ message: 'Node(s) added' });
});

app.post('/admin/delete-node', async (req, res) => {
    const node = req.body.node;
    if (!node || typeof node !== 'string') return res.status(400).json({ error: 'Invalid node' });
    const nodeList = typeof nodes === 'string' ? nodes.split('\n').map(n => n.trim()).filter(n => n) : [];
    const idx = nodeList.indexOf(node.trim());
    if (idx !== -1) {
        nodeList.splice(idx, 1);
        nodes = nodeList.join('\n');
        await saveData(subscriptions, nodes);
        res.json({ message: 'Node deleted' });
    } else {
        res.status(404).json({ error: 'Node not found' });
    }
});

app.post('/admin/save-nodes', async (req, res) => {
    const input = req.body.nodes;
    if (typeof input !== 'string') return res.status(400).json({ error: 'Invalid data' });
    nodes = input;
    await saveData(subscriptions, nodes);
    res.json({ message: 'Order saved' });
});

app.get('/admin/data', (req, res) => {
    const nodeList = typeof nodes === 'string' ? nodes.split('\n').map(n => n.trim()).filter(n => n) : [];
    res.json({ subscriptions, nodes: nodeList });
});

app.use((req, res) => {
    res.status(404).send('Not Found');
});

function generateRandomString(length = 24) {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
}

async function ensureDataDir() {
    try { await fs.access(DATA_DIR); }
    catch { await fs.mkdir(DATA_DIR, { recursive: true }); }
}

async function initializeCredentialsFile() {
    try {
        try {
            await fs.access(CREDENTIALS_FILE);
            const data = await fs.readFile(CREDENTIALS_FILE, 'utf8');
            const parsed = JSON.parse(data);
            credentials = { ...credentials, ...parsed };
            let changed = false;
            if (!credentials.sub_token) { credentials.sub_token = generateRandomString(); changed = true; }
            if (!credentials.session_secret) { credentials.session_secret = generateRandomString(32); changed = true; }
            if (!credentials.cf_ip) { credentials.cf_ip = CFIP; changed = true; }
            if (!credentials.cf_port) { credentials.cf_port = CFPORT; changed = true; }
            CFIP = credentials.cf_ip || CFIP;
            CFPORT = credentials.cf_port || CFPORT;
            SUB_TOKEN = credentials.sub_token;
            if (changed) await saveCredentials(credentials);
        } catch {
            SUB_TOKEN = process.env.SUB_TOKEN || generateRandomString();
            credentials.sub_token = SUB_TOKEN;
            credentials.session_secret = generateRandomString(32);
            credentials.cf_ip = CFIP;
            credentials.cf_port = CFPORT;
            await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), 'utf8');
        }
    } catch (error) { console.error('Cred error:', error); }
}

async function saveCredentials(newCredentials) {
    try {
        await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(newCredentials, null, 2), 'utf8');
        return true;
    } catch { return false; }
}

async function initializeDataFile() {
    try {
        let data = await fs.readFile(DATA_FILE, 'utf8');
        const parsed = JSON.parse(data);
        subscriptions = parsed.subscriptions || [];
        nodes = parsed.nodes || '';
    } catch {
        await fs.writeFile(DATA_FILE, JSON.stringify({ subscriptions: [], nodes: '' }, null, 2));
        subscriptions = []; nodes = '';
    }
}

async function saveData(subs, nds) {
    const data = { subscriptions: subs, nodes: nds };
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    subscriptions = subs; nodes = nds;
}

async function loadData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const parsed = JSON.parse(data);
        subscriptions = parsed.subscriptions || [];
        nodes = parsed.nodes || '';
    } catch { subscriptions = []; nodes = ''; }
}

function decodeBase64Content(c) { return Buffer.from(c, 'base64').toString('utf-8'); }
async function fetchSubscriptionContent(url) {
    try { const r = await axios.get(url, { timeout: 8000 }); return r.data; } catch { return null; }
}

function replaceAddressAndPort(content) {
    if (!CFIP || !CFPORT) return content;
    return content.split('\n').map(line => {
        line = line.trim();
        if (!line) return line;
        if (line.startsWith('vmess://')) {
            try {
                const n = JSON.parse(decodeBase64Content(line.substring(8)));
                if ((n.net === 'ws' || n.net === 'xhttp') && n.tls === 'tls') {
                    if (!n.host || n.host !== n.add) { n.add = CFIP; n.port = parseInt(CFPORT); }
                    return 'vmess://' + Buffer.from(JSON.stringify(n)).toString('base64');
                }
            } catch {}
        } else if (line.match(/^(vless|trojan):\/\//)) {
            if ((line.includes('type=ws') || line.includes('type=xhttp')) && line.includes('security=tls')) {
                const u = new URL(line);
                if (!u.searchParams.get('host') || u.searchParams.get('host') !== u.hostname) {
                    return line.replace(/@([\w.-]+):(\d+)/, `@${CFIP}:${CFPORT}`);
                }
            }
        }
        return line;
    }).join('\n');
}

async function generateMergedSubscription() {
    const results = await Promise.all(subscriptions.map(async s => {
        const c = await fetchSubscriptionContent(s);
        return c ? replaceAddressAndPort(decodeBase64Content(c)) : null;
    }));
    return `${results.filter(Boolean).join('\n')}\n${replaceAddressAndPort(nodes)}`;
}

async function startServer() {
    await ensureDataDir();
    await initializeCredentialsFile();
    await initializeDataFile();
    await cleanOldLogs();
    app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
}
startServer();