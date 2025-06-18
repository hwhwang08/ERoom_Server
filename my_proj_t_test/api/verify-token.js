const admin = require('firebase-admin');

// Firebase 초기화
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
}

async function checkUserExists(uid) {
    try {
        const db = admin.firestore();
        const userdata = await db.collection('user_Datas')
            .where("uid", "==", uid)
            .get();
        return {
            userExists: !userdata.empty,
            userdata: userdata.docs.map(doc => doc.data())
        };
    } catch (error) {
        console.error('Firebase 사용자 확인 오류:', error);
        return { userExists: false, userdata: [] };
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Authorization 헤더가 없습니다.'
        });
    }

    const idToken = authHeader.split('Bearer ')[1].trim();

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;
        const result = await checkUserExists(uid);

        const baseUrl = `https://${req.headers.host}`;

        res.status(200).json({
            success: true,
            uid,
            message: '토큰 검증 성공했습니다!!',
            redirectUrl: `${baseUrl}/api/save-uid?uid=${uid}`
        });
    } catch (err) {
        res.status(401).json({
            success: false,
            message: '유효하지 않은 토큰임.'
        });
    }
}