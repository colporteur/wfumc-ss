import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill in the values.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    // Distinct storage key per WFUMC app so tokens don't trample each
    // other when used in the same browser.
    storageKey: 'wfumc-ss-auth',
    lock: (_name, _acquireTimeout, fn) => fn(),
  },
});

export { supabaseUrl };

/**
 * Wraps a Supabase query (or any promise) with a hard timeout so the UI
 * never hangs indefinitely waiting on a network call.
 */
export function withTimeout(promise, ms = 15000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `Request timed out after ${Math.round(ms / 1000)}s. ` +
            `Check your connection and try again.`
        )
      );
    }, ms);
  });
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    timeout,
  ]);
}

/**
 * Calls the shared claude-proxy Edge Function. Same proxy used by every
 * WFUMC app — auth is enforced via Supabase JWT.
 */
export async function callClaude(body, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 60000;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not signed in');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/claude-proxy`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error(
        `Claude took longer than ${Math.round(timeoutMs / 1000)}s to respond. ` +
          `Try again, or split into smaller pieces.`
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Claude proxy error ${res.status}: ${errBody}`);
  }
  return res.json();
}
