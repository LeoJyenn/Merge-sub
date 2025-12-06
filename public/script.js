window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        window.location.reload();
    }
});

let subToken = ''; 
let apiUrl = ''; 
let sortableInstance = null;

function updateBjTime() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const bj = new Date(utc + (3600000 * 8));
    const p = n => n < 10 ? '0' + n : n;
    const str = `${bj.getFullYear()}-${p(bj.getMonth() + 1)}-${p(bj.getDate())} ${p(bj.getHours())}:${p(bj.getMinutes())}:${p(bj.getSeconds())}`;
    const el = document.getElementById('bjTime');
    if (el) el.textContent = str;
}
setInterval(updateBjTime, 1000);

function logout() {
    window.location.href = '/logout';
}

async function fetchApiUrl() {
    try {
        const response = await fetch('/get-apiurl');
        if (response.ok) {
            const data = await response.json();
            apiUrl = data.ApiUrl || 'https://sublink.eooce.com';
        } else { apiUrl = 'https://sublink.eooce.com'; }
    } catch { apiUrl = 'https://sublink.eooce.com'; }
}

async function fetchSubToken() {
    try {
        const response = await fetch('/get-sub-token');
        if (response.status === 401 || response.redirected) { 
            window.location.href = '/login'; 
            return; 
        }
        const data = await response.json();
        subToken = data.token;
    } catch (error) { console.error(error); }
}

function showAlert(message, isDanger = false, callback = null, showCancel = true) {
    const overlay = document.createElement('div');
    overlay.className = 'alert-overlay';
    
    const alertBox = document.createElement('div');
    alertBox.className = 'alert-box';
    
    const header = document.createElement('div');
    header.textContent = '>> 系统消息';
    header.style.marginBottom = '10px';
    header.style.borderBottom = '1px dashed #00ff00';
    header.style.fontSize = '14px';
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'alert-message';
    messageDiv.textContent = message;
    messageDiv.style.textAlign = 'left'; 
    messageDiv.style.fontFamily = 'monospace';
    messageDiv.style.wordBreak = 'break-all';
    messageDiv.style.marginBottom = '20px';
    
    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '10px';
    btnContainer.style.justifyContent = 'center';

    if (callback && showCancel) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'alert-button';
        cancelBtn.textContent = '[ 取消 ]';
        cancelBtn.onclick = () => document.body.removeChild(overlay);
        
        const confirmBtn = document.createElement('button');
        confirmBtn.className = isDanger ? 'alert-button alert-danger-btn' : 'alert-button';
        confirmBtn.textContent = '[ 确认执行 ]';
        confirmBtn.onclick = () => {
            document.body.removeChild(overlay);
            callback();
        };
        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(confirmBtn);
    } else {
        const button = document.createElement('button');
        button.className = 'alert-button';
        button.textContent = '[ 确认 ]';
        button.onclick = () => {
            document.body.removeChild(overlay);
            if (callback) callback();
        };
        btnContainer.appendChild(button);
    }
    
    alertBox.appendChild(header);
    alertBox.appendChild(messageDiv);
    alertBox.appendChild(btnContainer);
    overlay.appendChild(alertBox);
    document.body.appendChild(overlay);
}

