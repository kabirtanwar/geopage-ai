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

// Verify JWT token and get user ID
async function verifyAuth(token) {
    if (!token || !SUPABASE_SERVICE_KEY) return null;
    try {
        const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': SUPABASE_SERVICE_KEY
            }
        });
        if (!response.ok) return null;
        const user = await response.json();
        return user.id || null;
    } catch {
        return null;
    }
}

// Check if user is paid
async function checkPaidStatus(userId) {
    if (!userId || !SUPABASE_SERVICE_KEY) return false;
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/user_subscriptions?user_id=eq.${userId}&status=eq.active&select=status`,
            {
                headers: {
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        if (!response.ok) return false;
        const data = await response.json();
        return data.length > 0;
    } catch {
        return false;
    }
}

// Get generation count
async function getGenerationCount(userId) {
    if (!userId || !SUPABASE_SERVICE_KEY) return 0;
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/user_usage?user_id=eq.${userId}&select=generation_count`,
            {
                headers: {
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        if (!response.ok) return 0;
        const data = await response.json();
        return data.length > 0 ? data[0].generation_count : 0;
    } catch {
        return 0;
    }
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

    if (!businessName || !service || !suburb || !baseCity) {
        res.status(400).json({ error: 'Missing required parameters.' });
        return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        res.status(500).json({ error: 'GROQ_API_KEY not configured.' });
        return;
    }

    // Server-side auth + usage tracking
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

    const systemPrompt = `You are an agency-grade local SEO strategist and conversion copywriter. Generate a client-ready local service landing page draft that feels specific to the suburb, service, and buyer intent.

CRITICAL RULES:
- Avoid generic filler, fake statistics, unverifiable awards, and repetitive wording.
- Do NOT claim the business is licensed, insured, bonded, locally owned, certified, award-winning, guaranteed, or code-compliant unless that exact fact is provided by the user.
- Do NOT mention free estimates unless the user provided that offer.
- Do NOT write empty lines like "serving residents and visitors" or "complete satisfaction."
- Prefer concrete service process language, customer pain points, and suburb-specific relevance.
- Make the page sound like a real local business page an agency could hand to a client after light editing.
- Use the local context when provided, but do not invent exact landmarks, licensing claims, reviews, or guarantees.
- Every suburb output must be noticeably different in wording and angle from other suburbs.

The output MUST be a valid JSON object with exactly these keys:
- "meta_title": (SEO title, 50-60 characters when possible, containing service + suburb + business name)
- "meta_description": (compelling search snippet, 140-155 characters, with clear call to action)
- "headline": (specific H1 using service + suburb, not hype)
- "subheadline": (one concise benefit statement focused on local intent)
- "paragraph_1": (4-5 sentences about the service in this suburb. Include a concrete local angle from this context if useful: ${localContext || 'None provided'})
- "paragraph_2": (4-5 sentences covering response process, trust, what the customer should do next, and an estimate/appointment CTA)
- "services": (array of exactly 3-4 specific service items relevant to this suburb. Each is a short string like "Emergency Leak Repair" or "Water Heater Installation". Be niche-specific.)
- "process_steps": (array of exactly 3 steps describing how the service works. Each has "step" (number 1-3) and "description" (one sentence). Example: {"step": 1, "description": "Call or book online and we confirm your appointment within the hour."})
- "faq": (array of exactly 3 objects with "q" and "a" keys. Questions must be suburb-specific and realistic. Answers must be 1-2 sentences, practical, and non-generic.)
- "cta_text": (a short action-oriented CTA string like "Get a Free Estimate" or "Book Same-Day Service")`;

    const userPrompt = `
    Business Name: ${businessName}
    Primary Service: ${service}
    Target Suburb: ${suburb}
    Parent City: ${baseCity}
    Local Context: ${localContext || 'None provided'}
    `;

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
                temperature: 0.7,
                max_tokens: 2000
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
        res.status(200).json({ suburb, content: parsedContent });

    } catch (error) {
        console.error("Serverless API Error:", error);
        res.status(500).json({ error: `Generation error: ${error.message}` });
    }
};
