// Lemon Squeezy Webhook Handler — payment verification
const crypto = require('crypto');
const { dbInsert, dbSelect } = require('../lib/db');

const WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;

function verifySignature(body, signature) {
    if (!WEBHOOK_SECRET) return true; // No secret = skip verification (dev mode)
    if (!signature) return false;
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    const digest = hmac.update(body).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    // Get raw body for signature verification
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const signature = req.headers['x-signature'] || '';

    if (!verifySignature(rawBody, signature)) {
        console.error('[Webhook] Invalid signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const event = body.meta?.event_name || body.event_name || '';

        console.log('[Webhook] Received event:', event);

        if (event === 'order_created' || event === 'subscription_created') {
            const data = body.data || {};
            const attrs = data.attributes || {};

            // Extract user email from order
            const userEmail = attrs.user_email || attrs.customer_email || '';
            const userId = attrs.user_id || attrs.customer_id || '';
            const orderId = attrs.order_id || data.id || '';
            const status = attrs.status || 'active';

            if (userEmail) {
                // Check if subscription already exists
                const existing = await dbSelect('user_subscriptions', { user_id: userId });

                if (existing.length === 0) {
                    await dbInsert('user_subscriptions', {
                        user_id: userId,
                        email: userEmail,
                        status: status === 'paid' || status === 'active' ? 'active' : 'pending',
                        plan: 'lifetime',
                        order_id: String(orderId),
                        created_at: new Date().toISOString()
                    });
                    console.log('[Webhook] Subscription created for:', userEmail);
                } else {
                    console.log('[Webhook] Subscription already exists for:', userEmail);
                }
            }
        }

        // Always return 200 to acknowledge receipt
        res.status(200).json({ received: true });

    } catch (error) {
        console.error('[Webhook] Error:', error);
        // Still return 200 to prevent Lemon Squeezy retries on parsing errors
        res.status(200).json({ received: true, error: error.message });
    }
};
