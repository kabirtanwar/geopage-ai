const fetch = require('node-fetch');

const SUPABASE_URL = 'https://dfoejyfmhzjsmqxrdazl.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FREE_GENERATION_LIMIT = 3;

function parseRequestBody(body) {
    if (!body) return {};
    if (typeof body === 'string') {
        try { return JSON.parse(body); } catch { return {}; }
    }
    return body;
}

function extractJsonObject(text) {
    const trimmed = text.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('Groq response did not contain a JSON object.');
    }
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

async function verifyAuth(token) {
    if (!token || !SUPABASE_SERVICE_KEY) return null;
    try {
        const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_SERVICE_KEY }
        });
        if (!response.ok) return null;
        const user = await response.json();
        return user.id || null;
    } catch { return null; }
}

async function checkPaidStatus(userId) {
    if (!userId || !SUPABASE_SERVICE_KEY) return false;
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/user_subscriptions?user_id=eq.${userId}&status=eq.active&select=status`,
            { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' } }
        );
        if (!response.ok) return false;
        const data = await response.json();
        return data.length > 0;
    } catch { return false; }
}

async function getGenerationCount(userId) {
    if (!userId || !SUPABASE_SERVICE_KEY) return 0;
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/user_usage?user_id=eq.${userId}&select=generation_count`,
            { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' } }
        );
        if (!response.ok) return 0;
        const data = await response.json();
        return data.length > 0 ? data[0].generation_count : 0;
    } catch { return 0; }
}

// Page style definitions that control tone, structure, and variation
const PAGE_STYLES = {
    trust: {
        name: 'Local Trust',
        tone: 'warm, dependable, community-rooted. Like a neighbor who happens to be an expert.',
        structure: 'Start with local credibility. Lead with experience in the area. Use soft CTAs.',
        paragraph_rhythm: 'Vary paragraph length: one short punchy sentence, then 3-4 longer sentences, then a short closing line.',
        hero_style: 'Headline should feel personal and grounded. No hype words.',
        cta_style: 'Gentle invitation: "Call us today" or "Request a visit"',
        trust_framing: 'Years of local experience, neighborhood familiarity, personal service',
        avoid: '"best", "top-rated", "#1", "unmatched", "world-class"'
    },
    premium: {
        name: 'Premium Service',
        tone: 'confident, polished, high-end. Communicates quality without arrogance.',
        structure: 'Start with what makes this business different. Lead with capability.',
        paragraph_rhythm: 'Consistent medium-length paragraphs. Clean and measured.',
        hero_style: 'Headline should convey expertise and standards.',
        cta_style: 'Professional: "Schedule a Consultation" or "Discuss Your Project"',
        trust_framing: 'Certifications, specialized equipment, quality materials, warranty',
        avoid: 'cheap language, urgency words, exclamation marks, "call now!!!"'
    },
    emergency: {
        name: 'Emergency Conversion',
        tone: 'direct, urgent, action-oriented. Every section pushes toward a call.',
        structure: 'Lead with the problem. Immediately offer the solution. CTA in every section.',
        paragraph_rhythm: 'Short paragraphs. Heavy use of line breaks. Quick scannable sections.',
        hero_style: 'Headline addresses the emergency directly. "Need [service] NOW?"',
        cta_style: 'Urgent: "Call Now - 24/7" or "Emergency Service Available"',
        trust_framing: 'Response time, availability, fast arrival, same-day service',
        avoid: 'long paragraphs, theoretical content, soft language, unnecessary detail'
    },
    community: {
        name: 'Community-Focused',
        tone: 'friendly, local, invested. Speaks like someone who lives in the suburb.',
        structure: 'Start with community connection. Reference local life. Build from neighborly trust.',
        paragraph_rhythm: 'Conversational. Mix short and long. Use "we" and "you" heavily.',
        hero_style: 'Headline should mention the suburb as a place, not just a service area.',
        cta_style: 'Neighborly: "Give us a call" or "Let us know how we can help"',
        trust_framing: 'Local roots, community involvement, family business feel, knowing the area',
        avoid: 'corporate language, impersonal tone, generic service descriptions'
    },
    minimal: {
        name: 'Minimal Clean',
        tone: 'clean, modern, understated. Lets the work speak for itself.',
        structure: 'Lean content. Strong headlines. Fewer paragraphs. More white space.',
        paragraph_rhythm: 'Very short. 2-3 sentences max per section. Let breathing room do the work.',
        hero_style: 'Short, clean headline. One line subheadline.',
        cta_style: 'Simple: "Get Started" or "Contact Us"',
        trust_framing: 'Portfolio of work, clean presentation, professional minimalism',
        avoid: 'long text blocks, excessive detail, verbose explanations, filler'
    },
    commercial: {
        name: 'Commercial/Business',
        tone: 'professional, operational, B2B. Speaks to facility managers and business owners.',
        structure: 'Lead with operational capability. Address business pain points. Focus on reliability.',
        paragraph_rhythm: 'Professional and measured. Data-oriented where possible.',
        hero_style: 'Headline should reference business/commercial context.',
        cta_style: 'Business: "Request a Site Assessment" or "Get a Commercial Quote"',
        trust_framing: 'Commercial experience, business-grade equipment, compliance, insurance',
        avoid: 'residential language, casual tone, home-focused imagery'
    }
};

