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
    const systemPrompt = `You are a Local SEO copywriting genius. Generate unique, high-converting copy for a local service landing page. 
    The output MUST be a valid JSON object.
    The JSON structure MUST have exactly these keys:
    - "meta_title": (highly optimized SEO title, 50-60 characters, containing the service, suburb and business name)
    - "meta_description": (compelling SEO meta description, 140-155 characters, with a call to action)
    - "headline": (catchy primary H1 header, e.g. "Trusted Plumber in Sugar Land")
    - "subheadline": (persuasive benefit statement)
    - "paragraph_1": (4-5 sentences detailing the service in this specific suburb. Mention local context/landmarks/streets if provided: ${localContext || 'None provided'})
    - "paragraph_2": (4-5 sentences emphasizing trust, emergency dispatch speed, local credentials, and an estimate call-to-action)`;

    const userPrompt = `
    Business Name: ${businessName}
    Primary Service: ${service}
    Target Suburb: ${suburb}
    Parent City: ${baseCity}
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
