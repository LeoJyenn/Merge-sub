window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        window.location.reload();
    }
});

let subToken = '';
let apiUrl = '';
let sortableInstance = null;
let allNodes = [];
let typeCounts = {};
let currentFilterKey = null;
let overlayCount = 0;
let saveCfConfigTimer = null;
let activeRemarkEdit = null;
let modalShell = null;
let lastScrollTop = 0;
let lastScrollAnchor = null;
let freezeTarget = null;


function lockBodyScroll() {
    if (overlayCount === 0) {
        const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.dataset.scrollTop = String(scrollTop);
        document.body.dataset.prevOverflow = document.body.style.overflow || '';
        document.body.dataset.prevPaddingRight = document.body.style.paddingRight || '';
        document.documentElement.classList.add('modal-locked');
        document.body.classList.add('modal-locked');
        document.body.style.overflow = 'hidden';
        if (scrollbarWidth > 0) {
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        }
        freezeTarget = document.querySelector('.container') || document.body.firstElementChild;
        if (freezeTarget) {
            freezeTarget.classList.add('frozen');
            freezeTarget.style.setProperty('--freeze-offset', `-${scrollTop}px`);
        }
        window.scrollTo({ top: scrollTop, behavior: 'auto' });
        requestAnimationFrame(() => {
            window.scrollTo({ top: scrollTop, behavior: 'auto' });
        });
    }
    overlayCount++;
}

function unlockBodyScroll() {
    overlayCount = Math.max(overlayCount - 1, 0);
    if (overlayCount === 0) {
        const scrollTop = parseInt(document.body.dataset.scrollTop || '0', 10);
        document.documentElement.classList.remove('modal-locked');
        document.body.classList.remove('modal-locked');
        document.body.style.overflow = document.body.dataset.prevOverflow || '';
        document.body.style.paddingRight = document.body.dataset.prevPaddingRight || '';
        if (freezeTarget) {
            freezeTarget.classList.remove('frozen');
            freezeTarget.style.removeProperty('--freeze-offset');
            freezeTarget = null;
        }
        window.scrollTo({ top: scrollTop, behavior: 'auto' });
        requestAnimationFrame(() => {
            window.scrollTo({ top: scrollTop, behavior: 'auto' });
        });
    }
}

function attachOverlayTouchBlock(overlay) {
    overlay.addEventListener('touchmove', function (e) {
        e.preventDefault();
    }, { passive: false });
    overlay.addEventListener('wheel', function (e) {
        e.preventDefault();
    }, { passive: false });
}

function getModalShell() {
    if (modalShell) return modalShell;
    const overlay = document.createElement('div');
    overlay.className = 'alert-overlay';
    attachOverlayTouchBlock(overlay);
    const alertBox = document.createElement('div');
    alertBox.className = 'alert-box';
    const title = document.createElement('div');
    title.className = 'alert-title';
    const body = document.createElement('div');
    body.className = 'alert-body';
    const footer = document.createElement('div');
    footer.className = 'alert-footer';
    alertBox.appendChild(title);
    alertBox.appendChild(body);
    alertBox.appendChild(footer);
    overlay.appendChild(alertBox);
    modalShell = { overlay, alertBox, title, body, footer };
    return modalShell;
}

function openModal(titleText, width) {
    const shell = getModalShell();
    shell.title.textContent = titleText || '';
    shell.body.innerHTML = '';
    shell.footer.innerHTML = '';
    if (width) shell.alertBox.style.width = width;
    else shell.alertBox.style.width = '';
    if (!document.body.contains(shell.overlay)) {
        lockBodyScroll();
        document.body.appendChild(shell.overlay);
    }
    return shell;
}

function closeModal() {
    if (!modalShell) return;
    if (document.body.contains(modalShell.overlay)) {
        document.body.removeChild(modalShell.overlay);
        unlockBodyScroll();
    }
}

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
        } else {
            apiUrl = 'https://sublink.eooce.com';
        }
    } catch {
        apiUrl = 'https://sublink.eooce.com';
    }
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
    } catch (error) {
        console.error(error);
    }
}

