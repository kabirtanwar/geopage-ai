// Cron API — Autonomous job runner
// Runs scheduled tasks: scoring, analytics aggregation, optimization

const fs = require('fs');
const path = require('path');
const { scoreAllLeads } = require('../lib/lead-scorer');
const { analyzePerformance, generateRecommendations, calculateChannelAllocation } = require('../lib/self-healer');

const DATA_DIR = path.join(process.cwd(), 'data');

function readJSON(filename) {
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8')); }
    catch { return null; }
}

function writeJSON(filename, data) {
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

async function runScoring() {
    const leads = readJSON('leads.json') || [];
    if (leads.length === 0) return { action: 'scoring', result: 'no leads to score' };

    const scored = scoreAllLeads(leads);
    writeJSON('leads.json', scored);

    const tiers = { hot: 0, warm: 0, cool: 0, cold: 0 };
    scored.forEach(l => tiers[l.tier]++);

    return { action: 'scoring', scored: scored.length, tiers };
}

async function runAnalytics() {
    const outreach = readJSON('outreach.json') || [];
    const leads = readJSON('leads.json') || [];

    const metrics = {
        touches_sent: outreach.length,
        replies_received: outreach.filter(o => o.replied).length,
        trials_given: outreach.filter(o => o.trial_given).length,
        payments_received: outreach.filter(o => o.converted).length,
        reply_rate: outreach.length > 0 ? (outreach.filter(o => o.replied).length / outreach.length * 100).toFixed(1) + '%' : '0%',
        total_leads: leads.length,
        hot_leads: leads.filter(l => l.tier === 'hot').length,
        last_updated: new Date().toISOString()
    };

    const metricsFile = readJSON('metrics.json') || {};
    Object.assign(metricsFile, metrics);
    writeJSON('metrics.json', metricsFile);

    return { action: 'analytics', metrics };
}

async function runOptimization() {
    const outreach = readJSON('outreach.json') || [];
    const metrics = readJSON('metrics.json') || {};

    const performance = analyzePerformance(outreach, metrics);
    const recommendations = generateRecommendations(performance);
    const allocation = calculateChannelAllocation(performance);

    // Log optimization run
    const optLog = readJSON('optimization_log.json') || [];
    optLog.push({
        timestamp: new Date().toISOString(),
        performance,
        recommendations,
        allocation
    });
    // Keep only last 30 optimization runs
    writeJSON('optimization_log.json', optLog.slice(-30));

    return { action: 'optimization', recommendations, allocation };
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Verify this is a cron request (Vercel adds this header)
    const authHeader = req.headers.authorization;
    const isCron = req.headers['x-vercel-cron'] === '1' || authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isCron && req.method !== 'GET') {
        res.status(403).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const results = {};

        // Run all scheduled tasks
        results.scoring = await runScoring();
        results.analytics = await runAnalytics();
        results.optimization = await runOptimization();

        results.timestamp = new Date().toISOString();
        results.status = 'completed';

        res.status(200).json(results);
    } catch (error) {
        console.error('Cron Error:', error);
        res.status(500).json({ error: error.message });
    }
};
