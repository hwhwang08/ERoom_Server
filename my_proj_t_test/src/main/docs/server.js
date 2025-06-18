console.log("ENV DETECTED:", process.env.Eroom_e6659_firebase ? "✅ YES" : "❌ NO");
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');
const https = require('https');
const fs = require('fs');
const querystring = require('querystring');
const axios = require('axios');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const PORT_HTTPS = 7999;

const httpsOptions = {
    // 버셀용
    key: process.env.Local_KEY.replace(/\\n/g, '\n'),
    // 기본용
    // key: fs.readFileSync(path.resolve(__dirname, '../../../mylocal.dev+4-key.pem')),
    cert: fs.readFileSync(path.resolve(__dirname, '../../../mylocal.dev+4.pem')),
};

// const serviceAccount = require('../resources/eroom-e6659-firebase-adminsdk-fbsvc-60b39b555b.json');
// 수정된 코드
const serviceAccount = JSON.parse(process.env.Eroom_e6659_firebase);

// const serviceAccount = {
//         type: "service_account",
//         project_id: process.env.FIREBASE_PROJECT_ID || "eroom-e6659",
//         private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
//         client_email: process.env.FIREBASE_CLIENT_EMAIL || "firebase-adminsdk-fbsvc@eroom-e6659.iam.gserviceaccount.com",
//         // 나머지 필드들...
//     }

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://eroom-e6659-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.firestore();

async function checkUserExists(uid) {
    try {
        const userdata = await admin.firestore().collection('user_Datas')
            .where("uid", "==", uid)
            .get();

        return {
            userExists: !userdata.empty,
            userdata: userdata.docs.map(doc => doc.data())
        };
    } catch (error) {
        console.error('파베 유저 확인 오류:', error);
        return { userExists: false, userdata: [] };
    }
}

async function getToken() {
    const response = await axios.post('https://api.iamport.kr/users/getToken', {
        imp_key: IMP_API_KEY,
        imp_secret: IMP_API_SECRET,
    });
    if (response.data.code === 0) return response.data.response.access_token;
    throw new Error('아임포트 토큰 발급 실패');
}

function validateUserId(userId) { return true; }

const IMP_API_KEY = process.env.IMP_KEY;
const IMP_API_SECRET = process.env.IMP_SECRET;

