const fetch = require('node-fetch');

const SUPABASE_URL = 'https://dfoejyfmhzjsmqxrdazl.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FREE_GENERATION_LIMIT = 3;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // max requests per window per IP
const rateLimits = new Map();

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
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
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
        return u.email || null;
    } catch { return null; }
}

async function checkPaidStatus(userEmail) {
    if (!userEmail || !SUPABASE_SERVICE_KEY) return false;
    try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/user_subscriptions?email=eq.${encodeURIComponent(userEmail)}&status=eq.active&select=status`, {
            headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }
        });
        if (!r.ok) return false;
        const d = await r.json();
        return d.length > 0;
    } catch { return false; }
}

async function getGenerationCount(userEmail) {
    if (!userEmail || !SUPABASE_SERVICE_KEY) return 0;
    try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/user_usage?email=eq.${encodeURIComponent(userEmail)}&select=generation_count`, {
            headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }
        });
        if (!r.ok) return 0;
        const d = await r.json();
        return d.length > 0 ? d[0].generation_count : 0;
    } catch { return 0; }
}

// ============================================================
// VERIFIED LOCALITY CACHE
// Real landmarks, housing profiles, and climate data for known suburbs
// AI may ONLY reference these verified facts + safe regional generalizations
// ============================================================
const LOCALITY_CACHE = {
    'sugar land': { landmarks: ['Sugar Land Town Square', 'First Colony Mall', 'Oyster Creek'], housing: 'family-oriented suburban homes, master-planned communities', climate: ['hard water buildup', 'hot humid summers straining HVAC'], vibe: 'upper-middle-class family suburban', service_patterns: ['water heater replacements', 'seasonal HVAC tune-ups', 'irrigation repairs'] },
    'katy': { landmarks: ['Katy Mills Mall', 'Typhoon Texas', 'LaCenterra'], housing: 'rapidly growing suburban, mix of new and established', climate: ['humid summers', 'occasional freezing in winter'], vibe: 'fast-growing family suburb', service_patterns: ['new construction plumbing', 'AC installation for newer homes'] },
    'the woodlands': { landmarks: ['The Woodlands Waterway', 'Market Street', 'Cynthia Woods Mitchell Pavilion'], housing: 'upscale planned community, mature trees, larger lots', climate: ['humid subtropical', 'heavy tree canopy affects roofing'], vibe: 'upscale nature-integrated community', service_patterns: ['tree-related roof damage', 'luxury home HVAC systems'] },
    'pearland': { landmarks: ['Pearland Town Center', 'Shadow Creek Ranch', 'Brookside Municipal Park'], housing: 'diverse mix, newer subdivisions, family-oriented', climate: ['Gulf Coast humidity', 'hurricane season preparation'], vibe: 'diverse family suburb', service_patterns: ['drainage issues', 'hurricane prep services'] },
    'cypress': { landmarks: ['Towne Lake', 'Boardwalk at Towne Lake', 'Bridgeland'], housing: 'newer master-planned, large family homes', climate: ['hot summers', 'clay soil shifting'], vibe: 'new development family suburb', service_patterns: ['foundation-related plumbing', 'new home HVAC installs'] },
    'scottsdale ranch': { landmarks: ['Scottsdale Ranch Park', 'Lake Serena', 'Gainey Ranch Golf Club'], housing: 'established upscale suburban, 1980s-2000s builds', climate: ['extreme summer heat', 'monsoon season', 'hard water'], vibe: 'upscale established desert suburban', service_patterns: ['AC strain from extreme heat', 'pool equipment repairs', 'hard water treatment'] },
    'frisco': { landmarks: ['Frisco Square', 'Dr Pepper Ballpark', 'Stonebriar Centre', 'The Star'], housing: 'mix of established and new construction, family-oriented', climate: ['hail storms', 'hot summers', 'occasional ice storms'], vibe: 'fast-growing sports-oriented family city', service_patterns: ['hail damage repairs', 'storm damage restoration', 'new construction services'] },
    'lakewood': { landmarks: ['Bear Creek Lake Park', 'Lakewood Cultural Center', 'Denver Federal Center'], housing: 'mix of mid-century and newer, diverse neighborhoods', climate: ['dry climate', 'freeze-thaw cycles', 'heavy snow loads'], vibe: 'established diverse Colorado community', service_patterns: ['freeze-thaw pipe damage', 'winter heating emergencies', 'dry climate plumbing'] },
    'scottsdale': { landmarks: ['Old Town Scottsdale', 'Scottsdale Fashion Square', 'Camelback Mountain'], housing: 'diverse from luxury to mid-range, resort influences', climate: ['extreme desert heat', 'monsoon season', 'very hard water'], vibe: 'desert resort city, tourism-influenced', service_patterns: ['extreme cooling demands', 'pool/spa equipment', 'commercial hospitality HVAC'] },
    'houston': { landmarks: ['Space Center Houston', 'Houston Galleria', 'Buffalo Bayou Park', 'NRG Stadium'], housing: 'massive metro, diverse from urban core to suburbs', climate: ['extreme humidity', 'hurricane risk', 'flooding concerns'], vibe: 'major metro with strong neighborhood identity', service_patterns: ['flood damage restoration', 'humidity-related HVAC', 'slab foundation plumbing'] },
    'phoenix': { landmarks: ['Camelback Mountain', 'Phoenix Sky Harbor', 'Desert Botanical Garden', 'Talking Stick Resort'], housing: 'sprawling desert metro, stucco homes, pool communities', climate: ['extreme summer heat 110F+', 'monsoon dust storms', 'very hard water'], vibe: 'desert metro, heat-driven lifestyle', service_patterns: ['extreme AC demand', 'pool equipment', 'hard water scaling'] },
    'dallas': { landmarks: ['Reunion Tower', 'Dallas Arboretum', 'Deep Ellum', 'AT&T Stadium'], housing: 'diverse metro, mix of historic and modern', climate: ['hot summers', 'hail storms', 'ice storms'], vibe: 'major Texas metro, strong neighborhood identity', service_patterns: ['storm damage', 'older home plumbing', 'commercial HVAC'] },
    'denver': { landmarks: ['Red Rocks Amphitheatre', 'Union Station', 'Rocky Mountain Arsenal'], housing: 'urban core to mountain suburbs, mix of old and new', climate: ['dry altitude', 'heavy snow', 'freeze-thaw', '300+ sunny days'], vibe: 'mountain metro, outdoor-oriented', service_patterns: ['freeze-thaw pipe issues', 'snow load roofing', 'dry climate plumbing'] },
    'austin': { landmarks: ['Texas State Capitol', 'Barton Springs Pool', 'South Congress', 'The Domain'], housing: 'rapidly growing, tech-influenced, mix of old and new', climate: ['hot summers', 'flash flooding', ' limestone terrain'], vibe: 'tech-hub with local culture', service_patterns: ['flash flood drainage', 'limestone foundation issues', 'new construction'] },
};

