// Admin API — Central command center backend
// Handles metrics, leads, outreach management, and actions

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

function readJSON(filename) {
    try {
        const data = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
        return JSON.parse(data);
    } catch { return null; }
}

function writeJSON(filename, data) {
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

function parseBody(req) {
    if (!req.body) return {};
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
    return req.body;
}

function getMetrics() {
    const metrics = readJSON('metrics.json') || { touches_sent: 0, replies_received: 0, trials_given: 0, payments_received: 0, revenue: 0, by_channel: {}, by_niche: {}, by_variant: {}, daily_history: [] };
    const outreach = readJSON('outreach.json') || [];
    const leads = readJSON('leads.json') || [];
    const showcases = readJSON('showcases.json') || [];

    // Calculate live metrics from outreach log
    const liveMetrics = {
        total_touches: outreach.length,
        total_replies: outreach.filter(o => o.replied).length,
        total_trials: outreach.filter(o => o.trial_given).length,
        total_converted: outreach.filter(o => o.converted).length,
        reply_rate: outreach.length > 0 ? (outreach.filter(o => o.replied).length / outreach.length * 100).toFixed(1) + '%' : '0%',
        trial_rate: outreach.length > 0 ? (outreach.filter(o => o.trial_given).length / outreach.length * 100).toFixed(1) + '%' : '0%',
        conversion_rate: outreach.length > 0 ? (outreach.filter(o => o.converted).length / outreach.length * 100).toFixed(1) + '%' : '0%'
    };

    // Channel breakdown
    const channelBreakdown = {};
    for (const entry of outreach) {
        if (!channelBreakdown[entry.channel]) channelBreakdown[entry.channel] = { sent: 0, replied: 0, trials: 0 };
        channelBreakdown[entry.channel].sent++;
        if (entry.replied) channelBreakdown[entry.channel].replied++;
        if (entry.trial_given) channelBreakdown[entry.channel].trials++;
    }

    // Lead tier breakdown
    const tierBreakdown = { hot: 0, warm: 0, cool: 0, cold: 0 };
    for (const lead of leads) {
        tierBreakdown[lead.tier || 'cold']++;
    }

    return {
        ...metrics,
        ...liveMetrics,
        channel_breakdown: channelBreakdown,
        tier_breakdown: tierBreakdown,
        total_leads: leads.length,
        total_showcases: showcases.length,
        outreach_log_size: outreach.length
    };
}

function getLeads(filters = {}) {
    let leads = readJSON('leads.json') || [];
    if (filters.tier) leads = leads.filter(l => l.tier === filters.tier);
    if (filters.status) leads = leads.filter(l => l.status === filters.status);
    if (filters.platform) leads = leads.filter(l => l.platform === filters.platform);
    if (filters.niche) leads = leads.filter(l => l.niche === filters.niche);
    if (filters.sort === 'score') leads.sort((a, b) => (b.pain_score || 0) - (a.pain_score || 0));
    return leads;
}

function addLead(leadData) {
    const leads = readJSON('leads.json') || [];
    const lead = {
        id: `lead_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name: leadData.name || '',
        platform: leadData.platform || 'twitter',
        handle: leadData.handle || '',
        niche: leadData.niche || '',
        location: leadData.location || '',
        pain_score: 0,
        response_probability: 0,
        tier: 'cold',
        status: 'new',
        touches: 0,
        last_touch: null,
        last_reply: null,
        notes: leadData.notes || '',
        recent_posts: leadData.recent_posts || [],
        metadata: leadData.metadata || {},
        created_at: new Date().toISOString()
    };
    leads.push(lead);
    writeJSON('leads.json', leads);
    return lead;
}

function logOutreach(data) {
    const log = readJSON('outreach.json') || [];
    const entry = {
        id: `out_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        lead_id: data.lead_id,
        channel: data.channel,
        message_variant: data.hook_type || data.message_variant || 'unknown',
        showcase_used: data.showcase_used || null,
        message_text: data.message_text || '',
        sent_at: new Date().toISOString(),
        replied: false,
        reply_sentiment: null,
        trial_given: false,
        converted: false
    };
    log.push(entry);
    writeJSON('outreach.json', log);

    // Update lead touch count
    const leads = readJSON('leads.json') || [];
    const lead = leads.find(l => l.id === data.lead_id);
    if (lead) {
        lead.touches = (lead.touches || 0) + 1;
        lead.last_touch = new Date().toISOString();
        if (lead.status === 'new') lead.status = 'contacted';
        writeJSON('leads.json', leads);
    }

    return entry;
}

function logReply(outreachId, sentiment) {
    const log = readJSON('outreach.json') || [];
    const entry = log.find(o => o.id === outreachId);
    if (entry) {
        entry.replied = true;
        entry.reply_sentiment = sentiment || 'positive';
        writeJSON('outreach.json', log);
    }

    // Update lead status
    if (entry) {
        const leads = readJSON('leads.json') || [];
        const lead = leads.find(l => l.id === entry.lead_id);
        if (lead) {
            lead.status = 'replied';
            lead.last_reply = new Date().toISOString();
            writeJSON('leads.json', leads);
        }
    }
    return entry;
}

function getRecommendations() {
    const outreach = readJSON('outreach.json') || [];
    const metrics = getMetrics();

    // Simple rule-based recommendations
    const recs = [];

    if (outreach.length < 50) {
        recs.push({ priority: 'high', text: `Only ${outreach.length} touches sent. Need more volume for meaningful signals.`, action: 'increase_outreach' });
    }

    const channelPerf = {};
    for (const entry of outreach) {
        if (!channelPerf[entry.channel]) channelPerf[entry.channel] = { sent: 0, replied: 0 };
        channelPerf[entry.channel].sent++;
        if (entry.replied) channelPerf[entry.channel].replied++;
    }

    for (const [ch, data] of Object.entries(channelPerf)) {
        const rate = data.sent > 0 ? data.replied / data.sent : 0;
        if (rate > 0.2 && data.sent >= 10) {
            recs.push({ priority: 'high', text: `${ch} performing well (${(rate * 100).toFixed(0)}% reply rate). Increase allocation.`, action: 'boost_channel', channel: ch });
        }
        if (rate < 0.05 && data.sent >= 20) {
            recs.push({ priority: 'medium', text: `${ch} underperforming (${(rate * 100).toFixed(0)}% reply rate). Consider reducing.`, action: 'reduce_channel', channel: ch });
        }
    }

    const hotLeads = getLeads({ tier: 'hot' });
    if (hotLeads.length > 0) {
        recs.push({ priority: 'high', text: `${hotLeads.length} hot leads ready for immediate outreach.`, action: 'outreach_hot_leads' });
    }

    return recs;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const url = new URL(req.url, `https://${req.headers.host}`);
    const route = url.searchParams.get('route') || 'metrics';

    try {
        switch (route) {
            case 'metrics':
                res.status(200).json(getMetrics());
                break;
            case 'leads':
                const filters = {
                    tier: url.searchParams.get('tier'),
                    status: url.searchParams.get('status'),
                    platform: url.searchParams.get('platform'),
                    niche: url.searchParams.get('niche'),
                    sort: url.searchParams.get('sort')
                };
                res.status(200).json(getLeads(filters));
                break;
            case 'recommendations':
                res.status(200).json(getRecommendations());
                break;
            case 'add-lead':
                if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
                const body = parseBody(req);
                res.status(200).json(addLead(body));
                break;
            case 'log-outreach':
                if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
                const outBody = parseBody(req);
                res.status(200).json(logOutreach(outBody));
                break;
            case 'log-reply':
                if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
                const replyBody = parseBody(req);
                res.status(200).json(logReply(replyBody.outreach_id, replyBody.sentiment));
                break;
            default:
                res.status(400).json({ error: 'Unknown route' });
        }
    } catch (error) {
        console.error('Admin API Error:', error);
        res.status(500).json({ error: error.message });
    }
};
