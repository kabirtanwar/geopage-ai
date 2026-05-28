// Lead Scoring Engine — Rule-based, zero AI cost
// Scores leads 0-100 based on weighted factors

const HIGH_VALUE_NICHES = ['plumbing', 'hvac', 'roofing', 'dentist', 'dental', 'pest control', 'landscaping', 'electrical', 'garage door'];
const PAIN_SIGNALS = ['tired of', 'need to scale', 'looking for', 'manual', 'painful', 'slow', 'frustrating', 'wasting time', 'need tool', 'automation', 'suburb pages', 'landing pages', 'local seo', 'service area'];
const PLATFORM_WEIGHTS = { twitter: 1.0, linkedin: 0.9, reddit: 0.7, facebook: 0.5, email: 0.4 };

function scoreNiche(niche) {
    if (!niche) return 10;
    const n = niche.toLowerCase();
    for (const high of HIGH_VALUE_NICHES) {
        if (n.includes(high)) return 25;
    }
    if (n.includes('seo') || n.includes('marketing') || n.includes('agency')) return 20;
    if (n.includes('service') || n.includes('contractor')) return 18;
    return 10;
}

function scorePlatform(platform) {
    return Math.round((PLATFORM_WEIGHTS[platform?.toLowerCase()] || 0.5) * 25);
}

function scorePainSignals(lead) {
    const text = [lead.notes, lead.bio, ...(lead.recent_posts || [])].join(' ').toLowerCase();
    let score = 0;
    for (const signal of PAIN_SIGNALS) {
        if (text.includes(signal)) score += 5;
    }
    return Math.min(score, 25);
}

function scoreRecency(lastTouch) {
    if (!lastTouch) return 15;
    const hoursSince = (Date.now() - new Date(lastTouch).getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) return 15;
    if (hoursSince < 72) return 10;
    if (hoursSince < 168) return 5;
    return 2;
}

function scoreCompleteness(lead) {
    let score = 0;
    if (lead.name) score += 2;
    if (lead.handle) score += 2;
    if (lead.niche) score += 2;
    if (lead.location) score += 2;
    if (lead.platform) score += 2;
    return score;
}

function scoreLead(lead) {
    const niche = scoreNiche(lead.niche);
    const platform = scorePlatform(lead.platform);
    const pain = scorePainSignals(lead);
    const recency = scoreRecency(lead.last_touch);
    const completeness = scoreCompleteness(lead);
    const total = Math.min(niche + platform + pain + recency + completeness, 100);

    let tier = 'cold';
    if (total >= 80) tier = 'hot';
    else if (total >= 60) tier = 'warm';
    else if (total >= 40) tier = 'cool';

    return { score: total, tier, breakdown: { niche, platform, pain, recency, completeness } };
}

function scoreAllLeads(leads) {
    return leads.map(lead => {
        const { score, tier, breakdown } = scoreLead(lead);
        return { ...lead, pain_score: score, response_probability: score / 100, tier, scoring_breakdown: breakdown };
    });
}

function getTopLeads(leads, count = 50) {
    return scoreAllLeads(leads)
        .filter(l => l.tier === 'hot' || l.tier === 'warm')
        .sort((a, b) => b.pain_score - a.pain_score)
        .slice(0, count);
}

module.exports = { scoreLead, scoreAllLeads, getTopLeads, HIGH_VALUE_NICHES, PAIN_SIGNALS };