// Regional fallback for unknown suburbs
const REGIONAL_PATTERNS = {
    texas: { climate: ['hot summers', 'occasional freezes', 'hail storms'], housing: 'mix of ranch and two-story suburban', service_patterns: ['AC maintenance', 'storm damage', 'foundation issues'] },
    arizona: { climate: ['extreme summer heat', 'monsoon season', 'hard water'], housing: 'stucco, single-story, pool communities', service_patterns: ['AC systems', 'pool equipment', 'hard water treatment'] },
    colorado: { climate: ['dry altitude', 'freeze-thaw cycles', 'heavy snow'], housing: 'mix of ranch and modern, mountain-influenced', service_patterns: ['freeze-thaw damage', 'snow load', 'dry climate plumbing'] },
    florida: { climate: ['humidity', 'hurricane risk', 'year-round heat'], housing: 'single-story, concrete block, pool homes', service_patterns: ['hurricane prep', 'humidity HVAC', 'pool systems'] },
    california: { climate: ['mild but dry', 'wildfire risk', 'earthquake considerations'], housing: 'diverse, hillside to suburban', service_patterns: ['drought-related', 'seismic plumbing', 'wildfire zone services'] },
};

function getLocalityData(suburb, baseCity) {
    const key = suburb.toLowerCase().trim();
    if (LOCALITY_CACHE[key]) return LOCALITY_CACHE[key];

    // Try regional fallback
    const cityLower = (baseCity || '').toLowerCase();
    for (const [region, data] of Object.entries(REGIONAL_PATTERNS)) {
        if (cityLower.includes(region) || cityLower.includes('tx') || cityLower.includes('texas')) {
            if (region === 'texas') return data;
        }
        if (cityLower.includes(region)) return data;
    }

    // Check state patterns from city name
    if (cityLower.includes('phoenix') || cityLower.includes('scottsdale') || cityLower.includes('tucson') || cityLower.includes('az')) return REGIONAL_PATTERNS.arizona;
    if (cityLower.includes('denver') || cityLower.includes('boulder') || cityLower.includes('co') || cityLower.includes('colorado')) return REGIONAL_PATTERNS.colorado;
    if (cityLower.includes('miami') || cityLower.includes('tampa') || cityLower.includes('orlando') || cityLower.includes('fl')) return REGIONAL_PATTERNS.florida;
    if (cityLower.includes('los angeles') || cityLower.includes('san francisco') || cityLower.includes('san diego') || cityLower.includes('ca')) return REGIONAL_PATTERNS.california;
    if (cityLower.includes('houston') || cityLower.includes('dallas') || cityLower.includes('austin') || cityLower.includes('san antonio') || cityLower.includes('tx')) return REGIONAL_PATTERNS.texas;

    // Ultimate fallback — use generic but believable data
    return { landmarks: [], housing: 'residential suburban area', climate: ['seasonal weather patterns', 'regional service considerations'], vibe: 'community-oriented residential area', service_patterns: ['standard residential services', 'seasonal maintenance'] };
}