async function configureBark() {
    let currentUrl = '';
    try {
        const res = await fetch('/admin/get-bark');
        if (res.ok) {
            const data = await res.json();
            currentUrl = data.url;
        }
    } catch {}

    const overlay = document.createElement('div');
    overlay.className = 'alert-overlay';
    const alertBox = document.createElement('div');
    alertBox.className = 'alert-box';
    alertBox.style.width = '500px';

    const header = document.createElement('div');
    header.textContent = '>> Bark 推送配置';
    header.style.marginBottom = '15px';
    header.style.borderBottom = '1px dashed #00ff00';

    const inputGroup = document.createElement('div');
    inputGroup.innerHTML = `
        <div style="margin-bottom:10px; font-size:13px; color:#aaa;">请输入 Bark 推送链接 (例如: https://api.day.app/YourKey)</div>
        <input type="text" id="barkInput" value="${currentUrl}" placeholder="留空则关闭通知" style="width:100%; margin-bottom:20px;">
    `;

    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '10px';
    btnContainer.style.justifyContent = 'center';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'alert-button';
    cancelBtn.textContent = '[ 取消 ]';
    cancelBtn.onclick = () => document.body.removeChild(overlay);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'alert-button';
    saveBtn.textContent = '[ 保存配置 ]';
    saveBtn.onclick = async () => {
        const newUrl = document.getElementById('barkInput').value.trim();
        try {
            const response = await fetch('/admin/update-bark', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: newUrl })
            });
            if (response.ok) {
                document.body.removeChild(overlay);
                showAlert('Bark 设置已保存！');
            } else {
                alert('保存失败');
            }
        } catch { alert('请求失败'); }
    };

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(saveBtn);
    alertBox.appendChild(header);
    alertBox.appendChild(inputGroup);
    alertBox.appendChild(btnContainer);
    overlay.appendChild(alertBox);
    document.body.appendChild(overlay);
}

function cleanNodeRemarks(nodeLink) {
    let clean = nodeLink.split('#')[0];
    clean = clean.replace(/([?&])(remarks|name|ps)=[^&]*/gi, '');
    clean = clean.replace(/&&/g, '&').replace(/\?&/g, '?');
    if (clean.endsWith('&') || clean.endsWith('?')) clean = clean.slice(0, -1);
    return clean;
}

function getNodeRemark(nodeLink) {
    if (!nodeLink) return '';
    try {
        if (nodeLink.includes('#')) return decodeURIComponent(nodeLink.split('#').pop());
        if (nodeLink.includes('?')) {
            const params = new URLSearchParams(nodeLink.split('?')[1].split('#')[0]);
            return decodeURIComponent(params.get('remarks') || params.get('name') || params.get('ps') || '');
        }
    } catch { return ''; }
    return '';
}

async function resetSubLink() {
    showAlert('警告：此操作将生成新的订阅 Token，导致旧订阅链接立即失效！\n是否继续？', true, async () => {
        try {
            const response = await fetch('/admin/reset-token', { method: 'POST' });
            if (response.status === 401 || response.redirected) { window.location.href = '/login'; return; }
            const result = await response.json();
            if (response.ok) {
                showAlert('重置成功！', false, () => window.location.reload(), false);
            } else {
                showAlert('重置失败: ' + result.error);
            }
        } catch (e) { showAlert('请求失败: ' + e.message); }
    }, true); 
}

async function addItem() {
    let input = document.getElementById('addInput').value.trim();
    const remark = document.getElementById('remarkInput').value.trim();

    if (!input) { showAlert('错误: 输入内容为空'); return; }

    if (remark) {
        const lines = input.split('\n');
        input = lines.map(line => {
            let cleanLine = line.trim();
            if (!cleanLine) return '';
            cleanLine = cleanNodeRemarks(cleanLine);
            return cleanLine + '#' + encodeURIComponent(remark);
        }).join('\n');
    }

    const isSubscription = input.startsWith('http://') || input.startsWith('https://');
    const endpoint = isSubscription ? '/admin/add-subscription' : '/admin/add-node';
    const body = isSubscription ? { subscription: input } : { node: input };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (response.status === 401 || response.redirected) { 
            showAlert('登录失效，请重新登录', false, () => window.location.href = '/login', false);
            return; 
        }

        const result = await response.json();
        
        if (response.ok) {
            if (result.error) {
                showAlert('提示: ' + result.error);
            } else {
                showAlert('成功: ' + (result.message || '操作完成'), false, () => {
                    document.getElementById('addInput').value = '';
                    document.getElementById('remarkInput').value = '';
                    setTimeout(fetchData, 200);
                }, false);
            }
        } else {
            showAlert('失败: ' + (result.error || '未知错误'));
        }
    } catch (error) { showAlert('连接失败: ' + error.message); }
}

