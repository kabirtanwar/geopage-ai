// Email Outreach Sender — Resend API integration
const fetch = require('node-fetch');
const { dbSelect, dbInsert, dbUpdate } = require('../lib/db');
const { generateBatch } = require('../lib/outreach-engine');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'outreach@geopage-ai.com';
const FROM_NAME = process.env.FROM_NAME || 'Kabir from GeoPage AI';

const EMAIL_TEMPLATES = {
    pain: (lead) => ({
        subject: `Still building suburb pages manually?`,
        body: `Hey ${lead.name || 'there'},

I noticed you're doing local SEO work — specifically around ${lead.niche || 'local services'}.

Quick question: how long does it take you to build suburb landing pages for each client?

I built a tool that generates deploy-ready suburb pages in 30 seconds. Unique content per suburb, SEO metadata, ZIP export. No copy-paste, no writers needed.

Here's what it produced for a ${lead.niche || 'local business'} business: https://geopage-ai.com

Would this save your agency time? Happy to generate a free demo for your niche.

— Kabir`
    }),
    proof: (lead) => ({
        subject: `Generated 10 suburb pages in 5 minutes — here's proof`,
        body: `Hey ${lead.name || 'there'},

Built a system that generates suburb-specific landing pages for local SEO. Each page gets unique content, localized copy, and deploy-ready HTML.

Example output for a ${lead.niche || 'local business'} business: https://geopage-ai.com

10 pages in 5 minutes. ZIP export. Ready to deploy.

Want me to generate a demo for your clients' suburbs?

— Kabir`
    }),
    speed: (lead) => ({
        subject: `30 seconds per suburb page — seriously`,
        body: `Hey ${lead.name || 'there'},

What if suburb page production took 30 seconds instead of 45 minutes?

I built GeoPage AI — it generates unique, deploy-ready suburb landing pages with SEO metadata, local context, and HTML export.

One brief → multiple unique pages → ZIP download → client handoff.

Test it free: https://geopage-ai.com

— Kabir`
    }),
    question: (lead) => ({
        subject: `Quick question about your suburb page workflow`,
        body: `Hey ${lead.name || 'there'},

How are you handling suburb page production for your ${lead.niche || 'local SEO'} clients?

I've been working on a tool that automates this — generates unique local landing pages with SEO metadata and deployable HTML. Seeing agencies cut page production time by 90%.

Curious if this would fit your workflow: https://geopage-ai.com

— Kabir`
    })
};

const HOOK_TYPES = Object.keys(EMAIL_TEMPLATES);

function pickHook() {
    return HOOK_TYPES[Math.floor(Math.random() * HOOK_TYPES.length)];
}

async function sendEmail(to, subject, html) {
    if (!RESEND_API_KEY) {
        console.warn('[Email] No RESEND_API_KEY set, skipping send');
        return { success: false, error: 'No API key' };
    }

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: `${FROM_NAME} <${FROM_EMAIL}>`,
                to: [to],
                subject,
                html
            })
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('[Email] Send failed:', err);
            return { success: false, error: err };
        }

        const data = await res.json();
        return { success: true, id: data.id };
    } catch (err) {
        console.error('[Email] Send error:', err.message);
        return { success: false, error: err.message };
    }
}

async function runOutreachBatch(count = 10) {
    const leads = await dbSelect('leads');
    const eligible = leads.filter(l =>
        l.tier === 'hot' || l.tier === 'warm'
    ).slice(0, count);

    if (eligible.length === 0) {
        console.log('[Outreach] No eligible leads (need hot/warm tier)');
        return { sent: 0, message: 'No eligible leads' };
    }

    const results = { sent: 0, failed: 0, leads: [] };

    for (const lead of eligible) {
        const hookType = pickHook();
        const template = EMAIL_TEMPLATES[hookType](lead);
        const email = lead.email || lead.handle;

        if (!email) {
            results.failed++;
            continue;
        }

        const sendResult = await sendEmail(email, template.subject, template.body.replace(/\n/g, '<br>'));

        await dbInsert('outreach_log', {
            lead_id: lead.id,
            channel: 'email',
            message_variant: hookType,
            message_text: template.body,
            replied: false,
            trial_given: false,
            converted: false,
            sent_at: new Date().toISOString()
        });

        await dbUpdate('leads', {
            touches: (lead.touches || 0) + 1,
            last_touch: new Date().toISOString(),
            status: 'contacted'
        }, { id: lead.id });

        if (sendResult.success) {
            results.sent++;
            results.leads.push({ id: lead.id, email, hook: hookType });
        } else {
            results.failed++;
        }

        // Rate limit: 100ms between sends
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[Outreach] Batch complete: ${results.sent} sent, ${results.failed} failed`);
    return results;
}

module.exports = { sendEmail, runOutreachBatch, EMAIL_TEMPLATES, FROM_EMAIL, FROM_NAME };
