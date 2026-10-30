// M2-17 / WK-28 / WK-30 / IN-15. Deploy only through the approved merge workflow.
// This entry point checks auth itself, like food-describe. No workout is stored here.
import { cors, json, requireUser } from '../_shared/http.ts';
import { consumeQuota, releaseQuota } from '../_shared/quota.ts';
import { createWorkoutSummaryHandler } from './handler.ts';
const handler = createWorkoutSummaryHandler({
    json, requireUser, consumeQuota, releaseQuota,
    model: async (payload) => {
        const key = Deno.env.get('ANTHROPIC_API_KEY');
        if (!key)
            throw Error('Unavailable.');
        return await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(30000),
        });
    },
});
Deno.serve(req => req.method === 'OPTIONS' ? new Response('ok', { headers: cors }) : handler(req));