function showAlert(message, isDanger = false, callback = null, showCancel = true) {
    const shell = openModal('系统提示');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'alert-message';
    messageDiv.textContent = message;
    shell.body.appendChild(messageDiv);
    if (callback && showCancel) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'alert-button alert-button-ghost';
        cancelBtn.textContent = '取消';
        cancelBtn.onclick = () => closeModal();
        const confirmBtn = document.createElement('button');
        confirmBtn.className = isDanger ? 'alert-button alert-danger-btn' : 'alert-button';
        confirmBtn.textContent = '确认';
        confirmBtn.onclick = () => {
            closeModal();
            callback();
        };
        shell.footer.appendChild(cancelBtn);
        shell.footer.appendChild(confirmBtn);
    } else {
        const button = document.createElement('button');
        button.className = 'alert-button';
        button.textContent = '确认';
        button.onclick = () => {
            closeModal();
            if (callback) callback();
        };
        shell.footer.appendChild(button);
    }
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
    const shell = openModal('Bark 推送配置', '480px');
    const tip = document.createElement('div');
    tip.className = 'alert-message';
    tip.textContent = '请输入 Bark 推送链接 (例如: https://api.day.app/YourKey)。留空则关闭通知。';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'barkInput';
    input.value = currentUrl || '';
    input.placeholder = 'https://api.day.app/YourKey';
    input.style.width = '100%';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid #e0e4f2';
    input.style.padding = '6px 10px';
    input.style.fontSize = '13px';
    input.style.outline = 'none';
    input.onfocus = () => {
        input.style.borderColor = '#6a5dfc';
        input.style.boxShadow = '0 0 0 1px rgba(106,93,252,0.18)';
    };
    input.onblur = () => {
        input.style.boxShadow = 'none';
        input.style.borderColor = '#e0e4f2';
    };
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'alert-button alert-button-ghost';
    cancelBtn.textContent = '取消';
    cancelBtn.onclick = () => {
        closeModal();
    };
    const saveBtn = document.createElement('button');
    saveBtn.className = 'alert-button';
    saveBtn.textContent = '保存配置';
    saveBtn.onclick = async () => {
        const newUrl = document.getElementById('barkInput').value.trim();
        try {
            const response = await fetch('/admin/update-bark', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: newUrl })
            });
            if (response.ok) {
                closeModal();
                showAlert('Bark 设置已保存！', false, null, false);
            } else {
                alert('保存失败');
            }
        } catch {
            alert('请求失败');
        }
    };
    shell.body.appendChild(tip);
    shell.body.appendChild(input);
    shell.footer.appendChild(cancelBtn);
    shell.footer.appendChild(saveBtn);
}

function cleanNodeRemarks(nodeLink) {
    let clean = nodeLink.split('#')[0];
    clean = clean.replace(/([?&])(remarks|remark|name|ps|tag|label|alias|desc|title)=[^&]*/gi, '');
    clean = clean.replace(/&&/g, '&').replace(/\?&/g, '?');
    if (clean.endsWith('&') || clean.endsWith('?')) clean = clean.slice(0, -1);
    return clean;
}


function decodeSafe(str) {
    try {
        return decodeURIComponent(str);
    } catch {
        return str;
    }
}

function getNodeRemark(nodeLink) {
    if (!nodeLink) return '';
    try {
        let remark = '';
        const qIndex = nodeLink.indexOf('?');
        if (qIndex !== -1) {
            let qsPart = nodeLink.substring(qIndex + 1);
            const hashIndex = qsPart.indexOf('#');
            if (hashIndex !== -1) {
                qsPart = qsPart.substring(0, hashIndex);
            }
            const params = new URLSearchParams(qsPart);
            remark = params.get('remarks') || params.get('remark') || params.get('name') || params.get('ps') || params.get('tag') || params.get('label') || params.get('alias') || params.get('desc') || params.get('title') || '';
        }
        if (!remark && nodeLink.includes('#')) {
            const hashPart = nodeLink.split('#').slice(1).join('#');
            remark = hashPart;
        }
        if (!remark && nodeLink.startsWith('vmess://')) {
            const b64 = nodeLink.slice(8).trim();
            try {
                const jsonStr = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
                const obj = JSON.parse(jsonStr);
                remark = obj.ps || obj.name || obj.remark || obj.tag || '';
            } catch {}
        }
        if (!remark && nodeLink.startsWith('ssr://')) {
            const b64 = nodeLink.slice(6).trim();
            try {
                const jsonStr = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
                if (jsonStr && jsonStr.includes('remarks=')) {
                    const parts = jsonStr.split('/?');
                    if (parts[1]) {
                        const params = new URLSearchParams(parts[1]);
                        const r = params.get('remarks') || params.get('remark') || params.get('tag');
                        if (r) {
                            remark = decodeSafe(atob(r.replace(/-/g, '+').replace(/_/g, '/')));
                        }
                    }
                }
            } catch {}
        }
        if (!remark && (nodeLink.startsWith('ss://') || nodeLink.startsWith('trojan://') || nodeLink.startsWith('vless://') || nodeLink.startsWith('tuic://') || nodeLink.startsWith('hysteria://') || nodeLink.startsWith('hysteria2://') || nodeLink.startsWith('hy2://') || nodeLink.startsWith('wireguard://') || nodeLink.startsWith('wg://'))) {
            try {
                const u = new URL(nodeLink);
                if (u.hash) {
                    remark = u.hash.replace('#', '');
                }
            } catch {}
        }
        if (!remark) return '';
        return decodeSafe(remark);
    } catch {
        return '';
    }
}


