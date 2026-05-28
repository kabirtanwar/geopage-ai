const fetch = require('node-fetch');

function parseRequestBody(body) {
    if (!body) return {};
    if (typeof body === 'string') {
        try {
            return JSON.parse(body);
        } catch {
            return {};
        }
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

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle Preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const body = parseRequestBody(req.body);
    const businessName = String(body.businessName || '').trim();
    const service = String(body.service || '').trim();
    const suburb = String(body.suburb || '').trim();
    const baseCity = String(body.baseCity || '').trim();
    const localContext = String(body.localContext || '').trim();

    if (!businessName || !service || !suburb || !baseCity) {
        res.status(400).json({ error: 'Missing required parameters: businessName, service, suburb, and baseCity are required.' });
        return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        res.status(500).json({ 
            error: 'GROQ_API_KEY environment variable is not configured. Please add your key in the Vercel Dashboard.' 
        });
        return;
    }

    // Construct Groq OpenAI-compatible payload
    const systemPrompt = `You are an agency-grade local SEO strategist and conversion copywriter. Generate a client-ready local service landing page draft that feels specific to the suburb, service, and buyer intent.
    Avoid generic filler, fake statistics, unverifiable awards, and repetitive wording.
    Do NOT claim the business is licensed, insured, bonded, locally owned, certified, award-winning, guaranteed, or code-compliant unless that exact fact is provided by the user.
    Do NOT mention free estimates unless the user provided that offer.
    Do NOT write empty lines like "serving residents and visitors" or "complete satisfaction."
    Prefer concrete service process language, customer pain points, and suburb-specific relevance.
    Make the page sound like a real local business page an agency could hand to a client after light editing.
    Use the local context when provided, but do not invent exact landmarks, licensing claims, reviews, or guarantees.
    The output MUST be a valid JSON object.
    The JSON structure MUST have exactly these keys:
    - "meta_title": (SEO title, 50-60 characters when possible, containing the service, suburb, and business name)
    - "meta_description": (compelling search snippet, 140-155 characters when possible, with a clear call to action)
    - "headline": (specific H1 using service + suburb, not hype)
    - "subheadline": (one concise benefit statement focused on local intent)
    - "paragraph_1": (4-5 sentences about the service in this suburb. Include a concrete local angle from this context if useful: ${localContext || 'None provided'})
    - "paragraph_2": (4-5 sentences covering response process, trust, what the customer should do next, and an estimate/appointment CTA)
    Make every suburb output noticeably different in wording and angle.`;

    const userPrompt = `
    Business Name: ${businessName}
    Primary Service: ${service}
    Target Suburb: ${suburb}
    Parent City: ${baseCity}
    Local Context: ${localContext || 'None provided'}
    `;

    const apiEndpoint = 'https://api.groq.com/openai/v1/chat/completions';

    const requestPayload = {
        model: "llama-3.3-70b-versatile",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 1200
    };

    try {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Groq API returned status ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        
        // Extract output content
        const responseText = data.choices?.[0]?.message?.content;
        if (!responseText) {
            throw new Error('Groq API response structure is invalid.');
        }

        // Parse and return content JSON
        const parsedContent = extractJsonObject(responseText);
        
        res.status(200).json({
            suburb: suburb,
            content: parsedContent
        });

    } catch (error) {
        console.error("Serverless API Error:", error);
        res.status(500).json({ 
            error: `Groq API Generation error: ${error.message}` 
        });
    }
};
