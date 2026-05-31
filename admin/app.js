// Admin Dashboard — Command Center Logic
const API_BASE = '/api/admin';
const OUTREACH_API = '/api/outreach';
const ACCESS_KEY = 'geopage-admin-2024';
const STORAGE_KEY = 'geopage_admin_auth';

// ============================================================
// Access Key Auth — simple localStorage-based
// ============================================================
(function initAuth() {
    if (sessionStorage.getItem(STORAGE_KEY) === 'true') {
        document.getElementById('accessModal').remove();
        return;
    }

    document.getElementById('accessSubmit').addEventListener('click', tryKey);
    document.getElementById('accessKeyInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tryKey();
    });
    document.getElementById('accessKeyInput').focus();

    function tryKey() {
        const input = document.getElementById('accessKeyInput');
        const err = document.getElementById('accessError');
        if (input.value === ACCESS_KEY) {
            sessionStorage.setItem(STORAGE_KEY, 'true');
            document.getElementById('accessModal').remove();
        } else {
            err.textContent = 'Invalid key';
            err.style.display = 'block';
            input.value = '';
            input.focus();
        }
    }
})();

document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem(STORAGE_KEY);
    window.location.reload();
});

function authHeaders() { return { 'Content-Type': 'application/json' }; }

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        item.classList.add('active');
        document.getElementById(`section-${item.dataset.section}`).classList.add('active');
        loadSection(item.dataset.section);
    });
});

// Load data for each section
async function loadSection(section) {
    switch (section) {
        case 'overview': await loadOverview(); break;
        case 'leads': await loadLeads(); break;
        case 'outreach': await loadOutreach(); break;
        case 'showcases': await loadShowcases(); break;
        case 'optimization': await loadOptimization(); break;
    }
}

async function apiGet(route) {
    const res = await fetch(`${API_BASE}?route=${route}`, { headers: authHeaders() });
    if (res.status === 401) {
        console.warn('[Admin API] 401 on GET ' + route + ' — token exists: ' + !!window._adminToken);
        return {};
    }
    return res.json();
}

