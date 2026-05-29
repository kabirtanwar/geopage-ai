// Outreach API — Queue management (Supabase-backed)
const { dbSelect, dbInsert, dbUpdate } = require('../lib/db');
const { generateBatch } = require('../lib/outreach-engine');

async function isKillSwitchActive() {
    const rows = await dbSelect('system_config', { key: 'kill_switch' });
    return rows.length > 0 && rows[0].value === 'true';
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const url = new URL(req.url, `https://${req.headers.host}`);
    const route = url.searchParams.get('route') || 'status';

    try {
        switch (route) {
            case 'status': {
                const log = await dbSelect('outreach_log');
                const today = new Date().toISOString().split('T')[0];
                const todayOutreach = log.filter(o => o.sent_at && o.sent_at.startsWith(today));
                res.status(200).json({
                    total_sent: log.length,
                    today_sent: todayOutreach.length,
                    total_replies: log.filter(o => o.replied).length,
                    total_trials: log.filter(o => o.trial_given).length
                });
                break;
            }
            case 'generate': {
                if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
                const genBody = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
                const leads = await dbSelect('leads');
                const targetLeads = genBody.lead_ids
                    ? leads.filter(l => genBody.lead_ids.includes(l.id))
                    : leads.filter(l => l.tier === 'hot' || l.tier === 'warm').slice(0, genBody.count || 50);
                const messages = generateBatch(targetLeads, genBody.showcase_refs || {});
                res.status(200).json({ count: messages.length, messages });
                break;
            }
            case 'execute': {
                if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
                if (await isKillSwitchActive()) { res.status(200).json({ executed: 0, paused: true }); return; }
                const execBody = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
                for (const msg of (execBody.messages || [])) {
                    await dbInsert('outreach_log', {
                        lead_id: msg.lead_id,
                        channel: msg.channel,
                        message_variant: msg.hook_type || 'unknown',
                        showcase_used: msg.showcase_used || null,
                        message_text: msg.message_text,
                        replied: false,
                        trial_given: false,
                        converted: false,
                        sent_at: new Date().toISOString()
                    });
                    await dbUpdate('leads', { touches: msg.touches || 0, last_touch: new Date().toISOString(), status: 'contacted' }, { id: msg.lead_id });
                }
                res.status(200).json({ executed: (execBody.messages || []).length });
                break;
            }
            default: res.status(400).json({ error: 'Unknown route' });
        }
    } catch (error) {
        console.error('Outreach API Error:', error);
        res.status(500).json({ error: error.message });
    }
};
