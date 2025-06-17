// /api/verify-token.js

import admin from '../src/main/docs/public/firebase-config'; // 별도 분리한 firebase-admin 초기화 코드
import { checkUserExists } from '../src/main/docs/server.js'; // DB 체크 함수

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Authorization 헤더가 없습니다.' });
    }

    const idToken = authHeader.split('Bearer ')[1].trim();

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;
        const result = await checkUserExists(uid);
        const nickname = result.userdata[0]?.nickname || "unknown";

        return res.json({
            success: true,
            uid,
            nickname,
            message: '토큰 검증 성공했습니다!!',
            redirectUrl: `/save-uid?uid=${uid}`
        });
    } catch (error) {
        console.error('토큰 검증 실패:', error);
        return res.status(401).json({ success: false, message: '유효하지 않은 토큰임.' });
    }
}