// ============================================================
// CONTENT DNA GENERATOR
// Creates structural variation profiles for each page
// ============================================================
function generateContentDNA(pageStyle, variationSeed) {
    const v = variationSeed || Math.floor(Math.random() * 1000);
    const bases = {
        trust: { pacing: 'relaxed', density: 'medium', rhythm: 'warm', cta_pressure: 'gentle', emphasis: 'trust-first', sentence_pattern: 'varied' },
        premium: { pacing: 'measured', density: 'spacious', rhythm: 'elegant', cta_pressure: 'soft', emphasis: 'capability', sentence_pattern: 'polished' },
        emergency: { pacing: 'fast', density: 'compact', rhythm: 'punchy', cta_pressure: 'strong', emphasis: 'urgency', sentence_pattern: 'short-dominant' },
        community: { pacing: 'conversational', density: 'mixed', rhythm: 'friendly', cta_pressure: 'gentle', emphasis: 'relationship', sentence_pattern: 'varied' },
        minimal: { pacing: 'quick', density: 'lean', rhythm: 'clean', cta_pressure: 'minimal', emphasis: 'simplicity', sentence_pattern: 'short' },
        commercial: { pacing: 'measured', density: 'structured', rhythm: 'professional', cta_pressure: 'moderate', emphasis: 'operations', sentence_pattern: 'formal' },
    };
    const base = bases[pageStyle] || bases.trust;

    // Apply variation seed for structural differences
    const paragraphVariants = [3, 4, 5];
    const sentenceVariants = ['short-long-mixed', 'long-short-mixed', 'punchy-flow', 'flow-punchy'];
    const emphasisVariants = ['front-loaded', 'back-loaded', 'distributed', 'bookend'];

    return {
        ...base,
        paragraph_count: paragraphVariants[v % paragraphVariants.length],
        sentence_pattern: sentenceVariants[v % sentenceVariants.length],
        emphasis_pattern: emphasisVariants[v % emphasisVariants.length],
        variation_seed: v,
    };
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
// Uses verified locality cache + AI analysis
// ============================================================
async function analyzeLocalIntelligence(apiKey, businessName, service, suburb, baseCity, localContext, pageStyle) {
    const style = PAGE_STYLES[pageStyle] || PAGE_STYLES.trust;
    const cached = getLocalityData(suburb, baseCity);

    const systemPrompt = `You are a local market intelligence analyst. Analyze the suburb and determine the optimal page strategy.

VERIFIED LOCALITY DATA (use ONLY these facts — do not invent new landmarks, roads, or neighborhoods):
Suburb: ${suburb}
Known landmarks: ${cached.landmarks.length > 0 ? cached.landmarks.join(', ') : 'None verified — use generalized regional references only'}
Housing profile: ${cached.housing}
Climate concerns: ${cached.climate.join(', ')}
Area vibe: ${cached.vibe}
Service patterns: ${cached.service_patterns.join(', ')}

If you need to reference a landmark, ONLY use ones listed above. For anything else, use generalized but believable phrasing like "the neighborhood" or "local homeowners" or "this part of ${baseCity}".

Return a valid JSON object with exactly these keys:

"local_intelligence":
- "suburb_type": (one of: "family suburban", "urban mixed", "semi-rural", "commercial district", "new development", "established neighborhood")
- "verified_landmarks": (array: ONLY landmarks from the verified list above — max 2)
- "safe_area_references": (array of 2-3 generic but believable references: "local homeowners", "neighborhood residents", "this part of ${baseCity}")
- "housing_profile": (use verified data above)
- "common_pain_points": (array of 2-3: use verified service patterns)
- "climate_concerns": (array: use verified climate data)
- "neighborhood_vibe": (use verified vibe data)
- "customer_profile": (inferred from vibe and housing)

"page_strategy":
- "dominant_angle": (one of: "speed", "quality", "local_expertise", "problem_urgency", "community", "commercial")
- "emotional_hook": (string)
- "cta_intensity": (one of: "soft", "moderate", "strong")
- "trust_approach": (string)
- "content_pacing": (string)
- "section_emphasis": (array of 2-3 strings)

STRICT RULES:
- ONLY reference verified landmarks from the list above
- For unknown landmarks, use safe references like "local homeowners" or "this neighborhood"
- Do NOT invent roads, business districts, or specific addresses
- Do NOT claim certifications or awards
- Output ONLY valid JSON`;

    const userPrompt = `Business: ${businessName}
Service: ${service}
Suburb: ${suburb}
City: ${baseCity}
User Context: ${localContext || 'None'}
Style: ${style.name}`;

    return await groqCall(apiKey, systemPrompt, userPrompt, 900, 0.5);
}

// ============================================================
// STAGE 2: MAIN PAGE GENERATION
// Uses locality cache + content DNA + human rhythm rules
// ============================================================
async function generatePageContent(apiKey, businessName, service, suburb, baseCity, localContext, pageStyle, intelligence) {
    const style = PAGE_STYLES[pageStyle] || PAGE_STYLES.trust;
    const li = intelligence.local_intelligence || {};
    const ps = intelligence.page_strategy || {};
    const dna = intelligence.content_dna || {};
    const cached = getLocalityData(suburb, baseCity);

    const systemPrompt = `You are a human copywriter. Write a local service landing page that reads real.

=== LOCALITY ===
Suburb: ${suburb}
Landmarks: ${(li.verified_landmarks || []).join(', ') || 'safe neighborhood references'}
Housing: ${li.housing_profile || cached.housing}
Climate: ${(li.climate_concerns || cached.climate).join(', ')}
Vibe: ${li.neighborhood_vibe || cached.vibe}
Pain points: ${(li.common_pain_points || cached.service_patterns).join(', ')}

=== STRATEGY ===
Angle: ${ps.dominant_angle || 'local_expertise'}
Hook: ${ps.emotional_hook || 'trust'}
CTA intensity: ${ps.cta_intensity || 'moderate'}
Trust framing: ${ps.trust_approach || 'local experience'}

=== VARIATION PROFILE ===
Pacing: ${dna.pacing || 'relaxed'}
Paragraphs: ${dna.paragraph_count || 4}
Emphasis: ${dna.emphasis_pattern || 'front-loaded'}

=== STYLE ===
Tone: ${style.tone}
CTA style: ${style.cta_style}
Trust: ${style.trust_framing}
Section order: ${style.section_order.join(' → ')}

=== WRITING RULES ===
1. Vary paragraph lengths — no two should feel the same size
2. Mix short sentences (4-8 words) with long ones (15-25 words)
3. Use contractions: we're, you'll, we've, it's, that's
4. Never start consecutive sentences with the same word
5. Reference ${suburb} naturally — landmarks, climate, homes, neighborhood feel
6. One sentence should sound like talking to a neighbor

=== NEVER USE ===
comprehensive solutions, cutting-edge, leverage, utilize, streamline, committed to excellence, industry-leading, best-in-class, pride ourselves on, understanding the unique challenges, your satisfaction is our priority

=== EXAMPLE ===
For a plumbing page in Sugar Land:
"Our team works on houses just like yours around First Colony. These are newer builds, which means we see a lot of slab leaks and garbage disposal failures — things that creep up when a neighborhood hits the 10-15 year mark. We know these homes. You'll hear the dispatcher say 'oh yeah, we fixed one on your street last week' more often than not."

Short opener. Specific details (slab leaks, disposals). Conversational tone. Locality reference (First Colony). Natural rhythm.

=== OUTPUT ===
Return JSON with these keys:
meta_title (50-60 chars), meta_description (140-155 chars), headline, subheadline, local_hook (1-2 sentences), paragraphs (array of ${dna.paragraph_count || 4}, vary lengths), services (3-4), process_steps (3 with step+description), faq (3 with q+a), cta_text, trust_signal, section_order

RULES: Never claim licensed/insured/bonded/certified. Never invent stats. Never reference unverified landmarks. Output ONLY valid JSON.`;

    const userPrompt = `Business: ${businessName}
Service: ${service}
Suburb: ${suburb}
City: ${baseCity}
Context: ${localContext || 'None'}
Style: ${style.name}`;

    return await groqCall(apiKey, systemPrompt, userPrompt, 2200, 0.85);
}

// ============================================================
// STAGE 3: FAQ ENRICHMENT (optional, lightweight)
// Refines FAQ answers to feel more conversational and localized
// ============================================================
async function enrichFAQs(apiKey, faqs, suburb, service, cachedLocality) {
    if (!faqs || faqs.length === 0) return faqs;

    const systemPrompt = `You are editing FAQ answers for a local service business page. Make each answer:
- Conversational (like talking to a customer on the phone)
- Specific to the suburb and service
- 1-2 sentences max
- Natural, not corporate

VERIFIED DATA: landmarks: ${(cachedLocality.landmarks || []).join(', ') || 'none'}, climate: ${(cachedLocality.climate || []).join(', ')}, service patterns: ${(cachedLocality.service_patterns || []).join(', ')}

Return a JSON object with key "faq" containing an array of objects with "q" and "a". Keep the same questions, improve only the answers.
DO NOT invent landmarks. Use safe references like "the ${suburb} area" or "local homeowners".`;

    const userPrompt = `Service: ${service}
Suburb: ${suburb}
FAQs to improve: ${JSON.stringify(faqs)}`;

    try {
        const result = await groqCall(apiKey, systemPrompt, userPrompt, 500, 0.6);
        return result.faq || faqs;
    } catch {
        return faqs; // Fallback to original if enrichment fails
    }
}

// ============================================================
// FACTORY WRAPPER — full generation pipeline for reuse
// ============================================================
async function generateFullPage(apiKey, businessName, service, suburb, baseCity, localContext, pageStyle) {
    const cachedLocality = getLocalityData(suburb, baseCity);
    const variationSeed = Math.floor(Math.random() * 1000);
    const contentDNA = generateContentDNA(pageStyle, variationSeed);
    const intelligence = await analyzeLocalIntelligence(apiKey, businessName, service, suburb, baseCity, localContext, pageStyle);
    intelligence.content_dna = contentDNA;
    const pageContent = await generatePageContent(apiKey, businessName, service, suburb, baseCity, localContext, pageStyle, intelligence);
    if (pageContent.faq && pageContent.faq.length > 0) {
        pageContent.faq = await enrichFAQs(apiKey, pageContent.faq, suburb, service, cachedLocality);
    }
    pageContent._style = pageStyle;
    pageContent._styleName = PAGE_STYLES[pageStyle]?.name || 'Local Trust';
    pageContent._intelligence = intelligence.local_intelligence || {};
    pageContent._strategy = intelligence.page_strategy || {};
    pageContent._dna = intelligence.content_dna || {};
    pageContent._localityCache = cachedLocality;
    return pageContent;
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

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const now = Date.now();
    const requests = (rateLimits.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW);
    if (requests.length >= RATE_LIMIT_MAX) {
        res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
        return;
    }
    requests.push(now);
    rateLimits.set(ip, requests);

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
    const userEmail = await verifyAuth(token);

    if (userEmail) {
        const isPaid = await checkPaidStatus(userEmail);
        if (!isPaid) {
            const count = await getGenerationCount(userEmail);
            if (count >= FREE_GENERATION_LIMIT) {
                res.status(403).json({ error: 'Free generation limit reached. Upgrade for unlimited.', code: 'LIMIT_REACHED' });
                return;
            }
        }
    }

    try {
        const pageContent = await generateFullPage(apiKey, businessName, service, suburb, baseCity, localContext, pageStyle);
        res.status(200).json({ suburb, content: pageContent });
    } catch (error) {
        console.error("Orchestration Error:", error);
        res.status(500).json({ error: `Generation error: ${error.message}` });
    }
};

module.exports.generateFullPage = generateFullPage;
