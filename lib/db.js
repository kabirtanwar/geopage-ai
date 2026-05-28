// Shared Supabase client for all data operations
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://dfoejyfmhzjsmqxrdazl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmb2VqeWZtaHpqc21xeHJkYXpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NDk1NjEsImV4cCI6MjA5NTUyNTU2MX0.lN4NDJKF3rXkCKiCxIlkcl8AVWbGoe7KvpUzTM2FSH8';

let supabase = null;
function getDb() {
    if (!supabase) supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    return supabase;
}

// Generic table operations
async function dbSelect(table, filters = {}) {
    const db = getDb();
    let query = db.from(table).select('*');
    for (const [key, value] of Object.entries(filters)) {
        if (value !== null && value !== undefined && value !== '') {
            query = query.eq(key, value);
        }
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

async function dbInsert(table, record) {
    const db = getDb();
    const { data, error } = await db.from(table).insert(record).select();
    if (error) throw error;
    return data?.[0] || record;
}

async function dbUpdate(table, updates, filters) {
    const db = getDb();
    let query = db.from(table).update(updates);
    for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
    }
    const { error } = await query;
    if (error) throw error;
}

async function dbUpsert(table, record, conflictCol) {
    const db = getDb();
    const { data, error } = await db.from(table).upsert(record, { onConflict: conflictCol }).select();
    if (error) throw error;
    return data?.[0] || record;
}

async function dbCount(table, filters = {}) {
    const db = getDb();
    let query = db.from(table).select('*', { count: 'exact', head: true });
    for (const [key, value] of Object.entries(filters)) {
        if (value !== null && value !== undefined && value !== '') {
            query = query.eq(key, value);
        }
    }
    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
}

module.exports = { getDb, dbSelect, dbInsert, dbUpdate, dbUpsert, dbCount };