function getProtocol(node) {
    if (!node) return '未知';
    if (node.startsWith('vmess://')) return 'VMESS';
    if (node.startsWith('vless://')) return 'VLESS';
    if (node.startsWith('trojan://')) return 'TROJAN';
    if (node.startsWith('ss://')) return 'SS';
    if (node.startsWith('ssr://')) return 'SSR';
    if (node.startsWith('hysteria://') || node.startsWith('hysteria2://')) return 'Hysteria';
    if (node.startsWith('tuic://')) return 'TUIC';
    if (node.startsWith('wireguard://') || node.startsWith('wg://')) return 'WireGuard';
    if (node.startsWith('hy2://')) return 'Hysteria2';
    return '其它';
}

function encodeNode(node) {
    return encodeURIComponent(node).replace(/'/g, '%27');
}

function getNodeItem(encoded) {
    const escape = window.CSS && CSS.escape ? CSS.escape : (value) => value.replace(/"/g, '\\"');
    return document.querySelector(`.node-item[data-raw="${escape(encoded)}"]`);
}

function updateNodeCount() {
    const countEl = document.getElementById('nodeCount');
    if (!countEl) return;
    if (allNodes.length) countEl.textContent = '共 ' + allNodes.length + ' 个节点';
    else countEl.textContent = '暂无节点';
}

function updateNodeIndexInputs(listEl) {
    const allInputs = listEl.querySelectorAll('.node-index-input');
    allInputs.forEach((el, idx) => {
        el.value = idx + 1;
    });
}

function rememberScrollPosition() {
    lastScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
}

function restoreScrollPosition() {
    if (lastScrollTop) {
        window.scrollTo({ top: lastScrollTop, behavior: 'auto' });
    }
}

function captureScrollAnchor(item) {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    if (!item) {
        return { scrollTop };
    }
    const anchor = item.nextElementSibling || item.previousElementSibling;
    if (!anchor) {
        return { scrollTop };
    }
    return {
        scrollTop,
        anchor,
        anchorTop: anchor.getBoundingClientRect().top
    };
}

function restoreScrollAnchor(anchorInfo) {
    if (!anchorInfo || !anchorInfo.anchor || !document.body.contains(anchorInfo.anchor)) {
        if (anchorInfo && typeof anchorInfo.scrollTop === 'number') {
            window.scrollTo({ top: anchorInfo.scrollTop, behavior: 'auto' });
        }
        return;
    }
    const newTop = anchorInfo.anchor.getBoundingClientRect().top;
    const target = anchorInfo.scrollTop + (newTop - anchorInfo.anchorTop);
    window.scrollTo({ top: target, behavior: 'auto' });
    requestAnimationFrame(() => {
        window.scrollTo({ top: target, behavior: 'auto' });
    });
}

function updateNodeItemDom(item, node, encoded, remarkText) {
    item.setAttribute('data-raw', encoded);
    const protocolEl = item.querySelector('.node-protocol');
    if (protocolEl) protocolEl.textContent = getProtocol(node);
    const contentBox = item.querySelector('.node-content-box');
    if (contentBox) contentBox.textContent = node;
    const remarkContainer = item.querySelector('.node-col-remark');
    if (remarkContainer) restoreRemarkCell(remarkContainer, remarkText, encoded);
    const editBtn = item.querySelector('.node-btn-secondary');
    if (editBtn) editBtn.setAttribute('onclick', `startEditRemark(this, '${encoded}'); event.stopPropagation();`);
    const copyBtn = item.querySelector('.node-col-actions .node-btn:not(.node-btn-secondary):not(.node-btn-danger)');
    if (copyBtn) copyBtn.setAttribute('onclick', `copyNode(this, '${encoded}'); event.stopPropagation();`);
    const deleteBtn = item.querySelector('.node-btn-danger');
    if (deleteBtn) deleteBtn.setAttribute('onclick', `deleteNode('${encoded}'); event.stopPropagation();`);
}

function removeNodeFromDom(encoded) {
    const item = getNodeItem(encoded);
    if (!item) return false;
    const listEl = item.closest('.node-list');
    item.remove();
    if (listEl) {
        if (!listEl.querySelector('.node-item')) {
            const dataContainer = document.getElementById('data');
            if (dataContainer) {
                dataContainer.innerHTML = '<div class="node-list"><div class="node-empty">暂无节点数据</div></div>';
            }
        } else {
            updateNodeIndexInputs(listEl);
        }
    }
    return true;
}

async function resetSubLink() {
    showAlert('此操作将生成新的订阅 Token，旧订阅链接将失效，确认继续？', true, async () => {
        try {
            const response = await fetch('/admin/reset-token', { method: 'POST' });
            if (response.status === 401 || response.redirected) {
                window.location.href = '/login';
                return;
            }
            const result = await response.json();
            if (response.ok) {
                showAlert('重置成功！', false, () => window.location.reload(), false);
            } else {
                showAlert('重置失败: ' + result.error);
            }
        } catch (e) {
            showAlert('请求失败: ' + e.message);
        }
    }, true);
}

async function addItem() {
    let input = document.getElementById('addInput').value.trim();
    const remark = document.getElementById('remarkInput').value.trim();
    if (!input) {
        showAlert('节点内容不能为空');
        return;
    }
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
                let messageText;
                if (isSubscription) {
                    messageText = '订阅添加完成';
                } else {
                    const addedLines = input.split('\n').map(l => l.trim()).filter(l => l);
                    const count = addedLines.length;
                    messageText = count + ' 条节点添加完成';
                }
                showAlert(messageText, false, () => {
                    document.getElementById('addInput').value = '';
                    document.getElementById('remarkInput').value = '';
                    setTimeout(fetchData, 200);
                }, false);
            }
        } else {
            showAlert('失败: ' + (result.error || '未知错误'));
        }
    } catch (error) {
        showAlert('连接失败: ' + error.message);
    }
}

