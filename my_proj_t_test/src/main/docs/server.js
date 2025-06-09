const express = require('express');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');
const https = require('https');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();
// const PORT_HTTP = 7999;  // HTTP 포트 (리다이렉트용)
const PORT_HTTPS = 7999; // HTTPS 포트

// HTTPS 옵션 (key.pem, cert.pem 실제 경로 맞춰주세요)
const httpsOptions = {
    key: fs.readFileSync(path.resolve(__dirname, '../../../localhost+2-key.pem')),
    cert: fs.readFileSync(path.resolve(__dirname, '../../../localhost+2.pem')),

};

// Firebase Admin 초기화 (경로는 .env에 넣고 불러오는 걸 추천)
const serviceAccountPath = process.env.FIREBASE_CREDENTIAL_PATH || '../../../src/main/resources/eroom-e6659-firebase-adminsdk-fbsvc-60b39b555b.json';
const serviceAccount = require(path.resolve(serviceAccountPath));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://eroom-e6659-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.firestore();

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 로깅 미들웨어
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// 사용자 ID 유효성 검사 함수
function validateUserId(userId) {
    const uidRegex = /^[a-zA-Z0-9_-]{4,20}$/;
    return uidRegex.test(userId);
}

// Firebase에서 유저 존재 여부 확인 함수
async function checkUserExists(userId) {
    try {
        const querySnapshot = await db.collection('loginHistory')
            .where("userId", "==", userId)
            .get();
        return !querySnapshot.empty;
    } catch (error) {
        console.error('Firebase 유저 확인 오류:', error);
        return false;
    }
}

// API 엔드포인트들

// GET - 사용자 검증 및 결제 정보 확인
app.get('/verify-user-and-payment', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return res.status(401).json({ success: false, userExists: false, message: 'Authorization 헤더가 필요합니다' });
        }

        const userId = authHeader.replace('Bearer ', '').trim();
        if (!userId || !validateUserId(userId)) {
            return res.status(401).json({ success: false, userExists: false, message: '유효하지 않은 Authorization 헤더 형식입니다' });
        }

        const userExists = await checkUserExists(userId);

        if (!userExists) {
            return res.status(404).json({ success: false, userExists: false, message: '존재하지 않는 사용자입니다' });
        }

        const { orderId, amount, orderName, method, paymentKey, creditAmount } = req.query;

        res.json({
            success: true,
            userExists: true,
            userId,
            message: '사용자 검증 및 결제 데이터 처리 완료',
            paymentData: { orderId, amount, orderName, method, paymentKey, creditAmount }
        });

    } catch (error) {
        console.error('사용자 검증 오류:', error);
        res.status(500).json({ success: false, userExists: false, message: '서버 오류가 발생했습니다.' });
    }
});

// POST - 크레딧 구매 정보 처리
app.post('/purchase', (req, res) => {
    const { uid, creditAmount, timestamp, price } = req.body;
    console.log('크레딧 구매 정보 수신:', { uid, creditAmount, timestamp, price });
    res.json({ success: true, message: '크레딧 구매 정보가 성공적으로 처리되었습니다', data: { uid, creditAmount, timestamp, price } });
});

// POST - Firebase ID 토큰 검증
app.post('/verify-token', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: '토큰이 제공되지 않았습니다.' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        res.json({ success: true, uid: decodedToken.uid });
    } catch (error) {
        res.status(401).json({ success: false, message: '유효하지 않은 토큰입니다.' });
    }
});

const axios = require('axios');

