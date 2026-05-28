// State Variables
let currentStep = 1;
let generatedPagesData = {}; // Stores JSON details of generated suburbs
let targetSuburbsList = [];
let isProUser = false;

// On Page Load: Check Stripe Payment Success in URL
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('status') === 'success') {
        localStorage.setItem('geopage_pro_user', 'true');
        // Clear url parameters to look clean
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // Check local storage for purchase token
    if (localStorage.getItem('geopage_pro_user') === 'true') {
        isProUser = true;
        // Upgrade UI buttons/badges
        const navBadge = document.querySelector('.nav-badge');
        if (navBadge) {
            navBadge.innerHTML = '<i class="fa-solid fa-crown" style="color: #fbbf24;"></i> Pro Member';
            navBadge.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        }
    }
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

// Open and Close Paywall Modal
function triggerPaywall(suburbsCount) {
    document.getElementById('requestedSuburbsCount').textContent = suburbsCount;
    document.getElementById('paywallModal').classList.add('active');
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
        .container { max-width: 1100px; margin: 0 auto; padding: 50px 20px; display: grid; grid-template-columns: 2fr 1fr; gap: 40px; }
        .content h2 { font-size: 1.8rem; color: #111827; margin-bottom: 20px; }
        .content p { font-size: 1.05rem; margin-bottom: 20px; color: #4b5563; }
        .card { background-color: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        .card h3 { margin-top: 0; color: #111827; }
        .cta-btn { display: block; width: 100%; background-color: #6366f1; color: white; text-align: center; padding: 12px 0; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 20px; }
        footer { background-color: #111827; color: #9ca3af; text-align: center; padding: 30px; border-top: 1px solid #1f2937; }
        @media (max-width: 768px) { .container { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <header>
        <div class="logo">${business}</div>
        <a href="tel:${phone}" class="phone-btn"><i class="fa-solid fa-phone"></i> Call Now</a>
    </header>
    <section class="hero">
        <h1>${content.headline || `${service} in ${suburb}`}</h1>
        <p>${content.subheadline || `Your trusted local ${service.toLowerCase()} partner servicing the ${suburb} community.`}</p>
    </section>
    <div class="container">
        <div class="content">
            <h2>Professional ${service} Services in ${suburb}, ${baseCity} Area</h2>
            <p>${content.paragraph_1 || `At ${business}, we are dedicated to providing high-quality, reliable ${service.toLowerCase()} solutions to homeowners and businesses throughout ${suburb}. Our team of experienced professionals is fully equipped to handle jobs of all sizes.`}</p>
            <p>${content.paragraph_2 || `We understand that problems require fast solutions. That is why we offer prompt scheduling, upfront pricing, and guaranteed workmanship on every local service call in the ${suburb} area.`}</p>
        </div>
        <div class="sidebar">
            <div class="card">
                <h3>Request an Estimate</h3>
                <p>Contact us today to discuss your project or request emergency service in ${suburb}.</p>
                <a href="tel:${phone}" class="cta-btn"><i class="fa-solid fa-phone"></i> Contact Us</a>
            </div>
        </div>
    </div>
    <footer>
        <p>&copy; ${new Date().getFullYear()} ${business}. All rights reserved.</p>
        <p>Email: ${email} | Phone: ${phone}</p>
    </footer>
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
    const email = document.getElementById('contactEmail').value;
    const baseCity = document.getElementById('baseCity').value;

    const previewHTML = `
        <div class="suburb-page-preview">
            <div class="preview-header">
                <span style="font-weight: 700;">${businessName}</span>
                <span style="background-color: #10b981; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; color: white;">Call: ${phone}</span>
            </div>
            <div class="preview-hero">
                <h3>${content.headline || `${service} in ${suburbName}`}</h3>
                <p>${content.subheadline || `Trusted local specialists serving the ${suburbName} area.`}</p>
            </div>
            <div class="preview-details">
                <div class="preview-description">
                    <h4>Top-Tier ${service} in ${suburbName}</h4>
                    <p>${content.paragraph_1}</p>
                    <p>${content.paragraph_2}</p>
                </div>
                <div class="preview-sidebar">
                    <h4>Need Assistance?</h4>
                    <p>Get a fast quote for services in ${suburbName}.</p>
                    <a href="tel:${phone}" style="display: block; text-align: center; background-color: #6366f1; color: white; padding: 10px 0; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 15px;">Get Quote</a>
                </div>
            </div>
        </div>
    `;

    viewport.innerHTML = previewHTML;
}

// Generate Live Preview Tabs dynamically
function setupTabs(suburbs) {
    const tabsContainer = document.getElementById('previewTabs');
    tabsContainer.innerHTML = '';

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

    // Split suburbs by comma and clean whitespace
    let suburbs = suburbsRaw.split(',').map(s => s.trim()).filter(s => s.length > 0);
    targetSuburbsList = suburbs;

    // Check Paywall (Limit to 3 suburbs for free users)
    if (suburbs.length > 3 && !isProUser) {
        triggerPaywall(suburbs.length);
        return;
    }

    // Show loading overlay
    const overlay = document.getElementById('loaderOverlay');
    const progressBar = document.getElementById('progressBar');
    overlay.classList.add('active');
    progressBar.style.width = '10%';

    generatedPagesData = {};
    const totalSuburbs = suburbs.length;

    try {
        // Sequentially call the Groq API wrapper for each suburb to avoid rate limits on free tier
        for (let i = 0; i < totalSuburbs; i++) {
            const suburb = suburbs[i];
            
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    businessName: name,
                    service: service,
                    suburb: suburb,
                    baseCity: baseCity,
                    localContext: localContext
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'Serverless execution failed.');
            }

            const pageContent = await response.json();
            generatedPagesData[suburb] = pageContent;

            // Update Progress bar
            const percent = ((i + 1) / totalSuburbs) * 100;
            progressBar.style.width = `${percent}%`;
        }

        // Render Tabs and Load Live Preview
        setupTabs(suburbs);
        renderLivePreview(suburbs[0]);

        // Trigger ZIP Creation and Download
        triggerZipDownload(name, service, phone, email, baseCity);

    } catch (error) {
        console.error("Generation Error:", error);
        alert(`Error generating pages: ${error.message}\n\nMake sure the Vercel server environment has the GROQ_API_KEY environment variable configured.`);
    } finally {
        overlay.classList.remove('active');
    }
}

// Compile and Download ZIP
function triggerZipDownload(name, service, phone, email, baseCity) {
    const zip = new JSZip();

    // Loop through suburbs and add HTML files to the zip container
    Object.keys(generatedPagesData).forEach(suburb => {
        const data = generatedPagesData[suburb];
        const htmlCode = generateHTMLTemplate(name, service, phone, email, suburb, baseCity, data.content);
        
        // Format filename (e.g. Sugar Land -> sugar-land.html)
        const filename = `${suburb.toLowerCase().replace(/\s+/g, '-')}.html`;
        zip.file(filename, htmlCode);
    });

    // Generate zip binary and trigger local download
    zip.generateAsync({ type: 'blob' }).then(blob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${name.toLowerCase().replace(/\s+/g, '-')}-suburb-pages.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Show success toast
        const toast = document.getElementById('downloadToast');
        toast.classList.add('active');
        setTimeout(() => {
            toast.classList.remove('active');
        }, 4000);
    });
}

function openAuthModal(mode = 'login') {
    document.getElementById('authModal').classList.add('active');
    toggleAuthTab(mode);
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

function handleAuthSubmit(event, mode) {
    event.preventDefault();
    alert(mode === 'login'
        ? 'Login is ready for your auth provider integration.'
        : 'Signup is ready for your auth provider integration.');
    closeAuthModal();
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
    alert('Thanks! Your message has been noted. Connect this form to your email provider before launch.');
    event.target.reset();
    closeContactModal();
}

function toggleChatWindow() {
    document.getElementById('chatWidget').classList.toggle('active');
}

function handleChatKeyDown(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    appendChatBubble(message, 'user');
    input.value = '';

    setTimeout(() => {
        appendChatBubble('For launch: add GROQ_API_KEY in Vercel, connect Stripe, then deploy. I can help with each step.', 'bot');
    }, 250);
}

function appendChatBubble(message, type) {
    const chatBody = document.getElementById('chatBody');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${type}`;
    bubble.textContent = message;
    chatBody.appendChild(bubble);
    chatBody.scrollTop = chatBody.scrollHeight;
}