function copyText(text) {
    return new Promise((resolve, reject) => {
        function legacyCopy() {
            try {
                const span = document.createElement('span');
                span.textContent = text;
                span.style.whiteSpace = 'pre';
                span.style.position = 'fixed';
                span.style.top = '-9999px';
                span.style.left = '0';
                document.body.appendChild(span);
                const selection = window.getSelection();
                selection.removeAllRanges();
                const range = document.createRange();
                range.selectNodeContents(span);
                selection.removeAllRanges();
                selection.addRange(range);
                const ok = document.execCommand('copy');
                selection.removeAllRanges();
                document.body.removeChild(span);
                if (!ok) {
                    reject(new Error('复制失败'));
                } else {
                    resolve();
                }
            } catch (e) {
                reject(e);
            }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(resolve).catch(() => {
                legacyCopy();
            });
        } else {
            legacyCopy();
        }
    });
}

async function copyToClipboard(element, text) {
    try {
        await copyText(text);
        if (element) {
            const original = element.textContent;
            element.textContent = '已复制';
            element.disabled = true;
            setTimeout(() => {
                element.textContent = original;
                element.disabled = false;
            }, 900);
        }
    } catch (err) {
        console.error(err);
    }
}

async function saveNodeOrder() {
    const items = document.querySelectorAll('.node-item');
    if (!items.length) return;
    const nodes = Array.from(items).map(item => decodeURIComponent(item.getAttribute('data-raw')));
    allNodes = nodes.slice();
    try {
        await fetch('/admin/save-nodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodes: nodes.join('\n') })
        });
    } catch (e) {
        console.error(e);
    }
}

