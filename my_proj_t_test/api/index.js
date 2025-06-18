
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

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

function parseCookies(req) {
    const list = {};
    const rc = req.headers.cookie;
    rc && rc.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    });
    return list;
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
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const cookies = parseCookies(req);
    const uid = cookies.uid;

    if (!uid) {
        return res.redirect('/login');
    }

    const result = await checkUserExists(uid);
    if (!result.userExists) {
        return res.redirect('/login');
    }

    const nickname = result.userdata[0]?.nickname || 'unknown';

    const htmlPath = path.join(process.cwd(), 'public', 'credit-shop.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    html = html.replace(
        '</body>',
        `<script>
          const nickname = '${nickname}';
          const uid = '${uid}';
          sessionStorage.setItem('userId', nickname);
          sessionStorage.setItem('userUid', uid);
          const userIdElement = document.getElementById('user-id');
          if (userIdElement) userIdElement.textContent = nickname;
        </script></body>`
    );

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
};