// Admin Dashboard — Command Center Logic
const API_BASE = '/api/admin';
const OUTREACH_API = '/api/outreach';
const ADMIN_EMAILS = (typeof ADMIN_EMAILS_CONFIG !== 'undefined') ? ADMIN_EMAILS_CONFIG : [];

// ============================================================
// Auth Gate — properly waits for Supabase session
// ============================================================
(function initAuth() {
    const T0 = performance.now();
    const gate = document.getElementById('authGate');

    function log(msg) {
        const ms = Math.round(performance.now() - T0);
        console.log(`[Admin Auth ${ms}ms] ${msg}`);
    }

    function allowDashboard(user, token) {
        window._adminUser = user;
        window._adminToken = token;
        const email = (user.email || '').toLowerCase();
        document.getElementById('adminEmail').textContent = email;
        if (gate) gate.remove();
        log('Dashboard access granted: ' + email);
    }

    function showLoginPrompt(msg) {
        log('No session: ' + msg);
        if (gate) {
            gate.querySelector('span').innerHTML = msg + '<br><a href="/" style="color:#6366f1;margin-top:12px;display:inline-block;">Go to login →</a>';
            gate.querySelector('div').style.borderTopColor = '#f59e0b';
        }
    }

    function waitForSupabase(retries) {
        return new Promise((resolve, reject) => {
            if (window.supabase && window.supabase.createClient) { resolve(window.supabase); return; }
            if (retries <= 0) { reject(new Error('Supabase SDK failed to load')); return; }
            setTimeout(() => waitForSupabase(retries - 1).then(resolve).catch(reject), 100);
        });
    }

    waitForSupabase(50).then((supabase) => {
        const SUPABASE_URL = 'https://dfoejyfmhzjsmqxrdazl.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmb2VqeWZtaHpqc21xeHJkYXpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NDk1NjEsImV4cCI6MjA5NTUyNTU2MX0.lN4NDJKF3rXkCKiCxIlkcl8AVWbGoe7KvpUzTM2FSH8';
        const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        client.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                const email = (session.user.email || '').toLowerCase().trim();
                if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email)) {
                    showLoginPrompt('Email "' + email + '" is not authorized for admin access.');
                    return;
                }
                allowDashboard(session.user, session.access_token);
                return;
            }

            // No session — wait for Supabase to hydrate from localStorage
            log('No session yet, waiting for onAuthStateChange...');
            let resolved = false;
            const { data: { subscription } } = client.auth.onAuthStateChange((event, sess) => {
                if (resolved) return;
                if (sess) {
                    resolved = true;
                    subscription.unsubscribe();
                    const email = (sess.user.email || '').toLowerCase().trim();
                    if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email)) {
                        showLoginPrompt('Email "' + email + '" is not authorized for admin access.');
                        return;
                    }
                    allowDashboard(sess.user, sess.access_token);
                } else if (event === 'SIGNED_OUT') {
                    resolved = true;
                    subscription.unsubscribe();
                    showLoginPrompt('You are not signed in. Please log in first.');
                }
            });

            // If no auth state after 5s, show login prompt (don't redirect)
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    try { subscription.unsubscribe(); } catch {}
                    showLoginPrompt('Session not found. Please log in on the main site first.');
                }
            }, 5000);
        }).catch((err) => {
            log('getSession error: ' + err.message);
            showLoginPrompt('Auth check failed: ' + err.message);
        });
    }).catch((err) => {
        log('SDK load failed: ' + err.message);
        showLoginPrompt('Failed to load Supabase SDK: ' + err.message);
    });
})();

function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (window._adminToken) h['Authorization'] = `Bearer ${window._adminToken}`;
    return h;
}

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
        headers: authHeaders(),
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
        document.getElementById('statusBadge').textContent = 'System Paused';
        document.getElementById('statusBadge').style.color = 'var(--danger)';
        logAction('KILL SWITCH ACTIVATED. All outreach paused.');
        showToast('Kill switch activated', 'error');
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
