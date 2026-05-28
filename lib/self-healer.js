// Self-Healing Optimization Engine — Rule-based adaptive system
// Analyzes performance and auto-adjusts strategy

function analyzePerformance(outreachLog, metrics) {
    const channelPerf = {};
    const nichePerf = {};
    const hookPerf = {};

    for (const entry of outreachLog) {
        // Channel performance
        if (!channelPerf[entry.channel]) channelPerf[entry.channel] = { sent: 0, replies: 0, trials: 0, converted: 0 };
        channelPerf[entry.channel].sent++;
        if (entry.replied) channelPerf[entry.channel].replies++;
        if (entry.trial_given) channelPerf[entry.channel].trials++;
        if (entry.converted) channelPerf[entry.channel].converted++;

        // Hook performance
        const hookKey = entry.hook_type || 'unknown';
        if (!hookPerf[hookKey]) hookPerf[hookKey] = { sent: 0, replies: 0 };
        hookPerf[hookKey].sent++;
        if (entry.replied) hookPerf[hookKey].replies++;
    }

    // Calculate rates
    for (const ch of Object.keys(channelPerf)) {
        const c = channelPerf[ch];
        c.reply_rate = c.sent > 0 ? c.replies / c.sent : 0;
        c.trial_rate = c.sent > 0 ? c.trials / c.sent : 0;
        c.conversion_rate = c.sent > 0 ? c.converted / c.sent : 0;
    }
    for (const h of Object.keys(hookPerf)) {
        const hook = hookPerf[h];
        hook.reply_rate = hook.sent > 0 ? hook.replies / hook.sent : 0;
    }

    return { channels: channelPerf, hooks: hookPerf };
}

function generateRecommendations(performance) {
    const recs = [];
    const { channels, hooks } = performance;

    // Channel recommendations
    const channelEntries = Object.entries(channels).sort((a, b) => b[1].reply_rate - a[1].reply_rate);
    if (channelEntries.length > 0) {
        const best = channelEntries[0];
        const worst = channelEntries[channelEntries.length - 1];

        if (best[1].reply_rate > 0.2) {
            recs.push({ type: 'channel_boost', channel: best[0], action: 'increase_allocation', reason: `${best[0]} has ${(best[1].reply_rate * 100).toFixed(0)}% reply rate` });
        }
        if (worst[1].reply_rate < 0.05 && worst[1].sent >= 20) {
            recs.push({ type: 'channel_reduce', channel: worst[0], action: 'reduce_allocation', reason: `${worst[0]} has ${(worst[1].reply_rate * 100).toFixed(0)}% reply rate after ${worst[1].sent} sends` });
        }
    }

    // Hook recommendations
    const hookEntries = Object.entries(hooks).sort((a, b) => b[1].reply_rate - a[1].reply_rate);
    if (hookEntries.length > 0) {
        const bestHook = hookEntries[0];
        const worstHook = hookEntries[hookEntries.length - 1];

        if (bestHook[1].reply_rate > 0.15) {
            recs.push({ type: 'hook_boost', hook: bestHook[0], action: 'increase_usage', reason: `"${bestHook[0]}" hooks have ${(bestHook[1].reply_rate * 100).toFixed(0)}% reply rate` });
        }
        if (worstHook[1].reply_rate < 0.05 && worstHook[1].sent >= 15) {
            recs.push({ type: 'hook_kill', hook: worstHook[0], action: 'stop_using', reason: `"${worstHook[0]}" hooks have ${(worstHook[1].reply_rate * 100).toFixed(0)}% reply rate` });
        }
    }

    // Volume recommendations
    const totalSent = Object.values(channels).reduce((sum, c) => sum + c.sent, 0);
    if (totalSent < 50) {
        recs.push({ type: 'volume', action: 'increase_outreach', reason: `Only ${totalSent} touches sent. Need more volume for statistical significance.` });
    }

    return recs;
}

function calculateChannelAllocation(performance) {
    const { channels } = performance;
    const total = Object.values(channels).reduce((sum, c) => sum + c.sent, 0);
    if (total === 0) return {};

    const allocation = {};
    for (const [ch, data] of Object.entries(channels)) {
        const performanceScore = data.reply_rate * 0.6 + data.trial_rate * 0.4;
        allocation[ch] = Math.max(0.05, performanceScore);
    }

    // Normalize to 100%
    const sum = Object.values(allocation).reduce((s, v) => s + v, 0);
    for (const ch of Object.keys(allocation)) {
        allocation[ch] = allocation[ch] / sum;
    }

    return allocation;
}

function shouldKillVariant(hookPerf, hookName, minSends = 15) {
    const hook = hookPerf[hookName];
    if (!hook || hook.sent < minSends) return false;
    return hook.reply_rate < 0.03;
}

function shouldBoostVariant(hookPerf, hookName) {
    const hook = hookPerf[hookName];
    if (!hook || hook.sent < 10) return false;
    return hook.reply_rate > 0.2;
}

module.exports = { analyzePerformance, generateRecommendations, calculateChannelAllocation, shouldKillVariant, shouldBoostVariant };