function changeNodeIndex(input) {
    const item = input.closest('.node-item');
    const list = document.querySelector('.node-list');
    if (!item || !list) return;
    const items = Array.from(list.children);
    const oldIndex = items.indexOf(item);
    if (oldIndex === -1) return;
    let target = parseInt(input.value, 10);
    if (isNaN(target)) target = oldIndex + 1;
    if (target < 1) target = 1;
    if (target > items.length) target = items.length;
    if (target === oldIndex + 1) {
        input.value = target;
        return;
    }
    list.removeChild(item);
    if (target - 1 >= list.children.length) {
        list.appendChild(item);
    } else {
        list.insertBefore(item, list.children[target - 1]);
    }
    updateNodeIndexInputs(list);
    saveNodeOrder();
}

function renderTypeChips() {
    const chipsContainer = document.getElementById('typeChips');
    if (!chipsContainer) return;
    typeCounts = {};
    allNodes.forEach(node => {
        const type = getProtocol(node);
        typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    const entries = Object.entries(typeCounts);
    if (!entries.length) {
        chipsContainer.innerHTML = '';
        return;
    }
    let html = '';
    const total = allNodes.length;
    const activeKey = currentFilterKey;
    html += `<button class="chip-type ${!activeKey ? 'chip-type-active' : ''}" onclick="filterByType(null)">全部 ${total}</button>`;
    entries.forEach(([type, count]) => {
        html += `<button class="chip-type ${activeKey === type ? 'chip-type-active' : ''}" onclick="filterByType('${type}')">${type} ${count}</button>`;
    });
    chipsContainer.innerHTML = html;
}

function filterByType(type) {
    if (currentFilterKey === type) {
        currentFilterKey = null;
    } else {
        currentFilterKey = type;
    }
    renderNodeList();
}

function renderNodeList() {
    const dataContainer = document.getElementById('data');
    if (!dataContainer) return;
    rememberScrollPosition();
    const filterKey = currentFilterKey;
    const displayNodes = filterKey ? allNodes.filter(n => getProtocol(n) === filterKey) : allNodes.slice();
    updateNodeCount();
    renderTypeChips();
    let html = '<div class="node-list">';
    if (displayNodes.length) {
        html += displayNodes.map((node, index) => {
            const remark = getNodeRemark(node);
            const remarkText = remark || '';
            const formattedLink = node;
            const encoded = encodeNode(node);
            const remarkCell = remarkText ? `<span class="node-remark" onclick="startEditRemark(this, '${encoded}'); event.stopPropagation();">${remarkText}</span>` : `<span class="node-remark node-remark-empty" onclick="startEditRemark(this, '${encoded}'); event.stopPropagation();">未备注</span>`;
            return `
<div class="node-item" data-raw="${encoded}">
    <div class="node-col node-col-index">
        <input type="number" class="node-index-input" value="${index + 1}" min="1" onchange="changeNodeIndex(this)">
        <span class="node-protocol">${getProtocol(node)}</span>
    </div>
    <div class="node-col node-col-remark">${remarkCell}</div>
    <div class="node-col node-col-content">
        <div class="node-content-box">${formattedLink}</div>
    </div>
    <div class="node-col node-col-actions">
        <button class="node-btn node-btn-secondary" onclick="startEditRemark(this, '${encoded}'); event.stopPropagation();">编辑备注</button>
        <button class="node-btn" onclick="copyNode(this, '${encoded}'); event.stopPropagation();">复制</button>
        <button class="node-btn node-btn-danger" onclick="deleteNode('${encoded}'); event.stopPropagation();">删除</button>
    </div>
</div>`;
        }).join('');
    } else {
        html += '<div class="node-empty">暂无节点数据</div>';
    }
    html += '</div>';
    dataContainer.innerHTML = html;
    if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
    }
    restoreScrollPosition();
}


async function fetchData() {
    const dataContainer = document.getElementById('data');
    try {
        const response = await fetch('/admin/data?t=' + Date.now());
        if (response.status === 401 || response.redirected) {
            window.location.href = '/login';
            return;
        }
        if (!response.ok) throw new Error('获取数据失败');
        const data = await response.json();
        let nodesContent = '';
        if (typeof data.nodes === 'string') nodesContent = data.nodes;
        else if (Array.isArray(data.nodes)) nodesContent = data.nodes.join('\n');
        allNodes = [];
        if (nodesContent && nodesContent.trim()) {
            allNodes = nodesContent.split('\n').map(n => n.trim()).filter(n => n);
        }
        renderNodeList();
    } catch (error) {
        if (dataContainer) dataContainer.textContent = '状态: 需要登录或服务器离线';
        const countEl = document.getElementById('nodeCount');
        if (countEl) countEl.textContent = '暂无法获取节点';
    }
}

function copyNode(element, encoded) {
    const text = decodeURIComponent(encoded);
    copyToClipboard(element, text);
}

async function deleteNode(encoded) {
    const node = decodeURIComponent(encoded);
    if (!node) return;
    await fetchApiUrl();
    const currentItem = getNodeItem(encoded);
    lastScrollAnchor = captureScrollAnchor(currentItem);
    const endpoint = '/admin/delete-node';
    const body = { node: node };
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
                rememberScrollPosition();
                const idx = allNodes.indexOf(node);
                if (idx !== -1) allNodes.splice(idx, 1);
                const removed = removeNodeFromDom(encoded);
                updateNodeCount();
                renderTypeChips();
                if (!removed) {
                    renderNodeList();
                }
                restoreScrollAnchor(lastScrollAnchor);
                const remark = getNodeRemark(node);
                const displayRemark = remark ? remark : '未备注';
                showAlert('节点删除完成：' + displayRemark, false, null, false);
            }
        } else {
            showAlert('提示: ' + (result.error || '删除失败'));
        }
    } catch (error) {
        showAlert('失败: ' + (error.message || '未知错误'));
    }
}

