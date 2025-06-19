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
        // login 페이지로 리다이렉트
        return res.redirect(302, '/login');
    }

    const result = await checkUserExists(uid);
    if (!result.userExists) {
        return res.redirect(302, '/login');
    }

    const nickname = result.userdata[0]?.nickname || 'unknown';

    try {
        // Vercel에서는 public 폴더가 root 레벨에서 접근 가능
        const htmlPath = path.join(process.cwd(), 'public', 'credit-shop.html');

        console.log('HTML 파일 경로:', htmlPath);
        console.log('파일 존재 여부:', fs.existsSync(htmlPath));

        if (!fs.existsSync(htmlPath)) {
            // 디버깅을 위한 정보 출력
            const publicDir = path.join(process.cwd(), 'public');
            const files = fs.existsSync(publicDir) ? fs.readdirSync(publicDir) : [];

            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>파일 없음</title>
                    <meta charset="utf-8">
                </head>
                <body>
                    <h1>credit-shop.html 파일을 찾을 수 없습니다</h1>
                    <p>현재 작업 디렉토리: ${process.cwd()}</p>
                    <p>찾는 파일 경로: ${htmlPath}</p>
                    <p>public 폴더 파일들: ${files.join(', ')}</p>
                </body>
                </html>
            `);
        }

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

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        console.error('메인 페이지 로드 오류:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>서버 오류</title>
                <meta charset="utf-8">
            </head>
            <body>
                <h1>서버 오류가 발생했습니다</h1>
                <p>오류: ${error.message}</p>
                <p>스택: ${error.stack}</p>
            </body>
            </html>
        `);
    }
};