async function copyToClipboard(element, text) { 
    try { 
        await navigator.clipboard.writeText(text);
        
        const copyTip = document.getElementById('copyTip');
        if (copyTip) {
            copyTip.style.display = 'block';
            setTimeout(() => {
                copyTip.style.display = 'none';
            }, 1000);
        }

        const originalBg = element.style.backgroundColor;
        const originalColor = element.style.color;
        
        element.style.backgroundColor = '#00ff00';
        element.style.color = '#000000';
        
        setTimeout(() => { 
            element.style.backgroundColor = originalBg || 'transparent';
            element.style.color = originalColor || 'var(--terminal-green)';
        }, 500); 
    } catch (err) { console.error(err); } 
} 

async function saveNodeOrder() {
    const items = document.querySelectorAll('.node-item');
    const nodes = Array.from(items).map(item => decodeURIComponent(item.getAttribute('data-raw'))).join('\n');
    
    try {
        await fetch('/admin/save-nodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodes })
        });
    } catch (e) { console.error(e); }
}

async function fetchData() {
    const dataContainer = document.getElementById('data');
    try {
        const response = await fetch('/admin/data?t=' + Date.now());
        if (response.status === 401 || response.redirected) { window.location.href = '/login'; return; }
        if (!response.ok) throw new Error('获取数据失败');
        
        const data = await response.json();
        let formattedText = '<div id="node-list" style="margin-top: 0;">';
        
        let nodesContent = '';
        if (typeof data.nodes === 'string') nodesContent = data.nodes;
        else if (Array.isArray(data.nodes)) nodesContent = data.nodes.join('\n');

        if (nodesContent && nodesContent.trim()) {
            formattedText += nodesContent.split('\n').map((node, index) => {
                if(!node || !node.trim()) return '';
                
                let remark = getNodeRemark(node);
                let formattedLink = node.replace(/(vmess|vless|trojan|ss|ssr|snell|juicity|hysteria|hysteria2|tuic|anytls|wireguard|socks5|https?):\/\//g, 
                    (match) => `<strong style="color: #fff; background: #004400;">${match}</strong>`);
                
                let displayHtml = remark ? `<span class="node-remark">[${remark}]</span> ${formattedLink}` : formattedLink;
                
                return `<div class="node-item" data-raw="${encodeURIComponent(node)}" onclick="copyToClipboard(this, decodeURIComponent('${encodeURIComponent(node)}'))"> > ${displayHtml}</div>`;
            }).join('');
        } else {
            formattedText += '<div style="color:#008f00; font-style:italic;">[ 暂无节点数据 ]</div>';
        }
        
        formattedText += '</div>';
        dataContainer.innerHTML = formattedText;

        if (sortableInstance) {
            sortableInstance.destroy();
            sortableInstance = null;
        }

        const listEl = document.getElementById('node-list');
        if (listEl && nodesContent && nodesContent.trim()) {
            sortableInstance = new Sortable(listEl, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                delay: 200, 
                delayOnTouchOnly: true, 
                onEnd: function() {
                    saveNodeOrder();
                }
            });
        }

    } catch (error) { dataContainer.textContent = '状态: 需要登录或服务器离线'; }
}

