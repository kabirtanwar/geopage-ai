// =============================================
// GUARD: Skip initialization on admin routes
// =============================================
if (window.location.pathname.startsWith('/admin')) {
    // Admin has its own app.js — do not run landing page logic here
    throw new Error('Skip: admin route');
}

// =============================================
// CONFIGURATION
// =============================================
const SUPABASE_URL = 'https://dfoejyfmhzjsmqxrdazl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmb2VqeWZtaHpqc21xeHJkYXpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NDk1NjEsImV4cCI6MjA5NTUyNTU2MX0.lN4NDJKF3rXkCKiCxIlkcl8AVWbGoe7KvpUzTM2FSH8';
const FREE_GENERATION_LIMIT = 3;
const LEMON_SQUEEZY_URL = 'https://geopageai.lemonsqueezy.com/checkout/buy/134a5fa5-ce6b-4b73-913f-ac1220782066?embed=1';

// Initialize Supabase
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State Variables
let currentStep = 1;
let generatedPagesData = {};
let targetSuburbsList = [];
let isProUser = false;
let freeGenerationCount = 0;
let watermarkEnabled = true;
let livePreviewReady = false;
let currentUser = null;
let selectedPageStyle = 'trust';

// =============================================
// POSTHOG ANALYTICS HELPERS
// =============================================
function track(event, props = {}) {
    if (typeof posthog !== 'undefined') {
        posthog.capture(event, props);
    }
}

// =============================================
// AUTH SYSTEM
// =============================================
async function initAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        currentUser = session.user;
        await onAuthSuccess(session.user);
    }

    db.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            await onAuthSuccess(session.user);
            track('user_signed_in', { method: currentUser.app_metadata?.provider || 'email' });
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            isProUser = false;
            watermarkEnabled = true;
            onAuthSignOut();
        }
    });
}

async function onAuthSuccess(user) {
    closeAuthModal();
    updateNavForAuth(user);

    // Check if user is paid (handle missing table gracefully)
    try {
        const { data } = await db
            .from('user_subscriptions')
            .select('status')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

        if (data && data.status === 'active') {
            isProUser = true;
            watermarkEnabled = false;
        }
    } catch (e) {
        // Table may not exist yet, continue gracefully
    }

    // Get generation count from server
    await refreshGenerationCount();
    updateFreeTierUI();
}

function onAuthSignOut() {
    freeGenerationCount = 0;
    updateNavForAuth(null);
    updateFreeTierUI();
    const upgradeBanner = document.getElementById('upgradeBanner');
    if (upgradeBanner) upgradeBanner.style.display = 'flex';
}

function updateNavForAuth(user) {
    const loginBtn = document.getElementById('navLoginBtn');
    const userMenu = document.getElementById('userMenu');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const dropdownEmail = document.getElementById('userDropdownEmail');

    if (user) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (userMenu) userMenu.style.display = 'block';
        const email = user.email || 'Account';
        const initial = (email[0] || 'U').toUpperCase();
        if (userAvatar) userAvatar.textContent = initial;
        if (userName) userName.textContent = email.split('@')[0];
        if (dropdownEmail) dropdownEmail.textContent = email;
    } else {
        if (loginBtn) loginBtn.style.display = '';
        if (userMenu) userMenu.style.display = 'none';
    }
}

function toggleUserMenu() {
    const menu = document.getElementById('userMenu');
    if (menu) menu.classList.toggle('open');
}

async function handleAuthSubmit(event, mode) {
    event.preventDefault();
    const email = mode === 'signup'
        ? document.getElementById('signup-email').value
        : document.getElementById('login-email').value;
    const password = mode === 'signup'
        ? document.getElementById('signup-password').value
        : document.getElementById('login-password').value;
    const name = mode === 'signup'
        ? document.getElementById('signup-name').value : '';

    let result;
    if (mode === 'signup') {
        result = await db.auth.signUp({
            email, password,
            options: { data: { full_name: name } }
        });
    } else {
        result = await db.auth.signInWithPassword({ email, password });
    }

    if (result.error) {
        track('auth_error', { mode, error: result.error.message });
        alert(result.error.message);
        return;
    }

    closeAuthModal();
    track('auth_submitted', { mode });
}

async function handleLogout() {
    await db.auth.signOut();
    track('user_signed_out');
    toggleUserMenu();
}

// Click outside to close user menu and modals
document.addEventListener('click', (e) => {
    const menu = document.getElementById('userMenu');
    if (menu && !menu.contains(e.target)) {
        menu.classList.remove('open');
    }
});

// Close modals on backdrop click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
        }
    });
});

// =============================================
// SERVER-SIDE GENERATION TRACKING
// =============================================
async function refreshGenerationCount() {
    if (!currentUser) {
        freeGenerationCount = parseInt(localStorage.getItem('geopage_free_count') || '0', 10);
        return;
    }
    try {
        const { data } = await db
            .from('user_usage')
            .select('generation_count')
            .eq('user_id', currentUser.id)
            .limit(1)
            .maybeSingle();
        freeGenerationCount = data ? data.generation_count : 0;
    } catch {
        freeGenerationCount = 0;
    }
}

async function incrementGenerationCount() {
    if (!currentUser) {
        freeGenerationCount++;
        localStorage.setItem('geopage_free_count', freeGenerationCount.toString());
        return;
    }
    try {
        const { data } = await db
            .from('user_usage')
            .select('generation_count')
            .eq('user_id', currentUser.id)
            .limit(1)
            .maybeSingle();

        if (data) {
            await db
                .from('user_usage')
                .update({ generation_count: data.generation_count + 1, updated_at: new Date().toISOString() })
                .eq('user_id', currentUser.id);
        } else {
            await db
                .from('user_usage')
                .insert({ user_id: currentUser.id, generation_count: 1 });
        }
        freeGenerationCount++;
    } catch {
        freeGenerationCount++;
    }
}