async function saveCfConfig(ip, port) {
    try {
        localStorage.setItem('mergeSub_cfip', ip);
    } catch {}
    try {
        localStorage.setItem('mergeSub_cfport', port);
    } catch {}
    try {
        await fetch('/admin/update-cf-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ip,
                port,
                cfip: ip,
                cfport: port
            })
        });
    } catch {}
}

function updateNodeRemark(node, newRemark) {
    const cleanLine = cleanNodeRemarks(node);
    if (!newRemark) return cleanLine;
    return cleanLine + '#' + encodeURIComponent(newRemark);
}

function startEditRemark(triggerEl, encoded) {
    const node = decodeURIComponent(encoded);
    if (!node) return;
    if (activeRemarkEdit && activeRemarkEdit.encoded !== encoded) {
        cancelRemarkEdit(activeRemarkEdit.input, activeRemarkEdit.original, activeRemarkEdit.encoded);
    }
    let remarkContainer = triggerEl.closest('.node-col-remark');
    if (!remarkContainer) {
        const escape = window.CSS && CSS.escape ? CSS.escape : (value) => value.replace(/"/g, '\\"');
        const item = document.querySelector(`.node-item[data-raw="${escape(encoded)}"]`);
        if (item) {
            remarkContainer = item.querySelector('.node-col-remark');
        }
    }
    if (!remarkContainer) return;
    const remarkSpan = remarkContainer.querySelector('.node-remark');
    const originalText = remarkSpan ? remarkSpan.textContent.trim() : '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'node-remark-edit';
    input.value = originalText === '未备注' ? '' : originalText;
    input.placeholder = '备注';
    remarkContainer.innerHTML = '';
    remarkContainer.appendChild(input);
    input.focus();
    input.select();
    const save = async () => {
        const newRemark = input.value.trim();
        await saveRemarkEdit(input, node, newRemark, originalText, encoded);
    };
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            save();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelRemarkEdit(input, originalText, encoded);
        }
    });
    input.addEventListener('blur', () => {
        save();
    });
    activeRemarkEdit = { input, original: originalText, encoded };
}

async function saveRemarkEdit(input, node, newRemark, originalText, encoded) {
    const remarkContainer = input.closest('.node-col-remark');
    if (!remarkContainer) return;
    const updatedNode = updateNodeRemark(node, newRemark);
    if (updatedNode === node) {
        restoreRemarkCell(remarkContainer, originalText, encoded);
        activeRemarkEdit = null;
        return;
    }
    const idx = allNodes.indexOf(node);
    if (idx === -1) {
        restoreRemarkCell(remarkContainer, originalText, encoded);
        activeRemarkEdit = null;
        return;
    }
    allNodes[idx] = updatedNode;
    try {
        const response = await fetch('/admin/update-node-remark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                oldNode: node,
                newNode: updatedNode
            })
        });
        if (!response.ok) {
            throw new Error('update failed');
        }
        const newEncoded = encodeNode(updatedNode);
        const item = input.closest('.node-item') || getNodeItem(encoded);
        if (item) {
            updateNodeItemDom(item, updatedNode, newEncoded, newRemark);
        } else {
            renderNodeList();
        }
    } catch (e) {
        allNodes[idx] = node;
        restoreRemarkCell(remarkContainer, originalText, encoded);
        showAlert('备注更新失败');
    } finally {
        activeRemarkEdit = null;
    }
}