async function showSubscriptionInfo() {
    try {
        const response = await fetch('/get-sub-token');
        if (response.status === 401 || response.redirected) { window.location.href = '/login'; return; }
        
        const data = await response.json();
        subToken = data.token;
        const currentDomain = window.location.origin;
        
        const overlay = document.createElement('div');
        overlay.className = 'alert-overlay';
        const alertBox = document.createElement('div');
        alertBox.className = 'alert-box';
        
        const header = document.createElement('h3');
        header.textContent = '>> 系统生成的链接';
        header.style.borderBottom = '1px solid #00ff00';
        header.style.paddingBottom = '8px';
        header.style.marginTop = '0';
        header.style.fontSize = '14px';
        alertBox.appendChild(header);
        
        const createLine = (label, url) => {
            const line = document.createElement('div');
            line.className = 'subscription-line';
            const labelDiv = document.createElement('div');
            labelDiv.textContent = '> ' + label;
            labelDiv.style.color = '#008f00';
            labelDiv.style.fontWeight = 'bold';
            labelDiv.style.marginBottom = '4px';
            const urlDiv = document.createElement('div');
            urlDiv.className = 'subscription-url';
            urlDiv.textContent = url;
            urlDiv.onclick = async () => {
                await navigator.clipboard.writeText(url);
                const original = urlDiv.textContent;
                urlDiv.textContent = '[ 链接已复制 ]';
                urlDiv.style.backgroundColor = '#00ff00';
                urlDiv.style.color = 'black';
                setTimeout(() => { urlDiv.textContent = original; urlDiv.style.backgroundColor = '#002200'; urlDiv.style.color = '#00ff00'; }, 1000);
            };
            line.appendChild(labelDiv);
            line.appendChild(urlDiv);
            return line;
        };

        alertBox.appendChild(createLine('默认订阅 (Base64)', `${currentDomain}/${subToken}`));
        alertBox.appendChild(createLine('优选IP订阅', `${currentDomain}/${subToken}?CFIP=time.is&CFPORT=443`));
        alertBox.appendChild(createLine('Clash 配置链接', `${apiUrl}/clash?config=${currentDomain}/${subToken}`));
        alertBox.appendChild(createLine('Sing-box 配置链接', `${apiUrl}/singbox?config=${currentDomain}/${subToken}`));
        
        const closeButton = document.createElement('button');
        closeButton.className = 'alert-button';
        closeButton.textContent = '[ 关闭窗口 ]';
        closeButton.onclick = () => document.body.removeChild(overlay);
        
        alertBox.appendChild(closeButton);
        overlay.appendChild(alertBox);
        document.body.appendChild(overlay);
    } catch { showAlert('系统错误: 无法检索链接'); }
}

async function deleteItem() {
    const input = document.getElementById('deleteInput').value.trim();
    if (!input) { showAlert('错误: 删除目标为空'); return; }

    await fetchApiUrl();
    const isSubscription = input.startsWith('http://') || input.startsWith('https://');
    const endpoint = isSubscription ? '/admin/delete-subscription' : '/admin/delete-node';
    const body = isSubscription ? { subscription: input } : { node: input };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (response.status === 401 || response.redirected) { 
            window.location.href = '/login'; 
            return; 
        }
        
        const result = await response.json();

        if (response.ok) {
            if (result.error) {
                showAlert('提示: ' + result.error);
            } else {
                document.getElementById('deleteInput').value = '';
                setTimeout(fetchData, 500); 
                showAlert(result.message ? '成功: ' + result.message : '操作完成', false, null, false);
            }
        } else {
            showAlert('提示: ' + (result.error || '删除失败'));
        }
    } catch (error) { showAlert('失败: ' + (error.message || '未知错误')); }
}

function backupData() {
    window.location.href = '/admin/backup';
}

function restoreData() {
    document.getElementById('restoreInput').click();
}

document.getElementById('restoreInput').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const json = JSON.parse(e.target.result);
            const response = await fetch('/admin/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(json)
            });

            if (response.status === 401) { window.location.href = '/login'; return; }
            const result = await response.json();
            
            if (response.ok) {
                showAlert('数据恢复成功！', false, () => window.location.reload(), false);
            } else {
                showAlert('恢复失败: ' + result.error);
            }
        } catch (err) {
            showAlert('文件解析失败，请确保是有效的备份 JSON');
        }
    };
    reader.readAsText(file);
    event.target.value = ''; 
});

function initMatrixEffect() {
    const container = document.querySelector('.matrix-bg');
    if (!container) return;
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    
    const cols = Math.floor(width / 20);
    const ypos = Array(cols).fill(0);
    
    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    function matrix() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#0f0';
        ctx.font = '15pt monospace';
        
        ypos.forEach((y, ind) => {
            const text = String.fromCharCode(Math.random() * 128);
            const x = ind * 20;
            ctx.fillText(text, x, y);
            if (y > 100 + Math.random() * 10000) ypos[ind] = 0;
            else ypos[ind] = y + 20;
        });
    }
    setInterval(matrix, 50);
}

document.addEventListener('DOMContentLoaded', async () => {
    initMatrixEffect();
    await fetchApiUrl(); 
    await fetchSubToken();
    await fetchData();
    updateBjTime();
});