// =============================================
// PAGE LOAD INIT
// =============================================
window.addEventListener('load', async () => {
    // Handle Lemon Squeezy success redirect
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('status') === 'success' || urlParams.get('type') === 'success' || urlParams.get('checkout') === 'success') {
        localStorage.setItem('geopage_pro_user', 'true');
        isProUser = true;
        watermarkEnabled = false;
        track('checkout_completed');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Initialize auth (non-blocking — don't await)
    initAuth().catch(e => console.warn('Auth init error:', e));

    // Initialize Live Reactive Preview IMMEDIATELY
    initLivePreview();
    updateFreeTierUI();

    // Show upgrade banner for free users
    const upgradeBanner = document.getElementById('upgradeBanner');
    if (upgradeBanner && !isProUser) {
        upgradeBanner.style.display = 'flex';
    }

    // Listen for Lemon Squeezy overlay events
    window.addEventListener('message', (event) => {
        try {
            const data = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
            if (data && data.includes('lemonsqueezy')) {
                track('lemonsqueezy_event', { data: data.substring(0, 200) });
            }
        } catch (e) { /* ignore non-serializable messages */ }
    });

    track('page_view');
});

// Step Navigation
function nextStep(step) {
    // Validate current step before proceeding
    if (step === 2) {
        const name = document.getElementById('businessName').value;
        const service = document.getElementById('businessService').value;
        const phone = document.getElementById('contactPhone').value;
        const email = document.getElementById('contactEmail').value;
        
        if (!name || !service || !phone || !email) {
            alert("Please fill out all contact and business profile fields.");
            return;
        }
    }

    document.getElementById(`step-${currentStep}`).classList.remove('active');
    document.getElementById(`step-${step}`).classList.add('active');
    currentStep = step;

    // Update UI badge
    const badge = document.querySelector('.step-badge');
    if (badge) badge.textContent = step;
}

function selectPageStyle(style) {
    selectedPageStyle = style;
    document.querySelectorAll('.style-card').forEach(card => {
        card.classList.toggle('active', card.dataset.style === style);
    });
    track('style_selected', { style });
    // Update preview style indicator
    const titleEl = document.getElementById('previewTitle');
    const styleNames = { trust: 'Local Trust', premium: 'Premium Service', emergency: 'Emergency Conversion', community: 'Community-Focused', minimal: 'Minimal Clean', commercial: 'Commercial' };
    if (titleEl) titleEl.textContent = `Live Preview — ${styleNames[style] || 'Local Trust'}`;
}

// Open and Close Paywall Modal
function triggerPaywall(suburbsCount) {
    document.getElementById('paywallModal').classList.add('active');
    track('upgrade_modal_opened', { suburbs_count: suburbsCount });
}

function closePaywall() {
    document.getElementById('paywallModal').classList.remove('active');
}

function scrollToGenerator() {
    const dashboard = document.querySelector('.dashboard-grid');
    const firstInput = document.getElementById('businessName');

    if (dashboard) {
        dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    setTimeout(() => {
        if (firstInput) firstInput.focus({ preventScroll: true });
    }, 450);
}

function generateFirstThreeFree() {
    const suburbsInput = document.getElementById('suburbs');
    const firstThree = targetSuburbsList.slice(0, 3);
    suburbsInput.value = firstThree.join(', ');
    closePaywall();
    runGeneration();
}

// Generate the HTML code for a specific suburb
function generateHTMLTemplate(business, service, phone, email, suburb, baseCity, content) {
    const paragraphs = content.paragraphs || [content.paragraph_1 || '', content.paragraph_2 || ''];
    const paragraphsHTML = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n');
    const servicesList = (content.services || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');
    const processHTML = (content.process_steps || []).map(step => `
        <div class="process-step">
            <div class="step-number">${step.step}</div>
            <p>${escapeHtml(step.description)}</p>
        </div>
    `).join('');
    const faqHTML = (content.faq || []).map(f => `
        <div class="faq-item">
            <h4>${escapeHtml(f.q)}</h4>
            <p>${escapeHtml(f.a)}</p>
        </div>
    `).join('');
    const ctaText = content.cta_text || 'Contact Us';
    const localHook = content.local_hook ? `<p class="local-hook">${escapeHtml(content.local_hook)}</p>` : '';
    const trustSignal = content.trust_signal ? `<div class="trust-signal"><span>${escapeHtml(content.trust_signal)}</span></div>` : '';
    const sectionOrder = content.section_order || ['hero', 'local_hook', 'intro', 'services', 'process', 'trust', 'faq', 'cta'];
    const pageStyle = content._style || 'trust';

    // Style-specific CSS overrides
    const styleOverrides = {
        emergency: `.hero { background: linear-gradient(135deg, #7f1d1d, #991b1b); } .hero h1 { font-size: 2.4rem; } .cta-btn { background-color: #dc2626; } .urgency-bar { display: block !important; } .section { padding: 30px 20px; } p { font-size: 1rem; line-height: 1.5; }`,
        premium: `.hero { background: linear-gradient(135deg, #1e1b4b, #312e81); padding: 100px 20px; } .hero h1 { font-size: 3rem; font-weight: 800; letter-spacing: -0.5px; } .section { padding: 70px 20px; } .cta-btn { background: linear-gradient(135deg, #6366f1, #4f46e5); } h2 { font-size: 2rem; } p { font-size: 1.1rem; line-height: 1.8; }`,
        community: `.hero { background: linear-gradient(135deg, #065f46, #047857); } .hero h1 { font-size: 2.6rem; } .local-hook { border-left-color: #059669; color: #059669; } .cta-btn { background-color: #059669; } .trust-signal { background: #ecfdf5; border-color: #a7f3d0; } .trust-signal span { color: #065f46; }`,
        minimal: `.hero { background: #111827; padding: 60px 20px; } .hero h1 { font-size: 2.2rem; font-weight: 600; } .section { padding: 40px 20px; } p { font-size: 1rem; } h2 { font-size: 1.5rem; } .cta-btn { background: #111827; } .services-list { grid-template-columns: 1fr; }`,
        commercial: `.hero { background: linear-gradient(135deg, #1f2937, #111827); } .hero h1 { font-size: 2.5rem; } .section { padding: 50px 20px; } .cta-btn { background-color: #374151; } .process-steps { flex-direction: column; gap: 20px; } .process-step { text-align: left; display: flex; gap: 16px; align-items: flex-start; }`,
    };

    // Build body sections dynamically based on section_order
    const bodySections = sectionOrder.map(section => {
        switch(section) {
            case 'local_hook': return localHook;
            case 'intro': return paragraphsHTML;
            case 'services': return servicesList ? `<h2>Services We Provide</h2><ul class="services-list">${servicesList}</ul>` : '';
            case 'process': return processHTML ? `<h2>How It Works</h2><div class="process-steps">${processHTML}</div>` : '';
            case 'trust': return trustSignal;
            case 'faq': return faqHTML ? `<h2>Frequently Asked Questions</h2><div class="faq-section">${faqHTML}</div>` : '';
            case 'urgency': return `<div class="urgency-bar"><p>Need ${escapeHtml(service.toLowerCase())} in ${escapeHtml(suburb)}? We respond fast — call now.</p></div>`;
            case 'cta': return `<section class="cta-section"><h2>Ready to Get Started?</h2><p>Contact ${escapeHtml(business)} today for reliable ${escapeHtml(service.toLowerCase())} in ${escapeHtml(suburb)}.</p><a href="tel:${phone.replace(/[^\d+]/g, '')}" class="cta-btn">${escapeHtml(ctaText)}</a></section>`;
            default: return '';
        }
    }).filter(Boolean).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${content.meta_title || `${service} in ${suburb} | ${business}`}</title>
    <meta name="description" content="${content.meta_description || `Need expert ${service} in ${suburb}? Call ${business} at ${phone} today for fast, professional local services.`}">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Outfit', sans-serif; color: #374151; margin: 0; line-height: 1.6; background-color: #f9fafb; }
        header { background-color: #1f2937; color: white; padding: 20px 5%; display: flex; justify-content: space-between; align-items: center; }
        .logo { font-size: 1.5rem; font-weight: 700; }
        .phone-btn { background-color: #10b981; color: white; padding: 10px 20px; border-radius: 5px; text-decoration: none; font-weight: 600; }
        .hero { background: linear-gradient(135deg, #1e293b, #0f172a); color: white; text-align: center; padding: 80px 20px; }
        .hero h1 { font-size: 2.8rem; margin: 0 0 15px 0; font-weight: 700; }
        .hero p { color: #cbd5e1; font-size: 1.2rem; max-width: 700px; margin: 0 auto; }
        .section { max-width: 1100px; margin: 0 auto; padding: 50px 20px; }
        .content-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 40px; }
        h2 { font-size: 1.8rem; color: #111827; margin-bottom: 20px; }
        p { font-size: 1.05rem; margin-bottom: 20px; color: #4b5563; }
        .services-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin: 30px 0; }
        .service-item { background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; display: flex; align-items: center; gap: 12px; }
        .service-item i { color: #6366f1; font-size: 1.2rem; }
        .service-item span { font-weight: 600; color: #111827; }
        .process-section { background: #f8fafc; padding: 40px 20px; margin: 40px 0; }
        .process-steps { display: flex; gap: 30px; max-width: 1100px; margin: 0 auto; }
        .process-step { flex: 1; text-align: center; }
        .step-number { width: 48px; height: 48px; background: #6366f1; color: white; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.2rem; margin-bottom: 12px; }
        .process-step p { color: #4b5563; font-size: 0.95rem; }
        .faq-section { max-width: 1100px; margin: 0 auto; padding: 50px 20px; }
        .faq-item { background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 24px; margin-bottom: 16px; }
        .faq-item h4 { color: #111827; margin: 0 0 8px 0; font-size: 1.05rem; }
        .faq-item p { color: #4b5563; margin: 0; font-size: 0.95rem; }
        .cta-section { background: linear-gradient(135deg, #1e293b, #0f172a); color: white; text-align: center; padding: 60px 20px; }
        .cta-section h2 { color: white; }
        .cta-btn { display: inline-block; background-color: #10b981; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 1.1rem; }
        .local-hook { color: #6366f1; font-size: 0.95rem; font-weight: 600; font-style: italic; margin: 0 0 20px; padding-left: 16px; border-left: 3px solid #6366f1; line-height: 1.6; }
        .trust-signal { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; }
        .trust-signal span { font-size: 0.88rem; color: #166534; font-weight: 600; }
        .services-list { list-style: none; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 30px; }
        .services-list li { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; font-weight: 600; color: #111827; }
        .urgency-bar { background: linear-gradient(135deg, #fef2f2, #fff1f2); border: 1px solid #fecaca; border-radius: 10px; padding: 18px 24px; margin: 20px 0; text-align: center; }
        .urgency-bar p { color: #991b1b; font-weight: 600; font-size: 1rem; margin: 0; }
        .card { background-color: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        .card h3 { margin-top: 0; color: #111827; }
        .sidebar-cta { display: block; width: 100%; background-color: #6366f1; color: white; text-align: center; padding: 12px 0; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 20px; }
        footer { background-color: #111827; color: #9ca3af; text-align: center; padding: 30px; border-top: 1px solid #1f2937; }
        @media (max-width: 768px) { .content-grid, .process-steps, .services-grid { grid-template-columns: 1fr; } }
        ${styleOverrides[pageStyle] || ''}
    </style>
    </style>
</head>
<body>
    <header>
        <div class="logo">${business}</div>
        <a href="tel:${phone.replace(/[^\d+]/g, '')}" class="phone-btn"><i class="fa-solid fa-phone"></i> Call Now</a>
    </header>
    <section class="hero">
        <h1>${content.headline || `${service} in ${suburb}`}</h1>
        <p>${content.subheadline || `Your trusted local ${service.toLowerCase()} partner servicing the ${suburb} community.`}</p>
    </section>
    <div class="section">
        ${bodySections}
    </div>
    <footer>
        <p>&copy; ${new Date().getFullYear()} ${business}. All rights reserved.</p>
        <p>Email: ${email} | Phone: ${phone}</p>
        ${!isProUser ? '<p style="margin-top:12px;font-size:0.75rem;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:10px;">Generated with <a href="https://geopage.ai" style="color:#6366f1;text-decoration:none;font-weight:600;">GeoPage AI</a></p>' : ''}
    </footer>
</body>
</html>`;
}

// Generate index.html - Smart Local Service Hub
function generateIndexTemplate(business, service, suburbs) {
    const suburbCards = suburbs.map(suburb => {
        const slug = suburb.toLowerCase().replace(/\s+/g, '-');
        return `<li style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;transition:box-shadow 0.2s;">
            <a href="${slug}.html" style="color:#111827;text-decoration:none;font-weight:700;font-size:1.1rem;display:block;margin-bottom:6px;">${service} in ${suburb}</a>
            <p style="color:#6b7280;font-size:0.9rem;margin:0 0 12px;line-height:1.5;">Professional ${service.toLowerCase()} serving the ${suburb} community. Local expertise, fast response, and reliable results.</p>
            <a href="${slug}.html" style="color:#6366f1;font-size:0.85rem;font-weight:600;text-decoration:none;">View Service Page &rarr;</a>
        </li>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${business} - ${service} Service Areas</title>
    <meta name="description" content="${business} provides ${service.toLowerCase()} across ${suburbs.length} service areas. Find your local page below.">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Outfit', sans-serif; color: #374151; margin: 0; background: #f9fafb; }
        .hero { background: linear-gradient(135deg, #1e293b, #0f172a); color: white; text-align: center; padding: 60px 20px; }
        .hero h1 { font-size: 2.2rem; margin: 0 0 10px; font-weight: 700; }
        .hero p { color: #cbd5e1; font-size: 1.1rem; margin: 0; }
        .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
        .section-title { font-size: 1.3rem; color: #111827; margin-bottom: 20px; font-weight: 700; }
        ul { list-style: none; padding: 0; display: grid; gap: 14px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 0.85rem; text-align: center; }
    </style>
</head>
<body>
    <div class="hero">
        <h1>${business}</h1>
        <p>${service} &mdash; ${suburbs.length} Service Areas</p>
    </div>
    <div class="container">
        <h2 class="section-title">Our Service Areas</h2>
        <ul>
            ${suburbCards}
        </ul>
    </div>
    <div class="footer">
        &copy; ${new Date().getFullYear()} ${business}. All rights reserved.
    </div>
</body>
</html>`;
}

// Render Page into the Browser Viewport Live Preview
function renderLivePreview(suburbName) {
    const data = generatedPagesData[suburbName];
    if (!data) return;

    const viewport = document.getElementById('previewViewport');
    const browserUrl = document.getElementById('browserUrl');
    
    // Set url display
    const formattedUrl = suburbName.toLowerCase().replace(/\s+/g, '-');
    browserUrl.textContent = `https://apexplumbing.com/${formattedUrl}`;

    // Build the rendered HTML elements directly into the viewport
    const content = data.content;
    const businessName = document.getElementById('businessName').value;
    const service = document.getElementById('businessService').value;
    const phone = document.getElementById('contactPhone').value;
    const baseCity = document.getElementById('baseCity').value;

    const paragraphs = content.paragraphs || [content.paragraph_1 || '', content.paragraph_2 || ''];
    const paragraphsHTML = paragraphs.map(p => `<p style="color:#4b5563;font-size:0.92rem;line-height:1.65;margin:0 0 14px;">${escapeHtml(p)}</p>`).join('');

    const sectionOrder = content.section_order || ['hero', 'local_hook', 'services', 'process', 'faq', 'cta'];

    const localHookHTML = content.local_hook ? `<p style="color:#6366f1;font-size:0.9rem;font-weight:600;font-style:italic;margin:0 0 18px;padding-left:14px;border-left:3px solid #6366f1;line-height:1.6;">${escapeHtml(content.local_hook)}</p>` : '';

    const trustSignalHTML = content.trust_signal ? `<div style="background:linear-gradient(135deg,#f0fdf4,#f0f9ff);border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin:16px 0;"><span style="font-size:0.85rem;color:#166534;font-weight:600;"><i class="fa-solid fa-shield-halved" style="margin-right:8px;color:#10b981;"></i>${escapeHtml(content.trust_signal)}</span></div>` : '';

    const servicesHTML = (content.services || []).map(s => 
        `<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:10px;"><i class="fa-solid fa-check-circle" style="color:#10b981;font-size:0.85rem;"></i><span style="font-size:0.88rem;font-weight:600;color:#111827;">${escapeHtml(s)}</span></div>`
    ).join('');

    const processHTML = (content.process_steps || []).map(step => `
        <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:14px;">
            <div style="width:32px;height:32px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;flex-shrink:0;box-shadow:0 2px 8px rgba(99,102,241,0.3);">${step.step}</div>
            <p style="color:#4b5563;font-size:0.88rem;margin:4px 0 0;line-height:1.5;">${escapeHtml(step.description)}</p>
        </div>
    `).join('');

    const faqHTML = (content.faq || []).map(f => `
        <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #f1f5f9;">
            <strong style="color:#111827;font-size:0.9rem;display:block;margin-bottom:4px;">${escapeHtml(f.q)}</strong>
            <p style="color:#6b7280;font-size:0.85rem;margin:0;line-height:1.5;">${escapeHtml(f.a)}</p>
        </div>
    `).join('');

    const previewHTML = `
        <div class="suburb-page-preview">
            <div class="preview-header">
                <span style="font-weight: 700;">${escapeHtml(businessName)}</span>
                <span style="background-color: #10b981; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; color: white;">Call: ${escapeHtml(phone)}</span>
            </div>
            <div class="preview-hero">
                <h3>${escapeHtml(content.headline || service + ' in ' + suburbName)}</h3>
                <p>${escapeHtml(content.subheadline || 'Trusted local specialists serving the ' + suburbName + ' area.')}</p>
            </div>
            <div style="padding:28px 24px;">
                ${sectionOrder.map(section => {
                    switch(section) {
                        case 'local_hook': return localHookHTML;
                        case 'intro': return paragraphsHTML;
                        case 'services': return servicesHTML ? `<h5 style="font-size:0.88rem;color:#111827;margin:16px 0 10px;font-weight:700;">Our Services</h5><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">${servicesHTML}</div>` : '';
                        case 'process': return processHTML ? `<h5 style="font-size:0.88rem;color:#111827;margin:16px 0 10px;font-weight:700;">How It Works</h5>${processHTML}` : '';
                        case 'trust': return trustSignalHTML;
                        case 'faq': return faqHTML ? `<h5 style="font-size:0.88rem;color:#111827;margin:16px 0 10px;font-weight:700;">Common Questions</h5><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin-bottom:16px;">${faqHTML}</div>` : '';
                        case 'urgency': return `<div style="background:linear-gradient(135deg,#fef2f2,#fff1f2);border:1px solid #fecaca;border-radius:10px;padding:16px;margin-bottom:16px;"><p style="color:#991b1b;font-size:0.9rem;font-weight:600;margin:0;"><i class="fa-solid fa-bolt" style="margin-right:6px;"></i>Need ${escapeHtml(service.toLowerCase())} in ${escapeHtml(suburbName)}? We respond fast.</p></div>`;
                        case 'cta': return `<a href="#" style="display:block;text-align:center;background:linear-gradient(135deg,#6366f1,#4f46e5);color:white;padding:14px 0;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.95rem;box-shadow:0 4px 14px rgba(99,102,241,0.3);margin-top:16px;">${escapeHtml(content.cta_text || 'Get a Free Estimate')}</a>`;
                        default: return '';
                    }
                }).filter(Boolean).join('')}
            </div>
        </div>
    `;

    viewport.innerHTML = previewHTML;
}

// Generate Live Preview Tabs dynamically
function setupTabs(suburbs) {
    const tabsContainer = document.getElementById('previewTabs');
    tabsContainer.innerHTML = '';

    // Update preview title
    const titleEl = document.getElementById('previewTitle');
    if (titleEl) titleEl.textContent = 'Generated Preview';

    suburbs.forEach((suburb, index) => {
        const tab = document.createElement('span');
        tab.className = `tab ${index === 0 ? 'active' : ''}`;
        tab.textContent = suburb;
        tab.onclick = () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderLivePreview(suburb);
        };
        tabsContainer.appendChild(tab);
    });
}

// Core Execution
async function runGeneration() {
    const name = document.getElementById('businessName').value;
    const service = document.getElementById('businessService').value;
    const phone = document.getElementById('contactPhone').value;
    const email = document.getElementById('contactEmail').value;
    
    const baseCity = document.getElementById('baseCity').value;
    const suburbsRaw = document.getElementById('suburbs').value;
    const localContext = document.getElementById('localContext').value;

    if (!baseCity || !suburbsRaw) {
        alert("Please fill out your base city and target service areas.");
        return;
    }

    let suburbs = suburbsRaw.split(',').map(s => s.trim()).filter(s => s.length > 0);
    targetSuburbsList = suburbs;

    if (suburbs.length > 3 && !isProUser) {
        triggerPaywall(suburbs.length);
        return;
    }

    if (!isProUser && freeGenerationCount >= FREE_GENERATION_LIMIT) {
        triggerExportLimit();
        return;
    }

    track('generation_started', { suburb_count: suburbs.length, is_pro: isProUser });

    const overlay = document.getElementById('loaderOverlay');
    const progressBar = document.getElementById('progressBar');
    overlay.classList.add('active');
    progressBar.style.width = '10%';

    generatedPagesData = {};
    const totalSuburbs = suburbs.length;

    // Get auth token for server-side tracking
    let authToken = null;
    if (currentUser) {
        const { data: { session } } = await db.auth.getSession();
        authToken = session?.access_token || null;
    }

    try {
        for (let i = 0; i < totalSuburbs; i++) {
            const suburb = suburbs[i];
            
            const headers = { 'Content-Type': 'application/json' };
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

            const response = await fetch('/api/generate', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    businessName: name,
                    service: service,
                    suburb: suburb,
                    baseCity: baseCity,
                    localContext: localContext,
                    pageStyle: selectedPageStyle
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'Serverless execution failed.');
            }

            const pageContent = await response.json();
            generatedPagesData[suburb] = pageContent;

            const percent = ((i + 1) / totalSuburbs) * 100;
            progressBar.style.width = `${percent}%`;
        }

        setupTabs(suburbs);
        renderLivePreview(suburbs[0]);

        // Track generation count
        await incrementGenerationCount();
        updateFreeTierUI();

        track('generation_completed', { suburb_count: suburbs.length, is_pro: isProUser });

        triggerZipDownload(name, service, phone, email, baseCity);

    } catch (error) {
        console.error("Generation Error:", error);
        alert(`Error generating pages: ${error.message}`);
        track('generation_error', { error: error.message });
    } finally {
        overlay.classList.remove('active');
    }
}

// Compile and Download ZIP
function triggerZipDownload(name, service, phone, email, baseCity) {
    const zip = new JSZip();

    Object.keys(generatedPagesData).forEach(suburb => {
        const data = generatedPagesData[suburb];
        const htmlCode = generateHTMLTemplate(name, service, phone, email, suburb, baseCity, data.content);
        const filename = `${suburb.toLowerCase().replace(/\s+/g, '-')}.html`;
        zip.file(filename, htmlCode);
    });

    // Add index.html linking all suburb pages
    const indexHtml = generateIndexTemplate(name, service, Object.keys(generatedPagesData));
    zip.file('index.html', indexHtml);

    zip.generateAsync({ type: 'blob' }).then(blob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${name.toLowerCase().replace(/\s+/g, '-')}-suburb-pages.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        const toast = document.getElementById('downloadToast');
        toast.classList.add('active');
        setTimeout(() => toast.classList.remove('active'), 4000);

        track('zip_downloaded', { file_count: Object.keys(generatedPagesData).length, is_pro: isProUser });
    });
}

function triggerExportLimit() {
    const overlay = document.getElementById('loaderOverlay');
    overlay.classList.remove('active');
    triggerPaywall(0);
}

function updateFreeTierUI() {
    const remaining = Math.max(0, FREE_GENERATION_LIMIT - freeGenerationCount);
    const generateBtn = document.getElementById('generateBtn');
    const stepTitle = document.querySelector('.input-panel .panel-header h2');
    const upgradeBanner = document.getElementById('upgradeBanner');
    
    if (isProUser) {
        if (generateBtn) {
            generateBtn.innerHTML = 'Generate Pages <i class="fa-solid fa-wand-magic-sparkles"></i>';
        }
        if (upgradeBanner) upgradeBanner.style.display = 'none';
        if (stepTitle) stepTitle.innerHTML = '<span class="step-badge">1</span> Generate Deploy-Ready Pages';
        return;
    }

    if (generateBtn) {
        if (remaining <= 0) {
            generateBtn.innerHTML = 'Upgrade for Unlimited <i class="fa-solid fa-lock"></i>';
            generateBtn.onclick = () => triggerPaywall(0);
        } else {
            generateBtn.innerHTML = `Generate Pages (${remaining} free left) <i class="fa-solid fa-wand-magic-sparkles"></i>`;
            generateBtn.onclick = runGeneration;
        }
    }

    if (stepTitle) {
        stepTitle.innerHTML = `<span class="step-badge">1</span> Generate Deploy-Ready Pages`;
    }

    if (upgradeBanner) {
        upgradeBanner.style.display = currentUser ? 'flex' : 'none';
    }
}

function openAuthModal(mode = 'login') {
    document.getElementById('authModal').classList.add('active');
    toggleAuthTab(mode);
    track('auth_modal_opened', { mode });
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('active');
}

function toggleAuthTab(mode) {
    const loginActive = mode === 'login';
    document.getElementById('tab-login-btn').classList.toggle('active', loginActive);
    document.getElementById('tab-signup-btn').classList.toggle('active', !loginActive);
    document.getElementById('login-form').classList.toggle('active', loginActive);
    document.getElementById('signup-form').classList.toggle('active', !loginActive);
}

function openContactModal(event) {
    if (event) event.preventDefault();
    document.getElementById('contactModal').classList.add('active');
}

function closeContactModal() {
    document.getElementById('contactModal').classList.remove('active');
}

function handleContactSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Message Sent';
    btn.disabled = true;
    track('contact_form_submitted');
    event.target.reset();
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        closeContactModal();
    }, 2000);
}

async function handleEmailCapture(event) {
    event.preventDefault();
    const email = document.getElementById('captureEmail').value;
    if (email) {
        try {
            await db.from('email_subscribers').insert({ email, source: 'landing_page', created_at: new Date().toISOString() });
        } catch (e) {
            // Fallback to localStorage if table doesn't exist
            localStorage.setItem('geopage_captured_email', email);
        }
        track('email_captured', { email });
        event.target.reset();
        const btn = event.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Subscribed';
        btn.style.background = 'linear-gradient(135deg, #059669, #047857)';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
        }, 3000);
    }
}

// =============================================
// LIVE REACTIVE PREVIEW SYSTEM
// =============================================

function initLivePreview() {
    // Render initial example preview on page load
    renderDefaultPreview();

    // Attach live input listeners
    const businessName = document.getElementById('businessName');
    const businessService = document.getElementById('businessService');
    const baseCity = document.getElementById('baseCity');
    const suburbs = document.getElementById('suburbs');

    if (businessName) businessName.addEventListener('input', updateLivePreview);
    if (businessService) businessService.addEventListener('input', updateLivePreview);
    if (baseCity) baseCity.addEventListener('input', updateLivePreview);
    if (suburbs) suburbs.addEventListener('input', updateLivePreview);
}

function renderDefaultPreview() {
    const viewport = document.getElementById('previewViewport');
    const browserUrl = document.getElementById('browserUrl');

    browserUrl.textContent = 'https://apexplumbing.com/sugar-land';

    const watermarkHTML = !isProUser ? `
        <div style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:10px 20px;text-align:center;">
            <span style="font-size:0.75rem;color:#9ca3af;">Generated with <a href="https://geopage.ai" style="color:#6366f1;text-decoration:none;font-weight:600;">GeoPage AI</a></span>
        </div>
    ` : '';

    viewport.innerHTML = `
        <div class="suburb-page-preview">
            <div class="preview-header">
                <span style="font-weight: 700;">Apex Plumbing Solutions</span>
                <span style="background-color: #10b981; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; color: white;">Call: (555) 123-4567</span>
            </div>
            <div class="preview-hero">
                <h3>Emergency Plumbing in Sugar Land</h3>
                <p>Your trusted local plumbing partner servicing the Sugar Land community with fast, reliable repairs.</p>
            </div>
            <div style="padding:28px 24px;">
                <h4 style="font-size:1.2rem;margin:0 0 12px;color:#111827;">Professional Emergency Plumbing in Sugar Land</h4>
                <p style="color:#4b5563;font-size:0.92rem;line-height:1.65;margin:0 0 12px;">When a pipe bursts at midnight or your water heater fails on a Sunday morning, you need a plumbing team that answers the phone. Apex Plumbing Solutions provides emergency plumbing repair to homeowners across Sugar Land.</p>
                <p style="color:#4b5563;font-size:0.92rem;line-height:1.65;margin:0 0 16px;">Our licensed technicians arrive with fully stocked trucks, ready to diagnose and repair burst pipes, clogged drains, sewer line issues, and water heater failures on the first visit.</p>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;">
                    <span style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;font-size:0.82rem;color:#334155;font-weight:600;">Emergency Leak Repair</span>
                    <span style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;font-size:0.82rem;color:#334155;font-weight:600;">Drain Cleaning</span>
                    <span style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;font-size:0.82rem;color:#334155;font-weight:600;">Water Heater Service</span>
                </div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin-bottom:16px;">
                    <h5 style="font-size:0.9rem;color:#111827;margin:0 0 10px;">Common Questions</h5>
                    <div style="margin-bottom:10px;"><strong style="color:#111827;font-size:0.85rem;">Do you provide after-hours emergency service?</strong><p style="color:#6b7280;font-size:0.82rem;margin:3px 0 0;line-height:1.5;">Yes. Our on-call team handles emergencies 24/7, including weekends and holidays.</p></div>
                    <div><strong style="color:#111827;font-size:0.85rem;">How quickly can you arrive?</strong><p style="color:#6b7280;font-size:0.82rem;margin:3px 0 0;line-height:1.5;">Most emergency calls in Sugar Land receive a technician within 60 minutes.</p></div>
                </div>
                <a href="#" style="display:block;text-align:center;background-color:#6366f1;color:white;padding:12px 0;border-radius:6px;text-decoration:none;font-weight:600;font-size:0.95rem;">Get a Free Estimate</a>
            </div>
            ${watermarkHTML}
        </div>
    `;
    livePreviewReady = true;
}

function updateLivePreview() {
    if (!livePreviewReady) return;

    const name = document.getElementById('businessName').value.trim();
    const service = document.getElementById('businessService').value.trim();
    const baseCity = document.getElementById('baseCity').value.trim();
    const suburbsRaw = document.getElementById('suburbs').value.trim();

    const suburbs = suburbsRaw.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const firstSuburb = suburbs[0] || '';

    const displayName = name || 'Apex Plumbing Solutions';
    const displayService = service || 'Emergency Plumbing & Leak Repair';
    const displaySuburb = firstSuburb || 'Sugar Land';
    const displayCity = baseCity || 'Houston';

    const browserUrl = document.getElementById('browserUrl');
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const suburbSlug = displaySuburb.toLowerCase().replace(/\s+/g, '-');
    browserUrl.textContent = `https://${slug}.com/${suburbSlug}`;

    const viewport = document.getElementById('previewViewport');
    const watermarkHTML = !isProUser ? `
        <div style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:10px 20px;text-align:center;">
            <span style="font-size:0.75rem;color:#9ca3af;">Generated with <a href="https://geopage.ai" style="color:#6366f1;text-decoration:none;font-weight:600;">GeoPage AI</a></span>
        </div>
    ` : '';

    viewport.innerHTML = `
        <div class="suburb-page-preview">
            <div class="preview-header">
                <span style="font-weight: 700;">${escapeHtml(displayName)}</span>
                <span style="background-color: #10b981; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; color: white;">Call Now</span>
            </div>
            <div class="preview-hero">
                <h3>${escapeHtml(displayService)} in ${escapeHtml(displaySuburb)}</h3>
                <p>Your trusted local ${escapeHtml(displayService.toLowerCase())} partner servicing the ${escapeHtml(displaySuburb)} community in the ${escapeHtml(displayCity)} area.</p>
            </div>
            <div style="padding:28px 24px;">
                <h4 style="font-size:1.2rem;margin:0 0 12px;color:#111827;">Professional ${escapeHtml(displayService)} in ${escapeHtml(displaySuburb)}, ${escapeHtml(displayCity)}</h4>
                <p style="color:#4b5563;font-size:0.92rem;line-height:1.65;margin:0 0 12px;">At ${escapeHtml(displayName)}, we deliver high-quality, reliable ${escapeHtml(displayService.toLowerCase())} to homes and businesses across ${escapeHtml(displaySuburb)}. Our experienced team handles jobs of every size with prompt scheduling and upfront pricing.</p>
                <p style="color:#4b5563;font-size:0.92rem;line-height:1.65;margin:0 0 16px;">We know ${escapeHtml(displayService.toLowerCase())} problems need fast solutions. That is why we offer same-day availability, transparent quotes, and guaranteed workmanship on every service call in the ${escapeHtml(displaySuburb)} area.</p>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;">
                    <span style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;font-size:0.82rem;color:#334155;font-weight:600;">${escapeHtml(displayService.split('&')[0].trim())}</span>
                    <span style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;font-size:0.82rem;color:#334155;font-weight:600;">Local Service</span>
                    <span style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;font-size:0.82rem;color:#334155;font-weight:600;">Free Estimates</span>
                </div>
                <a href="#" style="display:block;text-align:center;background-color:#6366f1;color:white;padding:12px 0;border-radius:6px;text-decoration:none;font-weight:600;font-size:0.95rem;">Get a Free Estimate</a>
            </div>
            ${watermarkHTML}
        </div>
    `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================
// SHOWCASE DEMO SYSTEM
// =============================================

const showcaseData = {
    plumbing: {
        title: 'Emergency Plumber in Sugar Land, TX',
        url: 'https://apexplumbing.com/sugar-land',
        header: { name: 'Apex Plumbing Solutions', phone: '(281) 555-0147' },
        hero: {
            headline: 'Fast Emergency Plumbing in Sugar Land, TX',
            sub: 'Licensed plumbers serving Sugar Land homeowners with 24/7 emergency drain repair, leak detection, and water heater services.'
        },
        content: {
            heading: 'Professional Emergency Plumbing Services in Sugar Land',
            p1: 'When a pipe bursts at midnight or your water heater fails on a Sunday morning, you need a plumbing team that answers the phone. Apex Plumbing Solutions provides emergency plumbing repair to homeowners across Sugar Land, including neighborhoods near Town Square, New Territory, and Telfair.',
            p2: 'Our licensed technicians arrive with fully stocked trucks, ready to diagnose and repair burst pipes, clogged drains, sewer line issues, and water heater failures. We carry the parts to complete most jobs on the first visit, so you are not waiting days for a follow-up.',
            p3: 'Sugar Land homes face unique plumbing challenges: hard water buildup stressing fixtures, aging polybutylene pipes in older subdivisions, and tree root intrusion along the Oyster Creek corridor. We know these patterns and plan accordingly.'
        },
        services: ['Emergency Leak Repair', 'Drain Cleaning & Clearing', 'Water Heater Installation', 'Sewer Line Inspection'],
        process_steps: [
            { step: 1, description: 'Call or book online and we confirm your appointment within the hour.' },
            { step: 2, description: 'A licensed technician arrives, diagnoses the issue, and provides a upfront quote before any work begins.' },
            { step: 3, description: 'We complete the repair, test the system, and clean up before we leave.' }
        ],
        sidebar: {
            heading: 'Request an Estimate',
            text: 'Need fast plumbing help in Sugar Land? Call now for same-day service or request a free estimate online.',
            cta: 'Call (281) 555-0147'
        },
        faq: [
            { q: 'Do you provide emergency plumbing in Sugar Land after hours?', a: 'Yes. Our on-call team handles emergencies 24 hours a day, 7 days a week, including weekends and holidays throughout the Sugar Land area.' },
            { q: 'Which Sugar Land neighborhoods do you serve?', a: 'We serve all Sugar Land neighborhoods including Town Square, New Territory, Telfair, Highlands, and Oyster Creek. Our technicians are based locally for fast response times.' },
            { q: 'How quickly can you arrive for a plumbing emergency?', a: 'Most emergency calls in Sugar Land receive a technician within 60 minutes. We prioritize active leaks, sewer backups, and no-hot-water situations.' }
        ],
        cta_text: 'Get a Free Estimate',
        footer: 'Apex Plumbing Solutions | Licensed & Insured | Sugar Land, TX'
    },
    hvac: {
        title: 'AC Repair in Scottsdale Ranch, AZ',
        url: 'https://coolbreezehvac.com/scottsdale-ranch',
        header: { name: 'Cool Breeze HVAC', phone: '(480) 555-0289' },
        hero: {
            headline: 'Reliable AC Repair in Scottsdale Ranch, AZ',
            sub: 'Fast air conditioning repair and maintenance for Scottsdale Ranch homes. Same-day service when Arizona heat hits hardest.'
        },
        content: {
            heading: 'Expert AC Repair and Cooling Services in Scottsdale Ranch',
            p1: 'Scottsdale Ranch summers push AC systems to their limits. When your unit struggles to keep up with 110-degree days, Cool Breeze HVAC delivers same-day diagnostics and repair to get your cooling back on track. We service all major brands including Carrier, Trane, Lennox, and Rheem.',
            p2: 'Our NATE-certified technicians handle refrigerant leaks, compressor failures, capacitor replacements, and airflow problems. We stock the most common parts on our trucks, so most repairs are completed in a single visit.',
            p3: 'Scottsdale Ranch homes often experience uneven cooling due to long duct runs and east-facing windows that absorb afternoon heat. We address these issues at the system level, not just the symptom.'
        },
        services: ['AC Diagnostics & Repair', 'Refrigerant Leak Service', 'Seasonal Maintenance Plans', 'Emergency Cooling Service'],
        process_steps: [
            { step: 1, description: 'Schedule online or by phone. We confirm same-day availability for urgent cooling issues.' },
            { step: 2, description: 'Our NATE-certified technician runs a full system diagnostic and presents a clear repair recommendation.' },
            { step: 3, description: 'We complete the repair with quality parts, test performance, and provide a written warranty.' }
        ],
        sidebar: {
            heading: 'Schedule a Diagnostic',
            text: 'Not sure what is wrong? Our technicians run a full system diagnostic to identify the issue before quoting any work.',
            cta: 'Call (480) 555-0289'
        },
        faq: [
            { q: 'How fast can you respond to an AC emergency in Scottsdale Ranch?', a: 'We offer same-day emergency AC service for Scottsdale Ranch residents. During peak summer, we recommend calling early in the day for the fastest appointment.' },
            { q: 'Do you offer maintenance plans for Scottsdale Ranch homes?', a: 'Yes. Our seasonal maintenance plan includes two tune-ups per year, priority scheduling, and discounted repairs. It is the best way to avoid unexpected breakdowns in Arizona heat.' },
            { q: 'What AC brands do you service?', a: 'We service all major brands including Carrier, Trane, Lennox, Rheem, Goodman, and Bryant. Our technicians are factory-trained on most residential systems.' }
        ],
        cta_text: 'Book Same-Day Service',
        footer: 'Cool Breeze HVAC | NATE Certified | Scottsdale, AZ'
    },
    roofing: {
        title: 'Storm Roof Repair in Frisco, TX',
        url: 'https://stalwartroofing.com/frisco',
        header: { name: 'Stalwart Roofing', phone: '(214) 555-0312' },
        hero: {
            headline: 'Storm Damage Roof Repair in Frisco, TX',
            sub: 'Licensed roofing contractors serving Frisco homeowners with hail damage repair, storm inspections, and insurance claim support.'
        },
        content: {
            heading: 'Storm Damage Roofing Repair and Inspection in Frisco',
            p1: 'North Texas storms produce hail, high winds, and driving rain that damage shingles, flashing, and gutters. Stalwart Roofing provides comprehensive storm damage assessment and repair to Frisco homeowners, documenting damage for insurance claims and restoring roof integrity.',
            p2: 'After a storm, hidden damage can lead to leaks weeks or months later. Our inspection process covers the entire roof surface, valleys, flashing points, and attic ventilation. We photograph everything and provide a detailed report you can submit directly to your insurance adjuster.',
            p3: 'Frisco neighborhoods near PGA Parkway and the Dallas North Tollway corridor see frequent hail activity. We know the common damage patterns in these areas and what insurance carriers look for in a legitimate claim.'
        },
        services: ['Hail Damage Repair', 'Storm Roof Inspection', 'Insurance Claim Support', 'Emergency Tarping'],
        process_steps: [
            { step: 1, description: 'Call after a storm and we schedule a free on-site inspection within 48 hours.' },
            { step: 2, description: 'We document all damage with photos, provide a detailed report, and coordinate with your insurance adjuster.' },
            { step: 3, description: 'Once approved, we complete the repair using quality materials and back it with a workmanship warranty.' }
        ],
        sidebar: {
            heading: 'Free Storm Inspection',
            text: 'Suspected storm damage? We offer free roof inspections for Frisco homeowners. No obligation, no pressure.',
            cta: 'Call (214) 555-0312'
        },
        faq: [
            { q: 'Should I file an insurance claim for roof storm damage?', a: 'If you see missing shingles, dents in gutters, or find granules in your downspouts, it is worth filing a claim. We document everything and can meet your adjuster on-site.' },
            { q: 'How long does a typical storm repair take?', a: 'Most residential storm repairs in Frisco are completed in 1-3 days depending on the extent of damage and material availability. We communicate timelines clearly before starting.' },
            { q: 'Do you work with insurance companies directly?', a: 'Yes. We have experience working with all major insurance carriers and can provide the documentation, photos, and scope of work your adjuster needs to process the claim efficiently.' }
        ],
        cta_text: 'Schedule Free Inspection',
        footer: 'Stalwart Roofing | Licensed & Insured | Frisco, TX'
    },
    dental: {
        title: 'Family Dentist in Lakewood, CO',
        url: 'https://lakewoodfamilydental.com',
        header: { name: 'Lakewood Family Dental', phone: '(303) 555-0178' },
        hero: {
            headline: 'Trusted Family Dentist in Lakewood, CO',
            sub: 'Gentle dental care for the whole family. Preventive cleanings, restorative work, and cosmetic dentistry in Lakewood, Colorado.'
        },
        content: {
            heading: 'Family Dental Care in Lakewood, CO',
            p1: 'Lakewood Family Dental provides comprehensive dental care for patients of all ages, from childrens first visits to adult preventive care and cosmetic treatments. Our Lakewood office is designed to feel comfortable and welcoming, not clinical and intimidating.',
            p2: 'We focus on preventive dentistry because catching issues early saves time, money, and discomfort. Our hygiene team uses digital X-rays with minimal radiation, intraoral cameras, and gentle cleaning techniques to keep your teeth healthy between visits.',
            p3: 'Lakewood families appreciate that we handle everything in one office: routine cleanings, fillings, crowns, teeth whitening, and emergency dental care. No referrals across town, no unfamiliar offices, just consistent care from a team that knows your history.'
        },
        services: ['Preventive Cleanings', 'Restorative Dentistry', 'Teeth Whitening', 'Emergency Dental Care'],
        process_steps: [
            { step: 1, description: 'Book online or by phone. We offer morning, evening, and Saturday appointments for families.' },
            { step: 2, description: 'Your first visit includes a comprehensive exam, digital X-rays, and a personalized treatment plan.' },
            { step: 3, description: 'We handle everything in-house, from cleanings to crowns, so you never need referrals across town.' }
        ],
        sidebar: {
            heading: 'Book Your Visit',
            text: 'New patients welcome. We accept most insurance plans and offer flexible scheduling for families.',
            cta: 'Call (303) 555-0178'
        },
        faq: [
            { q: 'Do you accept new patients and children?', a: 'Absolutely. We welcome patients of all ages and recommend children visit starting at age one or when their first tooth appears.' },
            { q: 'What insurance plans do you accept?', a: 'We accept most major dental insurance plans including Delta Dental, Cigna, MetLife, and Aetna. Our team will verify your benefits before your appointment.' },
            { q: 'How often should I schedule dental checkups?', a: 'We recommend a cleaning and exam every six months for most patients. Some conditions may require more frequent visits, which we will discuss at your appointment.' }
        ],
        cta_text: 'Book Your Appointment',
        footer: 'Lakewood Family Dental | Accepting New Patients | Lakewood, CO'
    }
};

function showcaseDemo(niche) {
    const data = showcaseData[niche];
    if (!data) return;

    const container = document.getElementById('showcasePreview');
    const title = document.getElementById('showcaseTitle');
    const url = document.getElementById('showcaseUrl');
    const viewport = document.getElementById('showcaseViewport');

    title.textContent = data.title;
    url.textContent = data.url;

    const servicesHTML = (data.services || []).map(s => 
        `<span style="display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;font-size:0.82rem;color:#334155;font-weight:600;">${s}</span>`
    ).join('');

    const processHTML = (data.process_steps || []).map(step => `
        <div style="flex:1;text-align:center;">
            <div style="width:40px;height:40px;background:#6366f1;color:white;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;margin-bottom:8px;">${step.step}</div>
            <p style="color:#4b5563;font-size:0.88rem;margin:0;line-height:1.5;">${step.description}</p>
        </div>
    `).join('');

    const faqHTML = data.faq.map(f => `
        <div class="faq-item">
            <h5>${f.q}</h5>
            <p>${f.a}</p>
        </div>
    `).join('');

    viewport.innerHTML = `
        <div class="preview-header">
            <span style="font-weight: 700;">${data.header.name}</span>
            <a href="tel:${data.header.phone.replace(/[^\d]/g, '')}" style="background-color: #10b981; padding: 8px 16px; border-radius: 5px; font-size: 0.85rem; font-weight: 600; color: white; text-decoration: none;">Call: ${data.header.phone}</a>
        </div>
        <div class="preview-hero">
            <h3>${data.hero.headline}</h3>
            <p>${data.hero.sub}</p>
        </div>
        <div class="preview-content-grid">
            <div class="preview-content">
                <h4>${data.content.heading}</h4>
                <p>${data.content.p1}</p>
                <p>${data.content.p2}</p>
                <p>${data.content.p3}</p>
                ${servicesHTML ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:16px 0;">${servicesHTML}</div>` : ''}
            </div>
            <div class="preview-sidebar-card">
                <h4>${data.sidebar.heading}</h4>
                <p>${data.sidebar.text}</p>
                <a href="tel:${data.sidebar.cta.match(/\d+/)?.[0] || ''}">${data.sidebar.cta}</a>
            </div>
        </div>
        ${processHTML ? `<div style="background:#f8fafc;padding:30px;border-top:1px solid #e5e7eb;"><h4 style="text-align:center;margin:0 0 20px;color:#111827;font-size:1.1rem;">How It Works</h4><div style="display:flex;gap:24px;max-width:900px;margin:0 auto;">${processHTML}</div></div>` : ''}
        <div class="preview-faq">
            <h4>Frequently Asked Questions</h4>
            ${faqHTML}
        </div>
        <div style="background:linear-gradient(135deg,#1e293b,#0f172a);color:white;text-align:center;padding:40px 20px;">
            <h4 style="color:white;margin:0 0 8px;font-size:1.2rem;">Ready to Get Started?</h4>
            <p style="color:#cbd5e1;margin:0 0 16px;font-size:0.95rem;">Contact ${data.header.name} today.</p>
            <a href="tel:${data.header.phone.replace(/[^\d]/g, '')}" style="display:inline-block;background:#10b981;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;">${data.cta_text || 'Contact Us'}</a>
        </div>
        <div class="preview-footer">
            ${data.footer} | <a href="#">Privacy Policy</a> | <a href="#">Terms of Service</a>
        </div>
    `;

    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeShowcase() {
    document.getElementById('showcasePreview').style.display = 'none';
}
