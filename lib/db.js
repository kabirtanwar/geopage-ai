// Shared Supabase REST client (no WebSocket dependency)
const fetch = require('node-fetch');

const SUPABASE_URL = 'https://dfoejyfmhzjsmqxrdazl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmb2VqeWZtaHpqc21xeHJkYXpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NDk1NjEsImV4cCI6MjA5NTUyNTU2MX0.lN4NDJKF3rXkCKiCxIlkcl8AVWbGoe7KvpUzTM2FSH8';

const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

async function dbSelect(table, filters = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
    for (const [key, value] of Object.entries(filters)) {
        if (value !== null && value !== undefined && value !== '') url += `&${key}=eq.${encodeURIComponent(value)}`;
    }
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Select failed: ${r.status}`);
    return await r.json();
}

async function dbInsert(table, record) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST', headers, body: JSON.stringify(record)
    });
    if (!r.ok) { const e = await r.text(); throw new Error(`Insert failed: ${r.status} ${e}`); }
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
    if (!r.ok) { const e = await r.text(); throw new Error(`Update failed: ${r.status} ${e}`); }
}

module.exports = { dbSelect, dbInsert, dbUpdate };
