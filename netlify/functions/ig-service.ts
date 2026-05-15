import type { Handler, HandlerEvent } from '@netlify/functions';

const IG_DEMO_BASE = 'https://demo-api.ig.com/gateway/deal';
const IG_LIVE_BASE = 'https://api.ig.com/gateway/deal';

interface IGSession {
  CST: string;
  X_SECURITY_TOKEN: string;
}

async function getIGSession(
  baseUrl: string,
  apiKey: string,
  username: string,
  password: string
): Promise<IGSession> {
  const res = await fetch(`${baseUrl}/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json; charset=UTF-8',
      'X-IG-API-KEY': apiKey,
      'Version': '2',
    },
    body: JSON.stringify({
      identifier: username,
      password: password,
      encryptedPassword: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`IG Auth failed (${res.status}): ${body}`);
  }

  const CST = res.headers.get('CST') || '';
  const X_SECURITY_TOKEN = res.headers.get('X-SECURITY-TOKEN') || '';

  if (!CST || !X_SECURITY_TOKEN) {
    throw new Error('IG Auth: Missing CST or X-SECURITY-TOKEN in response headers');
  }

  return { CST, X_SECURITY_TOKEN };
}

async function igRequest<T>(
  baseUrl: string,
  path: string,
  session: IGSession,
  apiKey: string,
  method = 'GET',
  body?: unknown,
  version = '1'
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json; charset=UTF-8',
      'X-IG-API-KEY': apiKey,
      'CST': session.CST,
      'X-SECURITY-TOKEN': session.X_SECURITY_TOKEN,
      'Version': version,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`IG API ${path} failed (${res.status}): ${errBody}`);
  }

  return res.json() as Promise<T>;
}

function cors(response: { statusCode: number; body: string; headers?: Record<string, string> }) {
  return {
    ...response,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json',
      ...(response.headers || {}),
    },
  };
}

export const handler: Handler = async (event: HandlerEvent) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return cors({ statusCode: 204, body: '' });
  }

  if (event.httpMethod !== 'POST') {
    return cors({ statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) });
  }

  try {
    const body = JSON.parse(event.body || '{}') as {
      action: string;
      accountType?: 'DEMO' | 'LIVE';
      epic?: string;
      searchTerm?: string;
      fromDate?: string;
      toDate?: string;
      maxResults?: number;
      pageSize?: number;
      pageNumber?: number;
    };

    const { action, accountType = 'DEMO' } = body;

    // Read credentials from Netlify environment variables (set in Netlify UI)
    const apiKey = process.env.IG_API_KEY;
    const username = process.env.IG_USERNAME;
    const password = process.env.IG_PASSWORD;

    if (!apiKey || !username || !password) {
      return cors({
        statusCode: 500,
        body: JSON.stringify({
          error: 'IG API credentials not configured. Set IG_API_KEY, IG_USERNAME, IG_PASSWORD in Netlify environment variables.',
        }),
      });
    }

    const baseUrl = accountType === 'LIVE' ? IG_LIVE_BASE : IG_DEMO_BASE;
    const session = await getIGSession(baseUrl, apiKey, username, password);

    switch (action) {
      case 'testConnection': {
        const data = await igRequest<Record<string, unknown>>(
          baseUrl, '/session', session, apiKey
        );
        return cors({
          statusCode: 200,
          body: JSON.stringify({ success: true, accountType, data }),
        });
      }

      case 'getAccounts': {
        const data = await igRequest<{ accounts: unknown[] }>(
          baseUrl, '/accounts', session, apiKey
        );
        return cors({ statusCode: 200, body: JSON.stringify(data) });
      }

      case 'getTransactionHistory': {
        const {
          fromDate,
          toDate,
          maxResults = 500,
          pageSize = 20,
          pageNumber = 1,
        } = body;

        let path = `/history/transactions?type=ALL&maxSpanSeconds=604800&pageSize=${pageSize}&pageNumber=${pageNumber}`;
        if (fromDate) path += `&from=${fromDate}`;
        if (toDate) path += `&to=${toDate}`;
        if (maxResults) path += `&maxSpanSeconds=31536000`;

        const data = await igRequest<{
          transactions: unknown[];
          metadata: { pageData: unknown };
        }>(baseUrl, path, session, apiKey, 'GET', undefined, '2');

        return cors({ statusCode: 200, body: JSON.stringify(data) });
      }

      case 'getMarketDetails': {
        const { epic } = body;
        if (!epic) {
          return cors({ statusCode: 400, body: JSON.stringify({ error: 'epic is required' }) });
        }
        const data = await igRequest<unknown>(
          baseUrl, `/markets/${encodeURIComponent(epic)}`, session, apiKey
        );
        return cors({ statusCode: 200, body: JSON.stringify(data) });
      }

      case 'searchMarkets': {
        const { searchTerm } = body;
        if (!searchTerm) {
          return cors({ statusCode: 400, body: JSON.stringify({ error: 'searchTerm is required' }) });
        }
        const data = await igRequest<unknown>(
          baseUrl,
          `/markets?searchTerm=${encodeURIComponent(searchTerm)}`,
          session,
          apiKey
        );
        return cors({ statusCode: 200, body: JSON.stringify(data) });
      }

      case 'getPositions': {
        const data = await igRequest<{ positions: unknown[] }>(
          baseUrl, '/positions/otc', session, apiKey
        );
        return cors({ statusCode: 200, body: JSON.stringify(data) });
      }

      default:
        return cors({
          statusCode: 400,
          body: JSON.stringify({ error: `Unknown action: ${action}` }),
        });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ig-service]', message);
    return cors({
      statusCode: 500,
      body: JSON.stringify({ error: message }),
    });
  }
};