function buildOrchestrationPrompt(pageStyle, localContext) {
    const style = PAGE_STYLES[pageStyle] || PAGE_STYLES.trust;
    const localRef = localContext || 'the local area';

    return `You are an elite local SEO content strategist who thinks like a human copywriter, not an AI. Your job is to produce a landing page that could pass as written by a real agency for a real client.

=== ORCHESTRATION PROCESS (do this internally, do NOT output these steps) ===

STEP 1 - LOCAL INTELLIGENCE ANALYSIS:
Think about this suburb. What type of area is it? What are the likely housing styles, service needs, climate concerns, and community feel? Consider:
- Is it suburban residential, urban mixed, or semi-rural?
- What service problems are most common here?
- What tone earns trust in this type of community?
- What local landmarks or geographic features shape daily life?

STEP 2 - CONTENT ANGLE SELECTION:
Based on the local analysis, choose ONE dominant angle for this page:
- Speed/responsiveness angle
- Quality/craftsmanship angle
- Local expertise/area knowledge angle
- Problem-solution urgency angle
- Community relationship angle
- Professional/commercial capability angle

STEP 3 - STRUCTURAL VARIATION:
Do NOT use a symmetric 3-paragraph layout. Vary the structure:
- Mix paragraph lengths (some 2 sentences, some 5)
- Use different sentence starters (never start two consecutive sentences the same way)
- Include at least one specific detail that proves local knowledge
- Use the CTA text that fits the chosen style

STEP 4 - VOICE CONSISTENCY:
Write as if the business owner described their service to you over coffee.
- Use natural contractions where appropriate
- Reference specific local conditions
- Sound like someone who has done this work in this area before
- Never use: "comprehensive solutions", "cutting-edge", "leverage", "utilize", "streamline"

=== STYLE CONFIGURATION ===
Tone: ${style.tone}
Structure rule: ${style.structure}
Paragraph rhythm: ${style.paragraph_rhythm}
Hero approach: ${style.hero_style}
CTA direction: ${style.cta_style}
Trust framing: ${style.trust_framing}
NEVER use: ${style.avoid}

=== OUTPUT FORMAT ===
Return a valid JSON object with exactly these keys:

- "meta_title": SEO title (50-60 chars, contains service + suburb, no clickbait)
- "meta_description": Search snippet (140-155 chars, includes call to action)
- "headline": H1 — specific, grounded, no hype. Must reference both service AND suburb.
- "subheadline": One line. Focused on what the customer gets, not what the business does.
- "local_hook": A 1-2 sentence opening that references something specific about this suburb or area. Proves local knowledge.
- "paragraph_1": The main service story. 4-6 sentences. Vary sentence length. Include at least one concrete detail about the service process.
- "paragraph_2": The trust/response story. 3-5 sentences. How they work, what to expect, what happens next.
- "services": Array of 3-4 specific services. Each must be niche-specific, not generic. Example: "Tankless Water Heater Installation" not "Plumbing Services".
- "process_steps": Array of exactly 3 steps. Each: {"step": N, "description": "one natural sentence"}. Written like explaining to a neighbor, not a manual.
- "faq": Array of exactly 3 objects with "q" and "a". Questions must sound like real customer questions. Answers must be 1-2 sentences, specific, not evasive.
- "cta_text": Action-oriented CTA that matches the chosen style.
- "trust_signal": A single sentence of local trust framing. Something like "Serving ${localRef} with 15+ years of hands-on experience" or similar.
- "variation_seed": A number 1-1000 that represents the structural variation used (so suburb pages look different)

STRICT CONTENT RULES:
1. Never claim: licensed, insured, bonded, certified, award-winning, guaranteed, code-compliant, locally-owned — unless user provided it
2. Never say: "serving residents and visitors", "complete satisfaction", "industry-leading"
3. Never use statistics you invented
4. Every sentence must contain at least one specific detail (suburb name, service type, local condition)
5. The meta_title and headline must be noticeably different from any generic template
6. Do NOT output any text outside the JSON object`;

}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const body = parseRequestBody(req.body);
    const businessName = String(body.businessName || '').trim();
    const service = String(body.service || '').trim();
    const suburb = String(body.suburb || '').trim();
    const baseCity = String(body.baseCity || '').trim();
    const localContext = String(body.localContext || '').trim();
    const pageStyle = String(body.pageStyle || 'trust').trim();

    if (!businessName || !service || !suburb || !baseCity) {
        res.status(400).json({ error: 'Missing required parameters.' });
        return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        res.status(500).json({ error: 'GROQ_API_KEY not configured.' });
        return;
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    const userId = await verifyAuth(token);

    if (userId) {
        const isPaid = await checkPaidStatus(userId);
        if (!isPaid) {
            const count = await getGenerationCount(userId);
            if (count >= FREE_GENERATION_LIMIT) {
                res.status(403).json({ error: 'Free generation limit reached. Upgrade for unlimited.', code: 'LIMIT_REACHED' });
                return;
            }
        }
    }

    const systemPrompt = buildOrchestrationPrompt(pageStyle, localContext);

    const userPrompt = `Business Name: ${businessName}
Primary Service: ${service}
Target Suburb: ${suburb}
Parent City: ${baseCity}
Local Context: ${localContext || 'No additional context provided'}
Page Style: ${PAGE_STYLES[pageStyle]?.name || 'Local Trust'}`;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0.8,
                max_tokens: 2500
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Groq API status ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        const responseText = data.choices?.[0]?.message?.content;
        if (!responseText) throw new Error('Groq API response structure is invalid.');

        const parsedContent = extractJsonObject(responseText);

        // Attach the style metadata for frontend rendering
        parsedContent._style = pageStyle;
        parsedContent._styleName = PAGE_STYLES[pageStyle]?.name || 'Local Trust';

        res.status(200).json({ suburb, content: parsedContent });

    } catch (error) {
        console.error("Serverless API Error:", error);
        res.status(500).json({ error: `Generation error: ${error.message}` });
    }
};
