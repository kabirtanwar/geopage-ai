// Showcase Factory — generates proof assets via the full pipeline
const { generateShowcasePlan, getShowcaseRefPath } = require('../lib/showcase-factory');
const { dbInsert } = require('../lib/db');
const gen = require('./generate');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) { res.status(500).json({ error: 'GROQ_API_KEY not configured.' }); return; }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const niches = body.niches || null;
    const plan = generateShowcasePlan(niches);

    // Generate up to 3 per request to stay within Vercel timeout
    const batch = plan.slice(0, 3);
    const results = [];

    for (const item of batch) {
        try {
            const content = await gen.generateFullPage(
                apiKey,
                item.business_name,
                item.service,
                item.suburb,
                item.city,
                '',
                item.style
            );

            let db_saved = false;
            try {
                const result = await dbInsert('showcase_assets', {
                    niche: item.niche,
                    suburb: item.suburb.split(',')[0],
                    style: item.style,
                    status: 'ready',
                    business_name: item.business_name,
                    service: item.service,
                    content_json: content,
                    file_path: getShowcaseRefPath(item.niche, item.suburb, item.style),
                    created_at: new Date().toISOString()
                });
                db_saved = !!result;
            } catch (e) { db_saved = false; }

            results.push({
                niche: item.niche,
                suburb: item.suburb.split(',')[0],
                style: item.style,
                status: 'ready',
                headline: content.headline,
                content: content,
                db_saved: db_saved
            });
        } catch (err) {
            results.push({
                niche: item.niche,
                suburb: item.suburb.split(',')[0],
                style: item.style,
                status: 'error',
                error: err.message
            });
        }
    }

    res.status(200).json({
        success: results.filter(r => r.status === 'ready').length,
        failed: results.filter(r => r.status !== 'ready').length,
        total: plan.length,
        batch_size: batch.length,
        results
    });
};