async function approvePayment(paymentKey, orderId, amount) {
    const secretKey = process.env.TOSS_SECRET_KEY;

    const res = await axios.post(
        'https://api.tosspayments.com/v1/payments/confirm',
        {
            paymentKey,
            orderId,
            amount: Number(amount),
        },
        {
            headers: {
                'Authorization': `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
                'Content-Type': 'application/json',
            },
        }
    );

    return res.data;
}

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

// firebase-config.js 서빙
app.get('/firebase-config.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'firebase-config.js'));
});

// 기본 루트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 사용자별 크레딧 상점 페이지
app.get('/:userId/credit-shop.html', async (req, res) => {
    const userId = req.params.userId;
    if (!validateUserId(userId)) {
        return res.redirect('/?error=invalid_format&attempted_id=' + encodeURIComponent(userId));
    }
    if (!(await checkUserExists(userId))) {
        return res.redirect('/?error=user_not_found&attempted_id=' + encodeURIComponent(userId));
    }
    const filePath = path.join(__dirname, 'public', 'credit-shop.html');
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('credit-shop.html 파일을 찾을 수 없습니다.');
    }
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('파일을 읽을 수 없습니다.');
        const modifiedHtml = data.replace(
            '</body>',
            `<script>
         window.addEventListener('DOMContentLoaded', () => {
           sessionStorage.setItem('userId', '${userId}');
           const userIdElement = document.getElementById('user-id');
           if (userIdElement) userIdElement.textContent = '${userId}';
         });
       </script></body>`
        );
        res.send(modifiedHtml);
    });
});

// success.html POST 처리
app.post('/:userId/success.html', async (req, res) => {
    const userId = req.params.userId;
    if (!validateUserId(userId)) {
        return res.redirect('/?error=invalid_format&attempted_id=' + encodeURIComponent(userId));
    }
    if (!(await checkUserExists(userId))) {
        return res.redirect('/?error=user_not_found&attempted_id=' + encodeURIComponent(userId));
    }
    const filePath = path.join(__dirname, 'public', 'success.html');
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('success.html 파일을 찾을 수 없습니다.');
    }
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('파일을 읽을 수 없습니다.');
        const paymentData = { ...req.body, userId };
        const modifiedHtml = data.replace(
            '</body>',
            `<script>
         window.addEventListener('DOMContentLoaded', () => {
           const paymentData = ${JSON.stringify(paymentData)};
           document.getElementById('userId').textContent = paymentData.userId || '-';
           document.getElementById('orderId').textContent = paymentData.orderId || '-';
           document.getElementById('orderName').textContent = paymentData.orderName || '-';
           document.getElementById('amount').textContent = paymentData.amount ? Number(paymentData.amount).toLocaleString() + '원' : '-';
           document.getElementById('method').textContent = paymentData.method || '-';
           const backLink = document.getElementById('back-to-shop');
           if (backLink) backLink.href = '/' + paymentData.userId + '/credit-shop.html';

           window.paymentData = paymentData;

           if (paymentData.paymentKey && paymentData.orderId && paymentData.amount) {
             // confirmPayment 함수 정의 필요
             confirmPayment(paymentData.paymentKey, paymentData.orderId, paymentData.amount);
           }
           if (paymentData.userId && paymentData.amount && paymentData.creditAmount) {
             // sendPurchaseInfo 함수 정의 필요
             sendPurchaseInfo(paymentData.userId, paymentData.creditAmount, paymentData.amount);
           }
         });
       </script></body>`
        );
        res.send(modifiedHtml);
    });
});

// success.html GET 처리
app.get('/:userId/success.html', async (req, res) => {
    const userId = req.params.userId;
    if (!validateUserId(userId)) {
        return res.redirect('/?error=invalid_format&attempted_id=' + encodeURIComponent(userId));
    }
    if (!(await checkUserExists(userId))) {
        return res.redirect('/?error=user_not_found&attempted_id=' + encodeURIComponent(userId));
    }
    const filePath = path.join(__dirname, 'public', 'success.html');
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('success.html 파일을 찾을 수 없습니다.');
    }
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('파일을 읽을 수 없습니다.');
        const modifiedHtml = data.replace(
            '</body>',
            `<script>
         window.addEventListener('DOMContentLoaded', () => {
           sessionStorage.setItem('userId', '${userId}');
         });
       </script></body>`
        );
        res.send(modifiedHtml);
    });
});

// 아임포트 웹훅 처리용 엔드포인트
app.post('/iamport-webhook', (req, res) => {
    console.log('아임포트 웹훅 호출됨!', req.body);

    // 여기에 결제 정보 검증/처리 로직 작성
    res.status(200).send('웹훅 OK'); // 아임포트가 성공했다고 인식하려면 반드시 200을 반환해야 함
});

// 사용자 ID 루트 접근
app.get('/:userId', async (req, res) => {
    const userId = req.params.userId;
    if (!validateUserId(userId)) {
        return res.redirect('/?error=invalid_format&attempted_id=' + encodeURIComponent(userId));
    }
    if (!(await checkUserExists(userId))) {
        return res.redirect('/?error=user_not_found&attempted_id=' + encodeURIComponent(userId));
    }
    res.redirect(`/${userId}/credit-shop.html`);
});
// HTTPS 서버 실행
https.createServer(httpsOptions, app).listen(PORT_HTTPS, () => {
    console.log(`HTTPS 서버 실행 중: https://localhost:${PORT_HTTPS}`);
    console.log(`사용자별 크레딧 상점 예시: https://localhost:${PORT_HTTPS}/user_alice_123`);
    console.log(`토큰 테스트용 임시 로그인: https://localhost:${PORT_HTTPS}/test_login.html`);
});
