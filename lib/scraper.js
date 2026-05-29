// Lead Scraper — finds prospects from web sources
const fetch = require('node-fetch');
const { dbInsert, dbSelect } = require('../lib/db');

const HIGH_VALUE_NICHES = ['plumbing', 'hvac', 'roofing', 'dentist', 'dental', 'pest control', 'landscaping', 'electrical', 'garage door', 'locksmith', 'cleaning', 'moving', 'painting'];
const SEO_KEYWORDS = ['local seo', 'suburb pages', 'landing pages', 'local landing pages', 'service area pages', 'geo pages', 'local seo agency'];
const REDDIT_SUBREDDITS = ['SEO', 'bigseo', 'localSEO', 'agency', 'Entrepreneur', 'smallbusiness'];

async function scrapeRedditLeads() {
    const leads = [];

    for (const sub of REDDIT_SUBREDDITS) {
        try {
            const res = await fetch(`https://www.reddit.com/r/${sub}/search.json?q=local+seo+OR+suburb+pages+OR+landing+pages&sort=new&limit=25&t=month`, {
                headers: { 'User-Agent': 'GeoPageAI/1.0 (research bot)' }
            });

            if (!res.ok) continue;
            const data = await res.json();
            const posts = data?.data?.children || [];

            for (const post of posts) {
                const p = post.data;
                if (!p.author || p.author === '[deleted]') continue;

                const text = `${p.title || ''} ${p.selftext || ''}`.toLowerCase();
                const isRelevant = SEO_KEYWORDS.some(kw => text.includes(kw)) ||
                    HIGH_VALUE_NICHES.some(n => text.includes(n));

                if (isRelevant) {
                    leads.push({
                        name: p.author,
                        platform: 'reddit',
                        handle: `u/${p.author}`,
                        niche: extractNiche(text),
                        location: extractLocation(text),
                        notes: p.title,
                        source: `r/${sub}`,
                        source_url: `https://reddit.com${p.permalink}`,
                        metadata: { score: p.score, comments: p.num_comments }
                    });
                }
            }

            // Rate limit: 1 second between subreddits
            await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
            console.error(`[Scraper] Reddit r/${sub} error:`, err.message);
        }
    }

    return leads;
}

async function scrapeTwitterLeads() {
    // Twitter requires API access for scraping
    // This uses web search to find Twitter profiles discussing local SEO
    const leads = [];
    const queries = [
        'site:twitter.com "suburb pages" OR "local seo" OR "landing pages" agency',
        'site:twitter.com "local seo" freelancer looking for tool',
        'site:twitter.com "service area pages" OR "geo pages" build'
    ];

    for (const query of queries) {
        try {
            // Use a simple web search approach
            // In production, you'd use Twitter API or a scraping service
            console.log(`[Scraper] Twitter query: ${query}`);
            // Placeholder — would need Twitter API key for actual scraping
        } catch (err) {
            console.error('[Scraper] Twitter error:', err.message);
        }
    }

    return leads;
}

function extractNiche(text) {
    for (const niche of HIGH_VALUE_NICHES) {
        if (text.includes(niche)) return niche;
    }
    if (text.includes('seo') || text.includes('marketing')) return 'seo/marketing';
    if (text.includes('agency') || text.includes('freelance')) return 'agency';
    return '';
}

function extractLocation(text) {
    // Simple location extraction from common patterns
    const stateMatch = text.match(/\b(TX|AZ|CO|FL|CA|NY|IL|OH|PA|GA|NC|MI|NJ|VA|WA|MA|TN|IN|MO|MD|WI|MN|CO|SC|AL|LA|KY|OR|OK|CT|UT|IA|NV|AR|MS|KS|NM|NE|ID|WV|HI|NH|ME|MT|RI|DE|SD|ND|AK|VT|WY|DC)\b/);
    return stateMatch ? stateMatch[0] : '';
}

async function deduplicateLeads(newLeads) {
    const existing = await dbSelect('leads');
    const existingHandles = new Set(existing.map(l => l.handle).filter(Boolean));
    const existingNames = new Set(existing.map(l => l.name).filter(Boolean));

    return newLeads.filter(lead => {
        if (lead.handle && existingHandles.has(lead.handle)) return false;
        if (lead.name && existingNames.has(lead.name)) return false;
        return true;
    });
}

async function saveLeads(leads) {
    let saved = 0;
    for (const lead of leads) {
        const result = await dbInsert('leads', {
            name: lead.name || '',
            platform: lead.platform || 'web',
            handle: lead.handle || '',
            niche: lead.niche || '',
            location: lead.location || '',
            email: lead.email || '',
            pain_score: 0,
            response_probability: 0,
            tier: 'cold',
            status: 'new',
            touches: 0,
            notes: lead.notes || '',
            source: lead.source || '',
            source_url: lead.source_url || '',
            metadata: lead.metadata || {}
        });
        if (result) saved++;
    }
    return saved;
}

async function runScraper() {
    console.log('[Scraper] Starting lead scrape...');

    const redditLeads = await scrapeRedditLeads();
    console.log(`[Scraper] Reddit: ${redditLeads.length} prospects found`);

    const allLeads = [...redditLeads];
    const uniqueLeads = await deduplicateLeads(allLeads);
    console.log(`[Scraper] After dedup: ${uniqueLeads.length} new leads`);

    const saved = await saveLeads(uniqueLeads);
    console.log(`[Scraper] Saved: ${saved} leads`);

    return { total: allLeads.length, unique: uniqueLeads.length, saved };
}

module.exports = { runScraper, scrapeRedditLeads, scrapeTwitterLeads, deduplicateLeads, saveLeads };
