// Shared Supabase REST client (no WebSocket dependency)
const fetch = require('node-fetch');

const SUPABASE_URL = 'https://dfoejyfmhzjsmqxrdazl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) console.warn('[db.js] SUPABASE_SERVICE_ROLE_KEY not set');

const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

async function dbSelect(table, filters = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
    for (const [key, value] of Object.entries(filters)) {
        if (value !== null && value !== undefined && value !== '') url += `&${key}=eq.${encodeURIComponent(value)}`;
    }
    const r = await fetch(url, { headers });
    if (!r.ok) return []; // Graceful fallback for missing tables
    return await r.json();
}

async function dbInsert(table, record) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST', headers, body: JSON.stringify(record)
    });
    if (!r.ok) return null; // Graceful fallback
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
}

async function dbUpdate(table, updates, filters) {
    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    let first = true;
    for (const [key, value] of Object.entries(filters)) {
        url += first ? `?${key}=eq.${encodeURIComponent(value)}` : `&${key}=eq.${encodeURIComponent(value)}`;
        first = false;
    }
    const r = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(updates) });
    if (!r.ok) return null; // Graceful fallback
}

async function dbCount(table, filters = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=count`;
    for (const [key, value] of Object.entries(filters)) {
        if (value !== null && value !== undefined && value !== '') url += `&${key}=eq.${encodeURIComponent(value)}`;
    }
    url += '&count=exact&head=true';
    const r = await fetch(url, { headers: { ...headers, 'Range-Unit': 'items', 'Range': '0-0' } });
    const total = r.headers.get('content-range');
    if (total) {
        const match = total.match(/\/(\d+)/);
        return match ? parseInt(match[1]) : 0;
    }
    return 0;
}

module.exports = { dbSelect, dbInsert, dbUpdate, dbCount };