function cancelRemarkEdit(input, originalText, encoded) {
    const remarkContainer = input.closest('.node-col-remark');
    if (!remarkContainer) return;
    restoreRemarkCell(remarkContainer, originalText, encoded);
    activeRemarkEdit = null;
}

function restoreRemarkCell(container, originalText, encoded) {
    const text = originalText && originalText !== '未备注' ? originalText : '未备注';
    container.innerHTML = `<span class="node-remark ${text === '未备注' ? 'node-remark-empty' : ''}" onclick="startEditRemark(this, '${encoded}'); event.stopPropagation();">${text}</span>`;
}


async function showSubscriptionInfo() {
    try {
        const response = await fetch('/get-sub-token?t=' + Date.now());
        if (response.status === 401 || response.redirected) {
            window.location.href = '/login';
            return;
        }
        const data = await response.json();
        subToken = data.token;
        const currentDomain = window.location.origin;
        let cfIp = '';
        let cfPort = '';
        try {
            const cfgRes = await fetch('/admin/get-cf-config?t=' + Date.now());
            if (cfgRes.ok) {
                const cfg = await cfgRes.json();
                if (cfg) {
                    const ipVal = cfg.ip || cfg.cfip || cfg.cfIp || cfg.CFIP;
                    const portVal = cfg.port || cfg.cfport || cfg.cfPort || cfg.CFPORT;
                    if (ipVal) cfIp = String(ipVal);
                    if (portVal) cfPort = String(portVal);
                }
            }
        } catch {}
        if (!cfIp) {
            try {
                cfIp = localStorage.getItem('mergeSub_cfip') || '';
            } catch {
                cfIp = '';
            }
        }
        if (!cfPort) {
            try {
                cfPort = localStorage.getItem('mergeSub_cfport') || '';
            } catch {
                cfPort = '';
            }
        }
        if (!cfIp) cfIp = 'time.is';
        if (!cfPort) cfPort = '443';
        const cfState = { ip: cfIp, port: cfPort };
        const shell = openModal('系统生成的订阅链接');
        const createLine = (label, url, isCustom) => {
            const line = document.createElement('div');
            line.className = 'subscription-line';
            const labelDiv = document.createElement('div');
            labelDiv.textContent = label;
            labelDiv.style.fontSize = '13px';
            labelDiv.style.color = '#4b5563';
            line.appendChild(labelDiv);
            if (isCustom) {
                const cfgRow = document.createElement('div');
                cfgRow.className = 'subscription-config-row';
                const ipLabel = document.createElement('span');
                ipLabel.className = 'subscription-config-label';
                ipLabel.textContent = 'CF IP';
                const ipInput = document.createElement('input');
                ipInput.className = 'subscription-config-input';
                ipInput.value = cfState.ip || 'time.is';
                const portLabel = document.createElement('span');
                portLabel.className = 'subscription-config-label';
                portLabel.textContent = '端口';
                const portInput = document.createElement('input');
                portInput.className = 'subscription-config-input';
                portInput.value = cfState.port || '443';
                cfgRow.appendChild(ipLabel);
                cfgRow.appendChild(ipInput);
                cfgRow.appendChild(portLabel);
                cfgRow.appendChild(portInput);
                line.appendChild(cfgRow);
                const urlDiv = document.createElement('div');
                urlDiv.className = 'subscription-url';
                const textSpan = document.createElement('span');
                textSpan.className = 'subscription-url-text';
                const tipSpan = document.createElement('span');
                tipSpan.className = 'subscription-url-tip';
                tipSpan.textContent = '已复制';
                const updateUrl = () => {
                    const ip = ipInput.value.trim() || 'time.is';
                    const port = portInput.value.trim() || '443';
                    cfState.ip = ip;
                    cfState.port = port;
                    textSpan.textContent = `${currentDomain}/${subToken}?CFIP=${encodeURIComponent(ip)}&CFPORT=${encodeURIComponent(port)}`;
                };
                ipInput.oninput = updateUrl;
                portInput.oninput = updateUrl;
                updateUrl();
                const saveButton = document.createElement('button');
                saveButton.className = 'alert-button';
                saveButton.textContent = '保存优选 IP';
                saveButton.style.marginTop = '8px';
                saveButton.onclick = async () => {
                    await saveCfConfig(cfState.ip || 'time.is', cfState.port || '443');
                    showAlert('优选 IP 已保存', false, null, false);
                };
                urlDiv.addEventListener('click', async function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        await copyText(textSpan.textContent);
                        tipSpan.classList.add('subscription-url-tip-active');
                        setTimeout(() => {
                            tipSpan.classList.remove('subscription-url-tip-active');
                        }, 900);
                    } catch (err) {
                        console.error(err);
                    }
                }, { passive: false });
                urlDiv.appendChild(textSpan);
                urlDiv.appendChild(tipSpan);
                line.appendChild(urlDiv);
                line.appendChild(saveButton);
                return line;
            } else {

                const urlDiv = document.createElement('div');
                urlDiv.className = 'subscription-url';
                const textSpan = document.createElement('span');
                textSpan.className = 'subscription-url-text';
                textSpan.textContent = url;
                const tipSpan = document.createElement('span');
                tipSpan.className = 'subscription-url-tip';
                tipSpan.textContent = '已复制';
                urlDiv.addEventListener('click', async function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        await copyText(textSpan.textContent);
                        tipSpan.classList.add('subscription-url-tip-active');
                        setTimeout(() => {
                            tipSpan.classList.remove('subscription-url-tip-active');
                        }, 900);
                    } catch (err) {
                        console.error(err);
                    }
                }, { passive: false });
                urlDiv.appendChild(textSpan);
                urlDiv.appendChild(tipSpan);
                line.appendChild(urlDiv);
                return line;
            }
        };
        shell.body.appendChild(createLine('默认订阅 (Base64)', `${currentDomain}/${subToken}`, false));
        shell.body.appendChild(createLine('优选IP订阅', '', true));
        shell.body.appendChild(createLine('Clash 配置链接', `${apiUrl}/clash?config=${currentDomain}/${subToken}`, false));
        shell.body.appendChild(createLine('Sing-box 配置链接', `${apiUrl}/singbox?config=${currentDomain}/${subToken}`, false));
        const closeButton = document.createElement('button');
        closeButton.className = 'alert-button';
        closeButton.textContent = '关闭';
        closeButton.onclick = async () => {
            closeModal();
        };
        shell.footer.appendChild(closeButton);
    } catch {
        showAlert('系统错误: 无法检索链接');
    }
}

