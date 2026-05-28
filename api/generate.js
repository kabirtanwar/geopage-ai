const fetch = require('node-fetch');

const SUPABASE_URL = 'https://dfoejyfmhzjsmqxrdazl.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FREE_GENERATION_LIMIT = 3;

function parseRequestBody(body) {
    if (!body) return {};
    if (typeof body === 'string') { try { return JSON.parse(body); } catch { return {}; } }
    return body;
}

function extractJsonObject(text) {
    const trimmed = text.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('Response did not contain a JSON object.');
    }
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

async function groqCall(apiKey, systemPrompt, userPrompt, maxTokens = 2000, temperature = 0.7) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
            temperature,
            max_tokens: maxTokens
        })
    });
    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Groq API ${response.status}: ${errBody}`);
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty Groq response');
    return extractJsonObject(text);
}

async function verifyAuth(token) {
    if (!token || !SUPABASE_SERVICE_KEY) return null;
    try {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_SERVICE_KEY } });
        if (!r.ok) return null;
        const u = await r.json();
        return u.id || null;
    } catch { return null; }
}

async function checkPaidStatus(userId) {
    if (!userId || !SUPABASE_SERVICE_KEY) return false;
    try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/user_subscriptions?user_id=eq.${userId}&status=eq.active&select=status`, {
            headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }
        });
        if (!r.ok) return false;
        const d = await r.json();
        return d.length > 0;
    } catch { return false; }
}

