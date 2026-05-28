// Admin Dashboard — Command Center Logic
const API_BASE = '/api/admin';
const OUTREACH_API = '/api/outreach';

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
    const res = await fetch(`${API_BASE}?route=${route}`);
    return res.json();
}

async function apiPost(route, data) {
    const res = await fetch(`${API_BASE}?route=${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}

// Overview
async function loadOverview() {
    const metrics = await apiGet('metrics');
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
    for (const [ch, data] of Object.entries(channels)) {
        const rate = data.sent > 0 ? (data.replied / data.sent * 100).toFixed(0) : 0;
        channelDiv.innerHTML += `<div class="breakdown-item"><div class="label">${ch}</div><div class="value">${data.sent}</div><div class="label">${rate}% reply</div></div>`;
    }

    // Tier breakdown
    const tierDiv = document.getElementById('tierBreakdown');
    tierDiv.innerHTML = '';
    const tiers = metrics.tier_breakdown || {};
    const tierColors = { hot: '#f85149', warm: '#f0883e', cool: '#d29922', cold: '#8b949e' };
    for (const [tier, count] of Object.entries(tiers)) {
        tierDiv.innerHTML += `<div class="breakdown-item"><div class="label" style="color:${tierColors[tier]}">${tier.toUpperCase()}</div><div class="value">${count}</div></div>`;
    }
}

// Leads
async function loadLeads() {
    const tier = document.getElementById('leadTierFilter').value;
    const status = document.getElementById('leadStatusFilter').value;
    let url = `${API_BASE}?route=leads&sort=score`;
    if (tier) url += `&tier=${tier}`;
    if (status) url += `&status=${status}`;

    const leads = await fetch(url).then(r => r.json());
    const tbody = document.getElementById('leadsBody');
    tbody.innerHTML = '';
    for (const lead of leads.slice(0, 100)) {
        const tierClass = { hot: 'color:#f85149', warm: 'color:#f0883e', cool: 'color:#d29922', cold: 'color:#8b949e' };
        tbody.innerHTML += `<tr>
            <td>${lead.name || lead.handle || 'Unknown'}</td>
            <td>${lead.platform || '-'}</td>
            <td>${lead.niche || '-'}</td>
            <td>${lead.pain_score || 0}</td>
            <td style="${tierClass[lead.tier] || ''}">${(lead.tier || 'cold').toUpperCase()}</td>
            <td>${lead.status || 'new'}</td>
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
    const status = await fetch(`${OUTREACH_API}?route=status`).then(r => r.json());
    document.getElementById('todaySent').textContent = status.today_sent || 0;
    document.getElementById('totalSent').textContent = status.total_sent || 0;
    document.getElementById('totalReplies').textContent = status.total_replies || 0;
    document.getElementById('totalTrials').textContent = status.total_trials || 0;
}

// Showcases
async function loadShowcases() {
    // Placeholder - will be populated with actual showcase data
    document.getElementById('showcaseList').innerHTML = '<p style="color:#8b949e">No showcases generated yet. Click "Generate Showcase Batch" to create proof assets.</p>';
}

// Optimization
async function loadOptimization() {
    const recs = await apiGet('recommendations');
    const recDiv = document.getElementById('recommendations');
    recDiv.innerHTML = '';
    if (recs.length === 0) {
        recDiv.innerHTML = '<p style="color:#8b949e">No recommendations yet. Need more data.</p>';
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

document.getElementById('generateShowcases').addEventListener('click', async () => {
    logAction('Showcase generation queued. Run via /api/cron for full generation.');
    loadSection('showcases');
});

document.getElementById('generateOutreach').addEventListener('click', async () => {
    logAction('Generating outreach batch...');
    const result = await fetch(OUTREACH_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: 'generate', count: 50 })
    }).then(r => r.json());
    logAction(`Generated ${result.count || 0} messages.`);
});

document.getElementById('exportMetrics').addEventListener('click', async () => {
    const metrics = await apiGet('metrics');
    const csv = Object.entries(metrics).map(([k, v]) => `${k},${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'geopage-metrics.csv'; a.click();
    logAction('Metrics exported.');
});

// Kill Switch
document.getElementById('killSwitch').addEventListener('click', () => {
    if (confirm('KILL SWITCH: This will pause all automated outreach. Continue?')) {
        localStorage.setItem('geopage_kill_switch', 'true');
        document.getElementById('statusBadge').textContent = '● PAUSED';
        document.getElementById('statusBadge').style.color = '#f85149';
        logAction('KILL SWITCH ACTIVATED. All outreach paused.');
    }
});

// Action log
function logAction(message) {
    const log = document.getElementById('actionLog');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="timestamp">${new Date().toLocaleTimeString()}</span> ${message}`;
    log.prepend(entry);
}

// Auto-refresh overview every 30 seconds
setInterval(() => {
    const activeSection = document.querySelector('.section.active');
    if (activeSection?.id === 'section-overview') loadOverview();
}, 30000);

// Initial load
loadOverview();
