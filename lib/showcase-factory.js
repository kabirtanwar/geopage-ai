// Showcase Factory — Continuous proof asset generation
// Generates suburb pages via the existing API and tracks assets

const NICHE_SUBURBS = {
    plumbing: { suburbs: ['Sugar Land, TX', 'Katy, TX', 'Houston, TX'], city: 'Houston' },
    hvac: { suburbs: ['Scottsdale Ranch, AZ', 'Phoenix, AZ', 'Scottsdale, AZ'], city: 'Phoenix' },
    roofing: { suburbs: ['Frisco, TX', 'Dallas, TX', 'Plano, TX'], city: 'Dallas' },
    dental: { suburbs: ['Lakewood, CO', 'Denver, CO', 'Boulder, CO'], city: 'Denver' },
    pest_control: { suburbs: ['Sugar Land, TX', 'Houston, TX', 'Katy, TX'], city: 'Houston' },
    landscaping: { suburbs: ['Scottsdale, AZ', 'Scottsdale Ranch, AZ', 'Phoenix, AZ'], city: 'Phoenix' }
};

const STYLES = ['trust', 'premium', 'emergency', 'community', 'minimal', 'commercial'];
const STYLE_NAMES = { trust: 'Local Trust', premium: 'Premium Service', emergency: 'Emergency Conversion', community: 'Community-Focused', minimal: 'Minimal Clean', commercial: 'Commercial/Business' };

function generateShowcasePlan(niches = null) {
    const plan = [];
    const targetNiches = niches || Object.keys(NICHE_SUBURBS);

    for (const niche of targetNiches) {
        const config = NICHE_SUBURBS[niche];
        if (!config) continue;

        for (const suburb of config.suburbs.slice(0, 2)) {
            for (const style of STYLES.slice(0, 3)) {
                plan.push({
                    niche,
                    suburb,
                    city: config.city,
                    style,
                    business_name: `${getBusinessPrefix(niche)} ${getBusinessSuffix(niche)}`,
                    service: getServiceForNiche(niche)
                });
            }
        }
    }
    return plan;
}

function getBusinessPrefix(niche) {
    const prefixes = {
        plumbing: ['Apex', 'Pro', 'Rapid', 'Trusted', 'Premier'],
        hvac: ['Cool Breeze', 'Arctic', 'Climate', 'Temp', 'Air Flow'],
        roofing: ['Summit', 'Stalwart', 'Apex', 'Prime', 'Solid'],
        dental: ['Lakewood', 'Bright', 'Smile', 'Family', 'Care'],
        pest_control: ['Shield', 'Guard', 'Pest', 'All Clear', 'Pro'],
        landscaping: ['Green', 'Prime', 'Garden', 'Lawn', 'Nature']
    };
    const list = prefixes[niche] || ['Pro', 'Apex', 'Trusted'];
    return list[Math.floor(Math.random() * list.length)];
}

function getBusinessSuffix(niche) {
    const suffixes = {
        plumbing: 'Plumbing',
        hvac: 'HVAC',
        roofing: 'Roofing',
        dental: 'Dental',
        pest_control: 'Pest Control',
        landscaping: 'Landscaping'
    };
    return suffixes[niche] || 'Services';
}

function getServiceForNiche(niche) {
    const services = {
        plumbing: 'Emergency Plumbing',
        hvac: 'AC Repair',
        roofing: 'Storm Roof Repair',
        dental: 'Family Dentist',
        pest_control: 'Pest Control',
        landscaping: 'Landscaping Services'
    };
    return services[niche] || 'Home Services';
}

function selectBestShowcase(showcases, niche) {
    const relevant = showcases.filter(s => s.niche === niche && s.file_path);
    if (relevant.length === 0) return null;
    // Prefer least-used showcase
    relevant.sort((a, b) => (a.times_used || 0) - (b.times_used || 0));
    return relevant[0];
}

function getShowcaseRefPath(niche, suburb, style) {
    const suburbSlug = suburb.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `/showcases/${niche}_${suburbSlug}_${style}.html`;
}

module.exports = { generateShowcasePlan, selectBestShowcase, getShowcaseRefPath, NICHE_SUBURBS, STYLES, STYLE_NAMES, getBusinessPrefix, getBusinessSuffix, getServiceForNiche };
