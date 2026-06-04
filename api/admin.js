// Admin API — Central command center backend (Supabase-backed)
const { dbSelect, dbInsert, dbUpdate, dbCount } = require('../lib/db');

async function isKillSwitchActive() {
    const rows = await dbSelect('system_config', { key: 'kill_switch' });
    return rows.length > 0 && rows[0].value === 'true';
}

async function setKillSwitch(active) {
    const rows = await dbSelect('system_config', { key: 'kill_switch' });
    if (rows.length > 0) {
        await dbUpdate('system_config', { value: active ? 'true' : 'false', updated_at: new Date().toISOString() }, { key: 'kill_switch' });
    } else {
        await dbInsert('system_config', { key: 'kill_switch', value: active ? 'true' : 'false', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
}

async function getMetrics() {
    const [leads, outreach, showcases] = await Promise.all([
        dbSelect('leads'),
        dbSelect('outreach_log'),
        dbSelect('showcase_assets')
    ]);

    const totalTouches = outreach.length;
    const totalReplies = outreach.filter(o => o.replied).length;
    const totalTrials = outreach.filter(o => o.trial_given).length;
    const totalConverted = outreach.filter(o => o.converted).length;

    const channelBreakdown = {};
    for (const entry of outreach) {
        if (!channelBreakdown[entry.channel]) channelBreakdown[entry.channel] = { sent: 0, replied: 0, trials: 0 };
        channelBreakdown[entry.channel].sent++;
        if (entry.replied) channelBreakdown[entry.channel].replied++;
        if (entry.trial_given) channelBreakdown[entry.channel].trials++;
    }

    const tierBreakdown = { hot: 0, warm: 0, cool: 0, cold: 0 };
    leads.forEach(l => tierBreakdown[l.tier || 'cold']++);

    return {
        touches_sent: totalTouches,
        replies_received: totalReplies,
        trials_given: totalTrials,
        payments_received: totalConverted,
        revenue: 0,
        reply_rate: totalTouches > 0 ? (totalReplies / totalTouches * 100).toFixed(1) + '%' : '0%',
        trial_rate: totalTouches > 0 ? (totalTrials / totalTouches * 100).toFixed(1) + '%' : '0%',
        conversion_rate: totalTouches > 0 ? (totalConverted / totalTouches * 100).toFixed(1) + '%' : '0%',
        channel_breakdown: channelBreakdown,
        tier_breakdown: tierBreakdown,
        total_leads: leads.length,
        total_showcases: showcases.length,
        outreach_log_size: outreach.length
    };
}

async function getLeads(filters = {}) {
    return await dbSelect('leads', filters);
}

async function addLead(data) {
    return await dbInsert('leads', {
        name: data.name || '',
        platform: data.platform || 'twitter',
        handle: data.handle || '',
        niche: data.niche || '',
        location: data.location || '',
        pain_score: 0,
        response_probability: 0,
        tier: 'cold',
        status: 'new',
        touches: 0,
        notes: data.notes || '',
        metadata: data.metadata || {}
    });
}

async function logOutreach(data) {
    return await dbInsert('outreach_log', {
        lead_id: data.lead_id,
        channel: data.channel,
        message_variant: data.hook_type || data.message_variant || 'unknown',
        showcase_used: data.showcase_used || null,
        message_text: data.message_text || '',
        replied: false,
        reply_sentiment: null,
        trial_given: false,
        converted: false
    });
}

async function logReply(outreachId, sentiment) {
    await dbUpdate('outreach_log', { replied: true, reply_sentiment: sentiment || 'positive' }, { id: outreachId });
}

async function getRecommendations() {
    const outreach = await dbSelect('outreach_log');
    const leads = await dbSelect('leads');
    const recs = [];

    if (outreach.length < 50) {
        recs.push({ priority: 'high', text: `Only ${outreach.length} touches sent. Need more volume.`, action: 'increase_outreach' });
    }

    const channelPerf = {};
    for (const entry of outreach) {
        if (!channelPerf[entry.channel]) channelPerf[entry.channel] = { sent: 0, replied: 0 };
        channelPerf[entry.channel].sent++;
        if (entry.replied) channelPerf[entry.channel].replied++;
    }

    for (const [ch, data] of Object.entries(channelPerf)) {
        const rate = data.sent > 0 ? data.replied / data.sent : 0;
        if (rate > 0.2 && data.sent >= 10) recs.push({ priority: 'high', text: `${ch} at ${(rate * 100).toFixed(0)}% reply rate. Boost it.`, action: 'boost_channel' });
        if (rate < 0.05 && data.sent >= 20) recs.push({ priority: 'medium', text: `${ch} at ${(rate * 100).toFixed(0)}% reply rate. Reduce.`, action: 'reduce_channel' });
    }

    const hotLeads = leads.filter(l => l.tier === 'hot');
    if (hotLeads.length > 0) recs.push({ priority: 'high', text: `${hotLeads.length} hot leads ready for outreach.`, action: 'outreach_hot' });

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
            case 'metrics': res.status(200).json(await getMetrics()); break;
            case 'leads': {
                const filters = {};
                if (url.searchParams.get('tier')) filters.tier = url.searchParams.get('tier');
                if (url.searchParams.get('status')) filters.status = url.searchParams.get('status');
                res.status(200).json(await getLeads(filters));
                break;
            }
            case 'recommendations': res.status(200).json(await getRecommendations()); break;
            case 'showcases': res.status(200).json(await dbSelect('showcase_assets')); break;
            case 'kill-switch': {
                if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
                const ksBody = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
                await setKillSwitch(ksBody.active === true);
                res.status(200).json({ active: ksBody.active === true });
                break;
            }
            case 'kill-switch-status': {
                res.status(200).json({ active: await isKillSwitchActive() });
                break;
            }
            case 'import-leads': {
                if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
                const importBody = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
                const csvLeads = importBody.leads || [];
                let imported = 0;
                for (const lead of csvLeads) {
                    const result = await dbInsert('leads', {
                        name: lead.name || '',
                        platform: lead.platform || 'csv',
                        handle: lead.handle || lead.twitter || '',
                        niche: lead.niche || '',
                        location: lead.location || '',
                        email: lead.email || '',
                        pain_score: 0,
                        response_probability: 0,
                        tier: 'cold',
                        status: 'new',
                        touches: 0,
                        notes: lead.notes || '',
                        source: 'csv_import',
                        metadata: {}
                    });
                    if (result) imported++;
                }
                res.status(200).json({ imported, total: csvLeads.length });
                break;
            }
            case 'add-lead':
                if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
                const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
                res.status(200).json(await addLead(body));
                break;
            case 'log-outreach':
                if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
                const outBody = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
                res.status(200).json(await logOutreach(outBody));
                break;
            case 'log-reply':
                if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
                const replyBody = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
                await logReply(replyBody.outreach_id, replyBody.sentiment);
                res.status(200).json({ ok: true });
                break;
            case 'refresh-schema': {
                const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
                const supabaseUrl = 'https://dfoejyfmhzjsmqxrdazl.supabase.co';
                try {
                    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/pgrst_reload`, {
                        method: 'POST',
                        headers: {
                            'apikey': supabaseKey,
                            'Authorization': `Bearer ${supabaseKey}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    const txt = await r.text();
                    res.status(r.ok ? 200 : 400).json({ ok: r.ok, response: txt });
                } catch(e) {
                    res.status(500).json({ ok: false, error: e.message });
                }
                break;
            }
            default: res.status(400).json({ error: 'Unknown route' });
        }
    } catch (error) {
        console.error('Admin API Error:', error);
        res.status(500).json({ error: error.message });
    }
};
