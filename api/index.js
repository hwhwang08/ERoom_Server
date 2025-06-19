const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const querystring = require('querystring');
const axios = require('axios');
require('dotenv').config();

const app = express();

// 미들웨어 설정
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Cookie'],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// 환경 변수
const IMP_API_KEY = process.env.IMP_KEY;
const IMP_API_SECRET = process.env.IMP_SECRET;

console.log('🚀 서버 시작 중...');
console.log('📦 Express 로드 완료');
console.log('🔑 아임포트 키 확인:', IMP_API_KEY ? '✅' : '❌');

// Firebase 초기화 부분 수정
let admin = null;
let firebaseInitialized = false;

try {
    admin = require('firebase-admin');
    
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        console.log('🔑 Firebase 환경변수 찾음!');
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: "https://eroom-e6659-default-rtdb.asia-southeast1.firebasedatabase.app"
            });
            firebaseInitialized = true;
            console.log('✅ Firebase Admin SDK 초기화 성공 (환경변수)');
        }
    } else {
        // 로컬 개발환경용 - JSON 파일 사용
        try {
            const serviceAccount = require('../eroom-e6659-firebase-adminsdk-fbsvc-60b39b555b.json');
            
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: "https://eroom-e6659-default-rtdb.asia-southeast1.firebasedatabase.app"
                });
                firebaseInitialized = true;
                console.log('✅ Firebase Admin SDK 초기화 성공 (로컬 파일)');
            }
        } catch (err) {
            console.warn('⚠️ 로컬 Firebase 서비스 계정 파일을 찾을 수 없습니다:', err.message);
        }
    }
} catch (error) {
    console.error('❌ Firebase 초기화 오류:', error.message);
    console.log('💡 Firebase 기능은 비활성화됩니다.');
}

// 임시 사용자 확인 함수 (Firebase 없이)
async function checkUserExists(uid) {
    if (!firebaseInitialized) {
        console.log('📝 Firebase 비활성화 - 임시 사용자 생성');
        return {
            userExists: true,
            userdata: [{
                nickname: `TestUser_${uid.substring(0, 6)}`,
                uid: uid
            }]
        };
    }

    try {
        console.log('🔍 Firebase에서 사용자 검색:', uid);
        const userdata = await admin.firestore().collection('user_Datas')
            .where("uid", "==", uid)
            .get();

        if (userdata.empty) {
            console.log('❌ Firebase에서 사용자를 찾을 수 없음:', uid);
            return { userExists: false, userdata: [] };
        }

        const userData = userdata.docs[0].data();
        console.log('✅ Firebase에서 사용자 찾음:', userData.nickname);
        
        return {
            userExists: true,
            userdata: [userData]
        };
    } catch (error) {
        console.error('❌ Firebase 유저 확인 오류:', error);
        return { userExists: false, userdata: [] };
    }
}

// 아임포트 관련 함수들
async function getToken() {
    if (!IMP_API_KEY || !IMP_API_SECRET) {
        throw new Error('아임포트 API 키가 설정되지 않음');
    }

    const response = await axios.post('https://api.iamport.kr/users/getToken', {
        imp_key: IMP_API_KEY,
        imp_secret: IMP_API_SECRET,
    });
    if (response.data.code === 0) return response.data.response.access_token;
    throw new Error('아임포트 토큰 발급 실패');
}

async function verifyPayment(imp_uid) {
    try {
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
    } catch (error) {
        console.error('결제 검증 오류:', error);
        return false;
    }
}

function validateUserId(userId) { return true; }

// 헬스체크 라우트
app.get('/health', (req, res) => {
    console.log('🔍 Firebase 초기화 상태:', firebaseInitialized);
    console.log('🔍 환경변수 존재 여부:', !!process.env.FIREBASE_SERVICE_ACCOUNT);

    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        firebase: firebaseInitialized ? 'initialized' : 'disabled',
        firebaseEnvExists: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        iamport: !!IMP_API_KEY,
        version: '2.1.0-debug'
    });

});

// 기본 라우트들
app.get('/verify-token', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Authorization 헤더가 없습니다.'
        });
    }

    // Firebase 비활성화 상태에서는 임시 응답
    if (!firebaseInitialized) {
        const testUid = 'test_' + Date.now();
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const baseUrl = `${protocol}://${host}`;

        return res.json({
            success: true,
            uid: testUid,
            message: '토큰 검증 성공 (테스트 모드)',
            redirectUrl: `${baseUrl}/save-uid?uid=${testUid}`
        });
    }

    // Firebase 활성화 시 실제 토큰 검증
    const idToken = authHeader.split('Bearer ')[1].trim();
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;
        const result = await checkUserExists(uid);

        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const baseUrl = `${protocol}://${host}`;

        res.json({
            success: true,
            uid,
            message: '토큰 검증 성공했습니다!!',
            redirectUrl: `${baseUrl}/save-uid?uid=${uid}`
        });
    } catch (err) {
        console.error('토큰 검증 오류:', err);
        res.status(401).json({
            success: false,
            message: '유효하지 않은 토큰임.'
        });
    }
});

app.get('/verify-user-and-payment', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({
            success: false,
            userExists: false,
            message: 'Authorization 헤더가 필요합니다'
        });
    }

    const userId = authHeader.replace('Bearer ', '').trim();

    if (!userId || !validateUserId(userId)) {
        return res.status(401).json({
            success: false,
            userExists: false,
            message: '유효하지 않은 Authorization 헤더 형식입니다'
        });
    }

    const { orderId, amount, orderName, method, paymentKey, creditAmount } = req.query;

    res.json({
        success: true,
        userExists: true,
        userId,
        message: '사용자 검증 및 결제 데이터 처리 완료',
        paymentData: { orderId, amount, orderName, method, paymentKey, creditAmount }
    });
});

