// /api/get-credit-shop.js

import { checkUserExists } from '../../src/main/docs/server.js'; // 실제 경로에 맞춰 조정

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 허용됨' });

    const { uid } = req.query;

    if (!uid) return res.status(400).json({ error: 'uid 없음' });

    try {
        const result = await checkUserExists(uid);
        const nickname = result.userdata[0]?.nickname || 'unknown';

        return res.status(200).json({
            success: true,
            uid,
            nickname
        });
    } catch (error) {
        console.error('유저 조회 실패:', error);
        return res.status(500).json({ error: '서버 오류' });
    }
}