async function getGenerationCount(userId) {
    if (!userId || !SUPABASE_SERVICE_KEY) return 0;
    try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/user_usage?user_id=eq.${userId}&select=generation_count`, {
            headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }
        });
        if (!r.ok) return 0;
        const d = await r.json();
        return d.length > 0 ? d[0].generation_count : 0;
    } catch { return 0; }
}

const PAGE_STYLES = {
    trust: { name: 'Local Trust', tone: 'warm, dependable, community-rooted', structure: 'Local credibility first, experience-driven, soft CTAs', hero_style: 'personal and grounded, no hype', cta_style: 'gentle invitation', trust_framing: 'local experience, neighborhood familiarity', section_order: ['hero', 'local_hook', 'services', 'process', 'faq', 'cta'], avoid: '"best", "top-rated", "#1"' },
    premium: { name: 'Premium Service', tone: 'confident, polished, high-end', structure: 'Capability-first, differentiator-led, measured pacing', hero_style: 'expertise and standards', cta_style: 'professional consultation', trust_framing: 'certifications, equipment, materials', section_order: ['hero', 'intro', 'services', 'trust', 'process', 'cta'], avoid: 'cheap language, urgency words' },
    emergency: { name: 'Emergency Conversion', tone: 'direct, urgent, action-oriented', structure: 'Problem first, solution immediate, CTA everywhere', hero_style: 'addresses emergency directly', cta_style: '24/7 urgent', trust_framing: 'response time, availability, fast arrival', section_order: ['hero', 'urgency', 'services', 'process', 'faq', 'cta'], avoid: 'long paragraphs, soft language' },
    community: { name: 'Community-Focused', tone: 'friendly, local, invested', structure: 'Community connection first, neighborly trust, local references early', hero_style: 'mentions suburb as a place', cta_style: 'neighborly invitation', trust_framing: 'local roots, community feel', section_order: ['hero', 'local_hook', 'trust', 'services', 'faq', 'cta'], avoid: 'corporate language, impersonal tone' },
    minimal: { name: 'Minimal Clean', tone: 'clean, modern, understated', structure: 'Lean content, strong headlines, more white space', hero_style: 'short, clean, one-line sub', cta_style: 'simple get started', trust_framing: 'clean presentation, professional minimalism', section_order: ['hero', 'services', 'cta'], avoid: 'long text blocks, verbose' },
    commercial: { name: 'Commercial/Business', tone: 'professional, operational, B2B', structure: 'Operational capability first, business pain points, reliability focus', hero_style: 'business/commercial context', cta_style: 'site assessment or commercial quote', trust_framing: 'commercial experience, compliance', section_order: ['hero', 'intro', 'services', 'process', 'trust', 'cta'], avoid: 'residential language, casual tone' }
};

// ============================================================
// STAGE 1: LOCAL INTELLIGENCE + STRATEGY ANALYZER
// Fast, lightweight call that analyzes the suburb and determines page strategy
// ============================================================
async function analyzeLocalIntelligence(apiKey, businessName, service, suburb, baseCity, localContext, pageStyle) {
    const style = PAGE_STYLES[pageStyle] || PAGE_STYLES.trust;

    const systemPrompt = `You are a local market intelligence analyst for a content generation system. Analyze the suburb and business context, then determine the optimal page strategy.

Return a valid JSON object with exactly these keys:

"local_intelligence":
- "suburb_type": (one of: "family suburban", "urban mixed", "semi-rural", "commercial district", "new development", "established neighborhood")
- "housing_profile": (brief: "mostly single-family homes built in 1990s-2010s" or similar)
- "common_pain_points": (array of 2-3 strings: likely service problems in this area)
- "climate_service_concern": (string: climate-related service needs, e.g. "hard water buildup", "summer AC strain")
- "nearby_landmarks": (array of 2-3 strings: real or plausible nearby landmarks/features)
- "neighborhood_vibe": (string: "quiet family-oriented" or "bustling commercial corridor" etc.)
- "local_customer_profile": (string: "busy working families" or "established homeowners" etc.)

"page_strategy":
- "dominant_angle": (one of: "speed", "quality", "local_expertise", "problem_urgency", "community", "commercial")
- "emotional_hook": (string: the primary emotional trigger for this suburb/style combo)
- "cta_intensity": (one of: "soft", "moderate", "strong")
- "trust_approach": (string: how to build trust — "years of local experience", "fast response guarantees", "community roots", etc.)
- "content_pacing": (string: "quick and scannable" or "detailed and thorough" or "conversational and warm")
- "section_emphasis": (array of 2-3 strings: which sections matter most — ["services", "faq", "process"] etc.)

STRICT RULES:
- Do NOT invent fake statistics or awards
- Do NOT claim certifications unless provided
- Keep references plausible, not hyper-specific
- Output ONLY valid JSON, no text outside the object`;

    const userPrompt = `Business: ${businessName}
Service: ${service}
Suburb: ${suburb}
City: ${baseCity}
User Context: ${localContext || 'None'}
Style: ${style.name}`;

    return await groqCall(apiKey, systemPrompt, userPrompt, 800, 0.5);
}

// ============================================================
// STAGE 2: MAIN PAGE GENERATION
// Full generation using local intelligence + strategy as structured context
// ============================================================
async function generatePageContent(apiKey, businessName, service, suburb, baseCity, localContext, pageStyle, intelligence) {
    const style = PAGE_STYLES[pageStyle] || PAGE_STYLES.trust;
    const li = intelligence.local_intelligence || {};
    const ps = intelligence.page_strategy || {};

    const systemPrompt = `You are an elite local SEO copywriter producing a landing page that reads like it was written by a human agency copywriter, not AI.

=== LOCAL INTELLIGENCE (use this to make content specific and grounded) ===
Suburb type: ${li.suburb_type || 'suburban'}
Housing: ${li.housing_profile || 'mixed residential'}
Pain points: ${(li.common_pain_points || []).join(', ')}
Climate concerns: ${li.climate_service_concern || 'standard'}
Nearby landmarks: ${(li.nearby_landmarks || []).join(', ')}
Neighborhood vibe: ${li.neighborhood_vibe || 'community-focused'}
Customer profile: ${li.local_customer_profile || 'local residents'}

=== PAGE STRATEGY (follow these directives) ===
Angle: ${ps.dominant_angle || 'local_expertise'}
Emotional hook: ${ps.emotional_hook || 'trust and reliability'}
CTA intensity: ${ps.cta_intensity || 'moderate'}
Trust approach: ${ps.trust_approach || 'local experience'}
Pacing: ${ps.content_pacing || 'conversational'}
Section emphasis: ${(ps.section_emphasis || ['services', 'faq']).join(', ')}

=== STYLE CONFIGURATION ===
Tone: ${style.tone}
Structure: ${style.structure}
Hero: ${style.hero_style}
CTA: ${style.cta_style}
Trust: ${style.trust_framing}
Avoid: ${style.avoid}
Section order: ${style.section_order.join(' → ')}

=== VOICE RULES ===
- Write like a human who has done this work in this area
- Use natural contractions (we're, you'll, we've)
- Vary sentence length dramatically (2-word sentences mixed with 25-word sentences)
- Never start two consecutive sentences the same way
- Include at least ONE sentence that proves you know this specific area
- Use the local landmarks and pain points from the intelligence above
- NEVER use: "comprehensive solutions", "cutting-edge", "leverage", "utilize", "streamline", "understanding the unique challenges", "we pride ourselves on", "committed to excellence"
- Every paragraph must have different rhythm — no symmetric blocks
- The content should feel like it was written by someone who drove through this suburb yesterday

=== OUTPUT FORMAT ===
Return a valid JSON object with exactly these keys:

"meta_title": SEO title (50-60 chars, service + suburb, no clickbait)
"meta_description": Search snippet (140-155 chars, includes CTA)
"headline": H1 — specific to this suburb + service, no hype words
"subheadline": One line focused on what customer gets
"local_hook": 1-2 sentences referencing something specific about this suburb
"paragraphs": Array of 3-5 paragraph strings. VARY length: some 2 sentences, some 4-5. Each must feel different from the others.
"services": Array of 3-4 niche-specific service strings
"process_steps": Array of exactly 3 objects with "step" (1-3) and "description" (natural sentence)
"faq": Array of exactly 3 objects with "q" and "a" — questions must sound like real customers
"cta_text": Action CTA matching style
"trust_signal": One sentence of local trust framing
"section_order": The order to display sections on the page (array from: hero, local_hook, intro, services, process, trust, faq, urgency, cta)

STRICT RULES:
1. Never claim licensed/insured/bonded/certified unless user provided it
2. Never invent statistics
3. Every sentence must reference something specific (suburb name, service type, local condition)
4. Do NOT output any text outside the JSON`;

    const userPrompt = `Business: ${businessName}
Service: ${service}
Suburb: ${suburb}
City: ${baseCity}
Context: ${localContext || 'None'}
Style: ${style.name}`;

    return await groqCall(apiKey, systemPrompt, userPrompt, 2200, 0.8);
}

// ============================================================
// MAIN HANDLER
// ============================================================
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

    try {
        // STAGE 1: Local Intelligence + Strategy Analysis (fast, lightweight)
        const intelligence = await analyzeLocalIntelligence(apiKey, businessName, service, suburb, baseCity, localContext, pageStyle);

        // STAGE 2: Main Page Generation (full, uses intelligence as context)
        const pageContent = await generatePageContent(apiKey, businessName, service, suburb, baseCity, localContext, pageStyle, intelligence);

        // Attach metadata
        pageContent._style = pageStyle;
        pageContent._styleName = PAGE_STYLES[pageStyle]?.name || 'Local Trust';
        pageContent._intelligence = intelligence.local_intelligence || {};
        pageContent._strategy = intelligence.page_strategy || {};

        res.status(200).json({ suburb, content: pageContent });

    } catch (error) {
        console.error("Orchestration Error:", error);
        res.status(500).json({ error: `Generation error: ${error.message}` });
    }
};
