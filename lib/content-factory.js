// Content Factory — Social content generation
// Generates tweet variants, Reddit comments, LinkedIn posts

const TWEET_HOOKS = [
    "Built a tool that generates suburb pages for local SEO. Here's what it produced:",
    "From brief to deployable suburb page in 30 seconds. Here's proof:",
    "Local SEO agencies: what if suburb pages took 30 seconds instead of 45 minutes?",
    "Generated this localized landing page system automatically. Looks agency-delivered:",
    "The fastest way to scale local suburb page production:",
    "How I automated suburb page generation for local SEO:",
    "30 seconds per suburb page. Here's what the output looks like:",
    "Stop manually writing suburb pages. Here's what AI generates in 30 seconds:",
    "Built a system that produces deploy-ready suburb pages. Example:",
    "Scale your local SEO fulfillment without hiring more writers:"
];

const REDDIT_TEMPLATES = [
    "I built a tool that generates suburb-specific landing pages for local SEO. Each page gets unique content, SEO metadata, and deploy-ready HTML. Here's a sample output for a plumbing business in Sugar Land: [screenshot]. Would this be useful for your agency workflow?",
    "For anyone struggling with suburb page scaling: I built a system that generates unique local landing pages in 30 seconds. Each page gets localized content, process steps, FAQs, and a full HTML export. Happy to share more details if helpful.",
    "Generated this suburb page system for local SEO agencies. Produces unique pages per suburb with SEO metadata, local context, and deployable HTML. Here's an example: [screenshot]. Looking for feedback from people who do this work.",
    "Question for local SEO folks: how do you handle suburb page scaling? I built a tool that generates them automatically — unique content per suburb, full HTML export, 30 seconds per page. Here's a sample: [screenshot]."
];

const LINKEDIN_TEMPLATES = [
    "I've been working on a tool that generates suburb-specific landing pages for local SEO. Each page gets unique content, localized context, and deploy-ready HTML. Here's an example output: [screenshot]. Would love feedback from people who manage local SEO campaigns.",
    "Local SEO agencies: suburb page production is one of the biggest time sinks in client fulfillment. I built a tool that generates deploy-ready suburb pages in 30 seconds. Each page includes SEO metadata, local context, and full HTML export. Here's what it produces: [screenshot].",
    "Automating local SEO fulfillment one suburb at a time. Built a system that generates unique suburb landing pages with localized content, process steps, and deployable HTML. Here's a sample: [screenshot]. Interested in feedback from agency operators."
];

function generateTweets(count = 10) {
    const tweets = [];
    for (let i = 0; i < count; i++) {
        const hook = TWEET_HOOKS[i % TWEET_HOOKS.length];
        tweets.push({
            id: `tweet_${Date.now()}_${i}`,
            text: hook,
            type: 'proof',
            created_at: new Date().toISOString()
        });
    }
    return tweets;
}

function generateRedditComments(count = 5) {
    const comments = [];
    for (let i = 0; i < count; i++) {
        comments.push({
            id: `reddit_${Date.now()}_${i}`,
            text: REDDIT_TEMPLATES[i % REDDIT_TEMPLATES.length],
            type: 'engagement',
            created_at: new Date().toISOString()
        });
    }
    return comments;
}

function generateLinkedInPosts(count = 5) {
    const posts = [];
    for (let i = 0; i < count; i++) {
        posts.push({
            id: `linkedin_${Date.now()}_${i}`,
            text: LINKEDIN_TEMPLATES[i % LINKEDIN_TEMPLATES.length],
            type: 'proof',
            created_at: new Date().toISOString()
        });
    }
    return posts;
}

function generateAllContent() {
    return {
        tweets: generateTweets(10),
        reddit_comments: generateRedditComments(5),
        linkedin_posts: generateLinkedInPosts(5)
    };
}

module.exports = { generateTweets, generateRedditComments, generateLinkedInPosts, generateAllContent, TWEET_HOOKS, REDDIT_TEMPLATES, LINKEDIN_TEMPLATES };