async function verifyPayment(imp_uid) {
    const token = await getToken();
    const { data } = await axios.get(`https://api.iamport.kr/payments/${imp_uid}`, {
        headers: { Authorization: token }
    });

    if (data.code === 0 && data.response.status === 'paid') {
        console.log("!!결제 성공!")
        return true;
    } else {
        console.log("!!결제 실패!")
        return false;
    }
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

const server = https.createServer(httpsOptions, async (req, res) => {
    const urlObj = new URL(req.url, `https://${req.headers.host}`);
    const pathname = urlObj.pathname;
    const method = req.method;

    const cookies = parseCookies(req);
    const uid = cookies.uid;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && req.url.startsWith('/verify-token')) {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Authorization 헤더가 없습니다.' }));
            return;
        }

        const idToken = authHeader.split('Bearer ')[1].trim();

        try {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;
            const result = await checkUserExists(uid);
            console.log(result.userdata);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                uid,
                message: '토큰 검증 성공했습니다!!',
                redirectUrl: `https://192.168.0.170:${PORT_HTTPS}/save-uid?uid=${uid}`
            }));
        } catch (err) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: '유효하지 않은 토큰임.' }));
        }
        return;
    }

    if (req.method === 'GET' && urlObj.pathname === '/verify-user-and-payment') {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, userExists: false, message: 'Authorization 헤더가 필요합니다' }));
            return;
        }

        const userId = authHeader.replace('Bearer ', '').trim();
        console.log("서버쪽 유저 닉넴", userId)
        if (!userId || !validateUserId(userId)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, userExists: false, message: '유효하지 않은 Authorization 헤더 형식입니다' }));
            return;
        }

        // const userCheckResult = await checkUserExists(userId);

        // 어차피 닉네임 /= uid 비교라 안된다.
        // if (!userCheckResult.userExists) {
        //     res.writeHead(404, { 'Content-Type': 'application/json' });
        //     res.end(JSON.stringify({ success: false, userExists: false, message: '존재하지 않는 사용자입니다' }));
        //     return;
        // }

        const orderId = urlObj.searchParams.get('orderId');
        const amount = urlObj.searchParams.get('amount');
        const orderName = urlObj.searchParams.get('orderName');
        const method = urlObj.searchParams.get('method');
        const paymentKey = urlObj.searchParams.get('paymentKey');
        const creditAmount = urlObj.searchParams.get('creditAmount');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            userExists: true,
            userId,
            message: '사용자 검증 및 결제 데이터 처리 완료',
            paymentData: { orderId, amount, orderName, method, paymentKey, creditAmount }
        }));
        return;
    }

    if (req.method === 'POST' && req.url === '/purchase') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { uid, creditAmount, timestamp, price } = data;

                console.log('크레딧 구매 정보 수신:', { uid, creditAmount, timestamp, price });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: '크레딧 구매 정보가 성공적으로 처리되었습니다',
                    data: { uid, creditAmount, timestamp, price }
                }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: '잘못된 JSON 데이터입니다.' }));
            }
        });
        return;
    }

    if (req.method === 'GET' && pathname === '/payment-complete') {
        const imp_uid = urlObj.searchParams.get('imp_uid');
        const merchant_uid = urlObj.searchParams.get('merchant_uid');

        if (!imp_uid || !merchant_uid) {
            res.writeHead(400);
            res.end('잘못된 요청입니다.');
            return;
        }

        try {
            const verified = await verifyPayment(imp_uid);
            const redirectUrl = verified
                ? `/success?imp_uid=${imp_uid}&merchant_uid=${merchant_uid}`
                : `/fail.html?imp_uid=${imp_uid}&merchant_uid=${merchant_uid}`;
            res.writeHead(302, { Location: redirectUrl });
            res.end();
        } catch (err) {
            console.error('결제 검증 오류:', err);
            res.writeHead(500);
            res.end('서버 오류 발생');
        }
        return;
    }

    const staticPath = path.join(__dirname, 'public', pathname);
    if (pathname === '/firebase-config.js') {
        // 바셀
        const firebaseConfigJSON = process.env.FIREBASE_CONFIG;
        if (!firebaseConfigJSON) {
            res.writeHead(404).end('Not Found');
            return;
        }
        const jsContent = `window.firebaseConfig = ${firebaseConfigJSON};`;
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(jsContent);

        // 로컬용
        // const filePath = path.join(__dirname, 'public', 'firebase-config.js');
        // return fs.readFile(filePath, (err, data) => {
        //     if (err) return res.writeHead(404).end('Not Found');
        //     res.writeHead(200, { 'Content-Type': 'application/javascript' });
        //     res.end(data);
        // });
    }

    let serviceAccount;

    if (process.env.Eroom_e6659_firebase) {
        console.log("✅ Using env var for Firebase");
        console.log("✅ ENV string preview:", process.env.Eroom_e6659_firebase.slice(0, 100));
        try {
            serviceAccount = JSON.parse(process.env.Eroom_e6659_firebase);
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        } catch (e) {
            console.error("❌ Failed to parse Firebase ENV JSON:", e.message);
            throw new Error("Firebase ENV parsing error");
        }
    } else {
        console.log("❌ Env var missing! Falling back to local file (should not happen on Vercel)");
        serviceAccount = require('../resources/eroom-e6659-firebase-adminsdk-fbsvc-60b39b555b.json');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });

    // const admin = require('firebase-admin');
    //
    // let serviceAccount;
    //
    // if (process.env.Eroom_e6659_firebase) {
    //     serviceAccount = JSON.parse(process.env.Eroom_e6659_firebase);
    // }
    //     // 로컬
    //     // serviceAccount = require('../resources/eroom-e6659-firebase-adminsdk-fbsvc-60b39b555b.json');
    //
    // admin.initializeApp({
    //     credential: admin.credential.cert(serviceAccount),
    // });


    if (pathname === '/') {
        if (!uid) {
            // 로그인 페이지 띄우기
            const filePath = path.join(__dirname, 'public', 'login.html');
            return fs.readFile(filePath, (err, data) => {
                if (err) return res.writeHead(500).end('파일 오류');
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            });
        } else {
            // uid 있을 때 credit-shop.html 띄우기 + 닉네임 넣기
            const result = await checkUserExists(uid);
            if (!result.userExists) {
                // UID가 DB에 없으면 로그인 페이지로 보내거나 에러 처리
                const filePath = path.join(__dirname, 'public', 'login.html');
                return fs.readFile(filePath, (err, data) => {
                    if (err) return res.writeHead(500).end('파일 오류');
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(data);
                });
            }

            const nickname = result.userdata[0]?.nickname || 'unknown';

            const htmlPath = path.join(__dirname, 'public', 'credit-shop.html');
            return fs.readFile(htmlPath, 'utf8', (err, data) => {
                if (err) return res.writeHead(500).end('파일 오류');

                // HTML 끝 </body> 태그 직전에 닉네임, uid 스크립트 삽입
                const modifiedHtml = data.replace(
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

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(modifiedHtml);
            });
        }
    }

    if (pathname === '/save-uid') {
        const uidParam = urlObj.searchParams.get('uid');
        console.log("받은 UID:", uidParam);
        const result = await checkUserExists(uidParam);

        if (result.userExists) {
            res.writeHead(302, {
                'Set-Cookie': `uid=${uidParam}; Path=/; HttpOnly`,
                'Location': '/'
            });
            res.end();
        } else {
            res.writeHead(404);
            res.end('해당 UID의 유저를 찾을 수 없습니다.');
        }
        return;
    }

    if (pathname === '/login') {
        const filePath = path.join(__dirname, 'public', 'login.html');
        return fs.readFile(filePath, (err, data) => {
            if (err) return res.writeHead(500).end('파일 오류');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    }

    if (pathname === '/success' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const parsed = querystring.parse(body);
            const nickname = cookies.nickname || 'unknown';
            const paymentData = { ...parsed, nickname };

            const filePath = path.join(__dirname, 'public', 'success.html');
            fs.readFile(filePath, 'utf8', (err, html) => {
                if (err) return res.writeHead(500).end('파일 읽기 오류');

                const modifiedHtml = html.replace(
                    '</body>',
                    `<script>
                        window.addEventListener('DOMContentLoaded', () => {
                            const paymentData = ${JSON.stringify(paymentData)};
                            document.getElementById('orderId').textContent = paymentData.orderId || paymentData.merchant_uid || '-';
                            document.getElementById('orderName').textContent = paymentData.orderName || '-';
                            document.getElementById('amount').textContent = paymentData.amount ? Number(paymentData.amount).toLocaleString() + '원' : '-';
                            document.getElementById('method').textContent = paymentData.method || '-';
                            window.paymentData = paymentData;
                        });
                    </script></body>`
                );
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(modifiedHtml);
            });
        });
        return;
    }

    if (pathname === '/iamport-webhook' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const jsonData = JSON.parse(body);
                console.log('아임포트 웹훅 호출됨!', jsonData);
                res.writeHead(200);
                res.end('웹훅 OK');
            } catch (e) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
        return;
    }

    fs.stat(staticPath, (err, stat) => {
        if (!err && stat.isFile()) {
            fs.createReadStream(staticPath).pipe(res);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });
});

server.listen(PORT_HTTPS, '0.0.0.0', () => {
    console.log(`HTTPS 서버 실행 중 https://localhost:${PORT_HTTPS}`);
    console.log(`토큰 테스트용 임시 로그인: https://localhost:${PORT_HTTPS}/test_login.html`);
});
