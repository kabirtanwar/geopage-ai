// Cron API — Autonomous job runner (Supabase-backed)
const { dbSelect, dbInsert, dbUpdate } = require('../lib/db');
const { scoreAllLeads } = require('../lib/lead-scorer');
const { analyzePerformance, generateRecommendations, calculateChannelAllocation } = require('../lib/self-healer');
const { runScraper } = require('../lib/scraper');
const { runOutreachBatch } = require('../lib/email-sender');

async function isKillSwitchActive() {
    const rows = await dbSelect('system_config', { key: 'kill_switch' });
    return rows.length > 0 && rows[0].value === 'true';
}

async function runScoring() {
    const leads = await dbSelect('leads');
    if (leads.length === 0) return { action: 'scoring', result: 'no leads to score' };
    const scored = scoreAllLeads(leads);
    for (const lead of scored) {
        await dbUpdate('leads', { pain_score: lead.pain_score, response_probability: lead.response_probability, tier: lead.tier }, { id: lead.id });
    }
    const tiers = { hot: 0, warm: 0, cool: 0, cold: 0 };
    scored.forEach(l => tiers[l.tier]++);
    return { action: 'scoring', scored: scored.length, tiers };
}

async function runAnalytics() {
    const outreach = await dbSelect('outreach_log');
    const leads = await dbSelect('leads');
    return {
        action: 'analytics',
        touches_sent: outreach.length,
        replies_received: outreach.filter(o => o.replied).length,
        trials_given: outreach.filter(o => o.trial_given).length,
        total_leads: leads.length,
        hot_leads: leads.filter(l => l.tier === 'hot').length
    };
}

async function runOptimization() {
    const outreach = await dbSelect('outreach_log');
    const performance = analyzePerformance(outreach, {});
    const recommendations = generateRecommendations(performance);
    const allocation = calculateChannelAllocation(performance);
    await dbInsert('optimization_log', { action: 'optimization_cycle', details: { recommendations, allocation }, impact: 'auto' });
    return { action: 'optimization', recommendations_count: recommendations.length, allocation };
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
        if (await isKillSwitchActive()) {
            res.status(200).json({ status: 'paused', message: 'Kill switch active. All cron jobs paused.', timestamp: new Date().toISOString() });
            return;
        }

        const results = {};

        // 1. Scrape new leads
        results.scraping = await runScraper();

        // 2. Score all leads
        results.scoring = await runScoring();

        // 3. Send outreach to eligible leads
        results.outreach = await runOutreachBatch(20);

        // 4. Analytics
        results.analytics = await runAnalytics();

        // 5. Optimization
        results.optimization = await runOptimization();

        results.timestamp = new Date().toISOString();
        results.status = 'completed';
        res.status(200).json(results);
    } catch (error) {
        console.error('Cron Error:', error);
        res.status(500).json({ error: error.message });
    }
};
