// Outreach API — Queue management for outbound messages
// Manages message queue, send logging, and reply tracking

const fs = require('fs');
const path = require('path');
const { generateBatch } = require('../lib/outreach-engine');

const DATA_DIR = path.join(process.cwd(), 'data');

function readJSON(filename) {
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8')); }
    catch { return null; }
}

function writeJSON(filename, data) {
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
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
            case 'status':
                const log = readJSON('outreach.json') || [];
                const today = new Date().toISOString().split('T')[0];
                const todayOutreach = log.filter(o => o.sent_at && o.sent_at.startsWith(today));
                res.status(200).json({
                    total_sent: log.length,
                    today_sent: todayOutreach.length,
                    total_replies: log.filter(o => o.replied).length,
                    total_trials: log.filter(o => o.trial_given).length,
                    pending_queue: 0
                });
                break;

            case 'generate':
                if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
                const genBody = JSON.parse(req.body || '{}');
                const leads = readJSON('leads.json') || [];
                const targetLeads = genBody.lead_ids
                    ? leads.filter(l => genBody.lead_ids.includes(l.id))
                    : leads.filter(l => l.tier === 'hot' || l.tier === 'warm').slice(0, genBody.count || 50);

                const messages = generateBatch(targetLeads, genBody.showcase_refs || {});
                res.status(200).json({ count: messages.length, messages });
                break;

            case 'execute':
                if (req.method !== 'POST') { res.status(405).json({ error: 'POST required' }); return; }
                const execBody = JSON.parse(req.body || '{}');
                // Log each message as sent
                const logFile = readJSON('outreach.json') || [];
                for (const msg of (execBody.messages || [])) {
                    logFile.push({
                        id: `out_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                        lead_id: msg.lead_id,
                        channel: msg.channel,
                        message_variant: msg.hook_type || 'unknown',
                        showcase_used: msg.showcase_used || null,
                        message_text: msg.message_text,
                        sent_at: new Date().toISOString(),
                        replied: false,
                        reply_sentiment: null,
                        trial_given: false,
                        converted: false
                    });
                }
                writeJSON('outreach.json', logFile);

                // Update lead touch counts
                const leadsFile = readJSON('leads.json') || [];
                for (const msg of (execBody.messages || [])) {
                    const lead = leadsFile.find(l => l.id === msg.lead_id);
                    if (lead) {
                        lead.touches = (lead.touches || 0) + 1;
                        lead.last_touch = new Date().toISOString();
                        if (lead.status === 'new') lead.status = 'contacted';
                    }
                }
                writeJSON('leads.json', leadsFile);

                res.status(200).json({ executed: (execBody.messages || []).length });
                break;

            default:
                res.status(400).json({ error: 'Unknown route' });
        }
    } catch (error) {
        console.error('Outreach API Error:', error);
        res.status(500).json({ error: error.message });
    }
};