app.post('/purchase', (req, res) => {
    const { uid, creditAmount, timestamp, price } = req.body;
    console.log('크레딧 구매 정보 수신:', { uid, creditAmount, timestamp, price });

    res.json({
        success: true,
        message: '크레딧 구매 정보가 성공적으로 처리되었습니다',
        data: { uid, creditAmount, timestamp, price }
    });
});

app.get('/payment-complete', async (req, res) => {
    const { imp_uid, merchant_uid } = req.query;

    if (!imp_uid || !merchant_uid) {
        return res.status(400).send('잘못된 요청입니다.');
    }

    try {
        const verified = await verifyPayment(imp_uid);
        const redirectUrl = verified
            ? `/success?imp_uid=${imp_uid}&merchant_uid=${merchant_uid}`
            : `/fail.html?imp_uid=${imp_uid}&merchant_uid=${merchant_uid}`;
        res.redirect(redirectUrl);
    } catch (err) {
        console.error('결제 검증 오류:', err);
        res.status(500).send('서버 오류 발생');
    }
});

app.get('/save-uid', async (req, res) => {
    const uidParam = req.query.uid;

    if (!uidParam) {
        return res.status(400).send('UID가 필요합니다.');
    }

    const result = await checkUserExists(uidParam);

    if (result.userExists) {
        res.cookie('uid', uidParam, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });
        res.redirect('/');
    } else {
        res.status(404).send('해당 UID의 유저를 찾을 수 없습니다.');
    }
});

app.get('/login', (req, res) => {
    const filePath = path.join(__dirname, '../public/login.html');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('login.html 파일 오류:', err);
            res.status(500).send('로그인 페이지를 찾을 수 없습니다.');
        }
    });
});

app.get('/', async (req, res) => {
    const uid = req.cookies?.uid;

    if (!uid) {
        return res.sendFile(path.join(__dirname, '../public/login.html'));
    }

    const result = await checkUserExists(uid);
    if (!result.userExists) {
        return res.sendFile(path.join(__dirname, '../public/login.html'));
    }

    const nickname = result.userdata[0]?.nickname || 'unknown';

    const fs = require('fs');
    const htmlPath = path.join(__dirname, '../public/credit-shop.html');

    fs.readFile(htmlPath, 'utf8', (err, data) => {
        if (err) {
            console.error('파일 읽기 오류:', err);
            return res.status(500).send('파일 오류');
        }

        const modifiedHtml = data.replace(
            '</body>',
            `<script>
                const nickname = '${nickname.replace(/'/g, "\\'")}';
                const uid = '${uid.replace(/'/g, "\\'")}';
                sessionStorage.setItem('userId', nickname);
                sessionStorage.setItem('userUid', uid);
                const userIdElement = document.getElementById('user-id');
                if (userIdElement) userIdElement.textContent = nickname;
            </script></body>`
        );

        res.send(modifiedHtml);
    });
});

app.get('/success', (req, res) => {
    const nickname = req.cookies?.nickname || 'unknown';
    const { imp_uid, merchant_uid, orderId, amount, orderName, method } = req.query;

    const paymentData = {
        imp_uid,
        merchant_uid,
        orderId: orderId || merchant_uid,
        amount,
        orderName,
        method,
        nickname
    };

    const fs = require('fs');
    const filePath = path.join(__dirname, '../public/success.html');

    fs.readFile(filePath, 'utf8', (err, html) => {
        if (err) {
            console.error('success.html 읽기 오류:', err);
            return res.status(500).send('파일 읽기 오류');
        }

        const modifiedHtml = html.replace(
            '</body>',
            `<script>
                window.addEventListener('DOMContentLoaded', () => {
                    const paymentData = ${JSON.stringify(paymentData)};
                    document.getElementById('orderId').textContent = paymentData.orderId || '-';
                    document.getElementById('orderName').textContent = paymentData.orderName || '-';
                    document.getElementById('amount').textContent = paymentData.amount ? Number(paymentData.amount).toLocaleString() + '원' : '-';
                    document.getElementById('method').textContent = paymentData.method || '-';
                    window.paymentData = paymentData;
                });
            </script></body>`
        );
        res.send(modifiedHtml);
    });
});

app.post('/success', (req, res) => {
    res.redirect(`/success?${querystring.stringify(req.body)}`);
});

app.post('/iamport-webhook', (req, res) => {
    console.log('아임포트 웹훅 호출됨!', req.body);
    res.send('웹훅 OK');
});

// 404 처리
app.use((req, res) => {
    res.status(404).send('페이지를 찾을 수 없습니다.');
});

// 에러 처리
app.use((err, req, res, next) => {
    console.error('서버 에러:', err);
    res.status(500).send('서버 내부 오류가 발생했습니다.');
});

// Vercel에서는 module.exports로 내보내야 함
module.exports = app;

// 로컬 개발용
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
        console.log(`🔍 헬스체크: http://localhost:${PORT}/health`);
        console.log(`🔥 Firebase: ${firebaseInitialized ? '활성화' : '비활성화 (테스트 모드)'}`);
        console.log(`💳 아임포트: ${IMP_API_KEY ? '설정됨' : '미설정'}`);
    });
}