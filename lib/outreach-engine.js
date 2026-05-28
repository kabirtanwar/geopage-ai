// Outreach Engine — Message generation with behavioral randomization
// Generates personalized outreach messages with rotating hooks, CTAs, and proof assets

const HOOKS = {
    pain: [
        "Tired of manually writing suburb pages?",
        "Still copy-pasting suburb names into landing pages?",
        "How many hours have you spent on repetitive local SEO pages?",
        "What if suburb pages took 30 seconds instead of 45 minutes?",
        "Your agency's biggest time sink might be suburb pages."
    ],
    proof: [
        "I built a tool that generates suburb pages automatically. Here's what it produced:",
        "Generated this localized page system in 30 seconds. Take a look:",
        "Here's an AI-generated suburb page for a local business. Looks agency-delivered:",
        "Built a system that produces deploy-ready suburb pages. Example output:",
        "This suburb page was generated in under a minute. Fully deployable HTML."
    ],
    speed: [
        "30 seconds. That's how long it takes to generate a suburb page now.",
        "Generated 10 suburb pages in under 5 minutes. Here's proof:",
        "The fastest way to scale local SEO fulfillment:",
        "From brief to deployable suburb page in 30 seconds:",
        "Scale your suburb page production 10x without hiring writers."
    ],
    question: [
        "How do you handle suburb page scaling for your clients?",
        "What's your current process for generating local landing pages?",
        "How many suburb pages do you need to produce per client?",
        "What if you could generate all suburb pages for a client in one sitting?",
        "Ever tried automating your suburb page production?"
    ]
};

const CTA_VARIANTS = [
    "Want to try it free?",
    "Happy to give you free access to test it.",
    "Want me to generate a demo for your niche?",
    "Would this save your agency time?",
    "Want to see it in action for your market?",
    "Interested in testing it for a client?",
    "Want a free demo page for your business?",
    "Should I generate a sample for your niche?"
];

const PLATFORM_TONES = {
    twitter: { greeting: "Hey", closing: "—", casual: true },
    linkedin: { greeting: "Hi", closing: "", casual: false },
    reddit: { greeting: "Hey", closing: "", casual: true },
    facebook: { greeting: "Hey", closing: "—", casual: true },
    email: { greeting: "Hi", closing: "Best,", casual: false }
};

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateMessage(lead, showcaseRef, variant) {
    const tone = PLATFORM_TONES[lead.platform] || PLATFORM_TONES.twitter;
    const hookType = variant || pickRandom(Object.keys(HOOKS));
    const hook = pickRandom(HOOKS[hookType]);
    const cta = pickRandom(CTA_VARIANTS);
    const niche = lead.niche || 'local business';
    const location = lead.location || 'your area';
    const name = lead.name ? lead.name.split(' ')[0] : '';

    const greeting = name ? `${tone.greeting} ${name}` : tone.greeting;

    let message;
    if (tone.casual) {
        message = `${greeting} — ${hook} I built a tool that generates deploy-ready suburb pages for local SEO. ${showcaseRef ? `Here's one I made for a ${niche} business in ${location}: ${showcaseRef}` : ''} ${cta}`;
    } else {
        message = `${greeting}, ${hook} I built a tool that generates deploy-ready suburb pages for local SEO. ${showcaseRef ? `Here's an example for a ${niche} business in ${location}: ${showcaseRef}` : ''} ${cta}`;
    }

    return {
        lead_id: lead.id,
        channel: lead.platform,
        message_text: message.trim(),
        hook_type: hookType,
        cta_used: cta,
        showcase_used: showcaseRef || null,
        tone: tone.casual ? 'casual' : 'professional',
        message_length: message.length
    };
}

function generateBatch(leads, showcaseRefs = {}) {
    return leads.map(lead => {
        const nicheKey = (lead.niche || 'general').toLowerCase().replace(/\s+/g, '_');
        const ref = showcaseRefs[nicheKey] || showcaseRefs.default || null;
        return generateMessage(lead, ref);
    });
}

function getVariantPerformance(outreachLog) {
    const performance = {};
    for (const entry of outreachLog) {
        const key = `${entry.channel}_${entry.hook_type}`;
        if (!performance[key]) performance[key] = { sent: 0, replies: 0, trials: 0 };
        performance[key].sent++;
        if (entry.replied) performance[key].replies++;
        if (entry.trial_given) performance[key].trials++;
    }
    for (const key of Object.keys(performance)) {
        performance[key].reply_rate = performance[key].sent > 0 ? performance[key].replies / performance[key].sent : 0;
        performance[key].trial_rate = performance[key].sent > 0 ? performance[key].trials / performance[key].sent : 0;
    }
    return performance;
}

module.exports = { generateMessage, generateBatch, getVariantPerformance, HOOKS, CTA_VARIANTS, PLATFORM_TONES };