async function deleteItem() {
    const inputEl = document.getElementById('deleteInput');
    if (!inputEl) return;
    const input = inputEl.value.trim();
    if (!input) return;
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
                inputEl.value = '';
                setTimeout(fetchData, 500);
                let msgText;
                if (isSubscription) {
                    msgText = '订阅删除完成';
                } else {
                    const remark = getNodeRemark(input);
                    const displayRemark = remark ? remark : '未备注';
                    msgText = '节点删除完成：' + displayRemark;
                }
                showAlert(msgText, false, null, false);
            }
        } else {
            showAlert('提示: ' + (result.error || '删除失败'));
        }
    } catch (error) {
        showAlert('失败: ' + (error.message || '未知错误'));
    }
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
            if (response.status === 401) {
                window.location.href = '/login';
                return;
            }
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
    let width = 0;
    let height = 0;
    let cols = 0;
    let ypos = [];
    const fps = 12;
    const frameInterval = 1000 / fps;
    let lastTime = 0;
    let rafId = null;
    let idleTimer = null;

    const isVisible = () => {
        const rect = container.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };

    const resizeCanvas = () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        cols = Math.floor(width / 20);
        ypos = Array(cols).fill(0);
    };

    const drawMatrix = () => {
        if (!width || !height) return;
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
    };

    const scheduleIdle = () => {
        if (idleTimer) return;
        idleTimer = setTimeout(() => {
            idleTimer = null;
            rafId = requestAnimationFrame(loop);
        }, 500);
    };

    const loop = (time) => {
        if (document.hidden || !isVisible()) {
            scheduleIdle();
            return;
        }
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
        if (!width || !height) resizeCanvas();
        if (time - lastTime >= frameInterval) {
            lastTime = time;
            drawMatrix();
        }
        rafId = requestAnimationFrame(loop);
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    rafId = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(loop);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    document.documentElement.style.overflowY = 'scroll';
    initMatrixEffect();
    await fetchApiUrl();
    await fetchSubToken();
    await fetchData();
    updateBjTime();
});
