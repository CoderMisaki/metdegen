const bs58 = require('bs58');
const nacl = require('tweetnacl');

// Global cache di dalam serverless (agar tidak login berkali-kali setiap detik)
let cachedAuth = null;
let authExpiry = 0;

async function ensureAuth() {
    const pk = process.env.SOLANA_PRIVATE_KEY;
    if (!pk) return null; // Jika lupa set ENV, tetap jalan tanpa login (fallback publik)

    // Gunakan sesi login lama jika masih valid
    if (cachedAuth && Date.now() < authExpiry) {
        return cachedAuth;
    }

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

            cachedAuth = { cookie, token };
            // Simpan sesi login selama 12 jam
            authExpiry = Date.now() + (1000 * 60 * 60 * 12); 
            console.log("[RugCheck Auth] Login Berhasil!");
            return cachedAuth;
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
        // Panggil fungsi otentikasi
        const auth = await ensureAuth();
        
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
