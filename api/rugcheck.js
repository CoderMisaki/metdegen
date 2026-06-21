const bs58 = require('bs58');
const nacl = require('tweetnacl');

const AUTH_CACHE_TTL_SECONDS = 60 * 60 * 12;

function getKvConfig() {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function readAuthFromKv() {
    const kv = getKvConfig();
    if (!kv) return null;

    try {
        const res = await fetch(`${kv.url}/get/rugcheck:auth`, {
            headers: { Authorization: `Bearer ${kv.token}` }
        });
        if (!res.ok) return null;

        const payload = await res.json().catch(() => ({}));
        const raw = payload?.result;
        if (!raw) return null;

        const auth = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (auth?.expiresAt && Date.now() >= Number(auth.expiresAt)) return null;
        if (!auth?.cookie && !auth?.token) return null;

        return { cookie: auth.cookie || null, token: auth.token || null };
    } catch (e) {
        console.warn('[RugCheck Auth] KV read skipped:', e.message);
        return null;
    }
}

async function writeAuthToKv(auth) {
    const kv = getKvConfig();
    if (!kv || (!auth?.cookie && !auth?.token)) return;

    try {
        const expiresAt = Date.now() + (AUTH_CACHE_TTL_SECONDS * 1000);
        await fetch(kv.url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${kv.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(['SET', 'rugcheck:auth', JSON.stringify({ ...auth, expiresAt }), 'EX', AUTH_CACHE_TTL_SECONDS])
        });
    } catch (e) {
        console.warn('[RugCheck Auth] KV write skipped:', e.message);
    }
}

function getClientAuth(req) {
    const token = req.headers['x-rugcheck-token'];
    const cookie = req.headers['x-rugcheck-cookie'];
    if (!token && !cookie) return null;
    return {
        token: Array.isArray(token) ? token[0] : token,
        cookie: Array.isArray(cookie) ? cookie[0] : cookie
    };
}

async function ensureAuth() {
    const pk = process.env.SOLANA_PRIVATE_KEY;
    if (!pk) return null; // Jika lupa set ENV, tetap jalan tanpa login (fallback publik)

    const cachedAuth = await readAuthFromKv();
    if (cachedAuth) return cachedAuth;

    try {
        const secretKey = bs58.decode(pk);
        if (secretKey.length !== 64) throw new Error("Private key length invalid");
        
        // Ekstrak Keypair & Public Key
        const keypair = nacl.sign.keyPair.fromSecretKey(secretKey);
        const publicKeyStr = bs58.encode(keypair.publicKey);
        
        // 1. Siapkan Pesan
        const messageData = {
            message: "Sign-in to Rugcheck.xyz",
            timestamp: Date.now(),
            publicKey: publicKeyStr
        };
        const messageJson = JSON.stringify(messageData);
        const messageBytes = new TextEncoder().encode(messageJson);
        
        // 2. Tanda Tangani (Sign Message)
        const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
        
        const payload = {
            signature: {
                data: Array.from(signatureBytes),
                type: "ed25519"
            },
            wallet: publicKeyStr,
            message: messageData
        };

        // 3. Tembak API Login RugCheck
        const res = await fetch("https://api.rugcheck.xyz/auth/login/solana", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            // Ekstrak Cookie atau Token JWT dari response
            const cookie = res.headers.get('set-cookie');
            const data = await res.json().catch(() => ({}));
            const token = data.token || data.accessToken || null;

            const auth = { cookie, token };
            await writeAuthToKv(auth);
            console.log("[RugCheck Auth] Login Berhasil!");
            return auth;
        } else {
            console.error("[RugCheck Auth] Gagal Login:", res.status);
        }
    } catch (e) {
        console.error("[RugCheck Auth Error]", e.message);
    }
    return null;
}

module.exports = async function handler(req, res) {
    // Handler utama Vercel
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { mint } = req.query;
    if (!mint) {
        return res.status(400).json({ error: 'mint is required' });
    }

    try {
        // Prioritaskan auth yang dikirim client; fallback ke cache serverless eksternal atau login per request.
        const auth = getClientAuth(req) || await ensureAuth();
        
        const headers = {
            'Accept': 'application/json',
            'User-Agent': 'Masako-Engine/2.0'
        };

        // Sisipkan VIP Token jika berhasil login
        if (auth?.token) headers['Authorization'] = `Bearer ${auth.token}`;
        if (auth?.cookie) headers['Cookie'] = auth.cookie;

        // Tarik data Report Token
        const rcRes = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, {
            method: 'GET',
            headers
        });

        if (!rcRes.ok) {
            return res.status(rcRes.status).json({ error: `Rugcheck API error: ${rcRes.status}` });
        }

        const data = await rcRes.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error('[Rugcheck Route Error]', error);
        return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
};