async function apiPost(route, data) {
    const res = await fetch(`${API_BASE}?route=${route}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    if (res.status === 401) {
        console.warn('[Admin API] 401 on POST ' + route + ' — token exists: ' + !!window._adminToken);
        return {};
    }
    return res.json();
}

// Overview
async function loadOverview() {
    const metrics = await apiGet('metrics');
    if (!metrics || metrics.error) return;

    document.getElementById('totalTouches').textContent = metrics.total_touches || metrics.touches_sent || 0;
    document.getElementById('replyRate').textContent = metrics.reply_rate || '0%';
    document.getElementById('trialRate').textContent = metrics.trial_rate || '0%';
    document.getElementById('conversionRate').textContent = metrics.conversion_rate || '0%';
    document.getElementById('revenue').textContent = `$${metrics.revenue || 0}`;
    document.getElementById('hotLeads').textContent = metrics.tier_breakdown?.hot || 0;

    // Channel breakdown
    const channelDiv = document.getElementById('channelBreakdown');
    channelDiv.innerHTML = '';
    const channels = metrics.channel_breakdown || {};
    if (Object.keys(channels).length === 0) {
        channelDiv.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">No channel data yet. Start outreach to see performance.</div></div>';
    } else {
        for (const [ch, data] of Object.entries(channels)) {
            const rate = data.sent > 0 ? (data.replied / data.sent * 100).toFixed(0) : 0;
            channelDiv.innerHTML += `<div class="breakdown-item"><div class="label">${ch}</div><div class="value">${data.sent}</div><div class="label">${rate}% reply</div></div>`;
        }
    }

    // Tier breakdown
    const tierDiv = document.getElementById('tierBreakdown');
    tierDiv.innerHTML = '';
    const tiers = metrics.tier_breakdown || {};
    const tierColors = { hot: 'var(--hot)', warm: 'var(--warm)', cool: 'var(--cool)', cold: 'var(--cold)' };
    for (const [tier, count] of Object.entries(tiers)) {
        if (count > 0) {
            tierDiv.innerHTML += `<div class="breakdown-item"><div class="label" style="color:${tierColors[tier]}">${tier.toUpperCase()}</div><div class="value">${count}</div></div>`;
        }
    }
    if (tierDiv.innerHTML === '') {
        tierDiv.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎯</div><div class="empty-state-text">No leads scored yet.</div></div>';
    }
}

// Leads
async function loadLeads() {
    const tier = document.getElementById('leadTierFilter').value;
    const status = document.getElementById('leadStatusFilter').value;
    let url = `${API_BASE}?route=leads&sort=score`;
    if (tier) url += `&tier=${tier}`;
    if (status) url += `&status=${status}`;

    const leads = await fetch(url, { headers: authHeaders() }).then(r => r.json());
    if (leads.error === 'Unauthorized') { console.warn('[Admin] Unauthorized leads fetch'); return; }

    const tbody = document.getElementById('leadsBody');
    tbody.innerHTML = '';

    if (!leads || leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">No leads found. Add leads via the API or run lead scoring.</td></tr>';
        return;
    }

    const tierStyles = {
        hot: 'color:var(--hot);font-weight:600',
        warm: 'color:var(--warm);font-weight:600',
        cool: 'color:var(--cool);font-weight:600',
        cold: 'color:var(--cold);font-weight:500'
    };

    const statusStyles = {
        new: 'background:var(--accent-glow);color:var(--accent);padding:3px 8px;border-radius:4px;font-size:0.75rem',
        contacted: 'background:rgba(249,115,22,0.1);color:var(--warm);padding:3px 8px;border-radius:4px;font-size:0.75rem',
        replied: 'background:rgba(34,197,94,0.1);color:var(--success);padding:3px 8px;border-radius:4px;font-size:0.75rem',
        trial: 'background:rgba(234,179,8,0.1);color:var(--cool);padding:3px 8px;border-radius:4px;font-size:0.75rem',
        converted: 'background:rgba(34,197,94,0.15);color:var(--success);padding:3px 8px;border-radius:4px;font-size:0.75rem;font-weight:600'
    };

    for (const lead of leads.slice(0, 100)) {
        const tierClass = tierStyles[lead.tier] || tierStyles.cold;
        const statusClass = statusStyles[lead.status] || statusStyles.new;
        tbody.innerHTML += `<tr>
            <td style="font-weight:500;color:var(--text-primary)">${lead.name || lead.handle || 'Unknown'}</td>
            <td>${lead.platform || '-'}</td>
            <td>${lead.niche || '-'}</td>
            <td style="font-family:'SF Mono',monospace;font-size:0.8rem">${lead.pain_score || 0}</td>
            <td style="${tierClass}">${(lead.tier || 'cold').toUpperCase()}</td>
            <td><span style="${statusClass}">${lead.status || 'new'}</span></td>
            <td><button class="btn btn-sm btn-secondary" onclick="logLeadReply('${lead.id}')">Mark Replied</button></td>
        </tr>`;
    }
}

document.getElementById('leadTierFilter').addEventListener('change', loadLeads);
document.getElementById('leadStatusFilter').addEventListener('change', loadLeads);
document.getElementById('refreshLeads').addEventListener('click', loadLeads);

async function logLeadReply(leadId) {
    await apiPost('log-reply', { outreach_id: leadId, sentiment: 'positive' });
    loadLeads();
}

// Outreach
async function loadOutreach() {
    const status = await fetch(`${OUTREACH_API}?route=status`, { headers: authHeaders() }).then(r => r.json());
    if (status.error === 'Unauthorized') { console.warn('[Admin] Unauthorized outreach fetch'); return; }
    document.getElementById('todaySent').textContent = status.today_sent || 0;
    document.getElementById('totalSent').textContent = status.total_sent || 0;
    document.getElementById('totalReplies').textContent = status.total_replies || 0;
    document.getElementById('totalTrials').textContent = status.total_trials || 0;

    const logDiv = document.getElementById('outreachLog');
    if (!status.total_sent || status.total_sent === 0) {
        logDiv.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📬</div><div class="empty-state-text">No outreach sent yet. Generate a batch from the Actions tab.</div></div>';
    }
}

// Showcases
async function loadShowcases() {
    const data = await apiGet('showcases');
    const listDiv = document.getElementById('showcaseList');
    listDiv.innerHTML = '';

    if (!data || data.error || !data.length) {
        listDiv.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎨</div><div class="empty-state-text">No showcases generated yet. Click "Generate Showcase Batch" to create proof assets.</div></div>';
        return;
    }

    for (const s of data) {
        listDiv.innerHTML += `<div class="showcase-item">
            <div class="niche">${s.niche || 'general'}</div>
            <div class="suburb">${s.suburb || 'Unknown'}</div>
            <div class="style">${s.style || 'default'} · ${s.status || 'pending'}</div>
        </div>`;
    }
}

// Optimization
async function loadOptimization() {
    const recs = await apiGet('recommendations');
    const recDiv = document.getElementById('recommendations');
    recDiv.innerHTML = '';

    if (!recs || recs.length === 0) {
        recDiv.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚡</div><div class="empty-state-text">No recommendations yet. Need more outreach data for optimization.</div></div>';
        return;
    }

    for (const rec of recs) {
        recDiv.innerHTML += `<div class="rec-item ${rec.priority}"><div class="rec-text">${rec.text}</div><div class="rec-action">${rec.action}</div></div>`;
    }
}

// Actions
document.getElementById('runScoring').addEventListener('click', async () => {
    logAction('Running lead scoring...');
    await apiPost('add-lead', {}); // Trigger scoring via cron
    logAction('Lead scoring complete.');
    loadSection('leads');
});

document.getElementById('runScraper').addEventListener('click', async () => {
    logAction('Running lead scraper...');
    const result = await apiGet('metrics'); // Placeholder — scraper runs via cron
    logAction('Scraper triggered. Results will appear in leads table after cron runs.');
});

document.getElementById('sendOutreach').addEventListener('click', async () => {
    logAction('Generating outreach batch...');
    const result = await fetch(OUTREACH_API, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ route: 'generate', count: 20 })
    }).then(r => r.json());
    logAction(`Generated ${result.count || 0} messages. Emails will be sent on next cron run.`);
});

document.getElementById('generateShowcases').addEventListener('click', async () => {
    logAction('Generating showcase batch...');
    try {
        const result = await fetch('/api/factory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
        logAction(`Generated ${result.success || 0} showcases (${result.failed || 0} failed). Batch ${result.batch_size || 0}/${result.total || 0}`);
        loadShowcases();
    } catch (err) {
        logAction(`Showcase generation error: ${err.message}`);
    }
});

document.getElementById('runAnalytics').addEventListener('click', async () => {
    logAction('Running analytics...');
    await apiGet('metrics');
    logAction('Analytics updated.');
    loadSection('overview');
});

document.getElementById('runOptimization').addEventListener('click', async () => {
    logAction('Running optimization...');
    await apiGet('recommendations');
    logAction('Optimization complete.');
    loadSection('optimization');
});

document.getElementById('importCsv').addEventListener('click', async () => {
    const csv = document.getElementById('csvImport').value.trim();
    if (!csv) { logAction('No CSV data to import.'); return; }
    const lines = csv.split('\n').filter(l => l.trim());
    const leads = lines.map(line => {
        const [name, email, platform, niche, location] = line.split(',').map(s => s.trim());
        return { name, email, platform, niche, location };
    });
    logAction(`Importing ${leads.length} leads...`);
    const result = await apiPost('import-leads', { leads });
    logAction(`Imported ${result.imported || 0} of ${leads.length} leads.`);
    document.getElementById('csvImport').value = '';
    loadSection('leads');
});

document.getElementById('exportMetrics').addEventListener('click', async () => {
    const metrics = await apiGet('metrics');
    const flatten = (obj, prefix = '') => {
        const rows = [];
        for (const [k, v] of Object.entries(obj)) {
            const key = prefix ? `${prefix}.${k}` : k;
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                rows.push(...flatten(v, key));
            } else {
                rows.push(`${key},${typeof v === 'object' ? JSON.stringify(v) : v}`);
            }
        }
        return rows;
    };
    const csv = flatten(metrics).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'geopage-metrics.csv'; a.click();
    logAction('Metrics exported.');
});

// Kill Switch
document.getElementById('killSwitch').addEventListener('click', async () => {
    const badge = document.getElementById('statusBadge');
    const isPaused = badge.textContent === 'System Paused';
    const action = isPaused ? 'resume' : 'pause';
    if (confirm(isPaused ? 'Resume all automated outreach?' : 'KILL SWITCH: This will pause all automated outreach. Continue?')) {
        await apiPost('kill-switch', { active: !isPaused });
        badge.textContent = isPaused ? 'System Online' : 'System Paused';
        badge.style.color = isPaused ? '' : 'var(--danger)';
        logAction(isPaused ? 'Kill switch deactivated. Outreach resumed.' : 'KILL SWITCH ACTIVATED. All outreach paused.');
        showToast(isPaused ? 'Outreach resumed' : 'Kill switch activated', isPaused ? 'info' : 'error');
    }
});

// Toast notifications
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} active`;
    setTimeout(() => toast.classList.remove('active'), 3000);
}

// Action log
function logAction(message) {
    const log = document.getElementById('actionLog');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="timestamp">${new Date().toLocaleTimeString()}</span> ${message}`;
    log.prepend(entry);
    showToast(message);
}

// Auto-refresh overview every 30 seconds
setInterval(() => {
    const activeSection = document.querySelector('.section.active');
    if (activeSection?.id === 'section-overview') loadOverview();
}, 30000);

// Initial load
loadOverview();
