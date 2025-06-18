const admin = require('firebase-admin');

// Firebase 초기화
if (!admin.apps.length) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.FIREBASE_DATABASE_URL) {
        throw new Error('Firebase 환경변수가 설정되지 않았습니다.');
    }

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

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const { uid } = req.query;

    if (!uid) {
        return res.status(400).json({ success: false, message: 'UID가 필요합니다' });
    }

    const result = await checkUserExists(uid);

    if (result.userExists) {
        res.setHeader('Set-Cookie', `uid=${uid}; Path=/; HttpOnly; SameSite=Lax`);
        res.redirect(302, '/');
    } else {
        res.status(404).json({
            success: false,
            message: '해당 UID의 유저를 찾을 수 없습니다.'
        });
    }
};