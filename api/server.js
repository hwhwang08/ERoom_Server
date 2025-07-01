const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const querystring = require('querystring');
const axios = require('axios');
const app = express();
const fs = require('fs');
// env파일불러오는 코드.
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// 미들웨어 설정
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Cookie'],
    credentials: true
}));

// 로컬시 필요
// app.use('/img', express.static(path.join(__dirname, '../img')));


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
let admin = require('firebase-admin');
let firebaseInitialized = false;

try {
    // !!! 로컬로 할거면 if주석처리
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        console.log('🔑 Firebase 환경변수 찾음!');
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        // \\n을 \n줄바꿈으로 바꾸는코드.
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

        // 로컬환경
        // const serviceAccount = require('../eroom.json');

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: "https://eroom-e6659-default-rtdb.asia-southeast1.firebasedatabase.app"
            });
            firebaseInitialized = true;
            console.log('✅ Firebase Admin SDK 초기화 성공 (환경변수)');
        }
    }
} catch (error) {
    console.error('❌ Firebase 초기화 오류:', error.message);
    console.log('💡 Firebase 기능은 비활성화됩니다.');
}

// 임시 데이터 저장소 (메모리) - 맨 위로 이동
const tempDataStore = new Map();

// 임시 토큰 생성 함수
function generateTempToken() {
    return 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 아임포트 관련 함수들
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

// ✅ 중요! 토큰 관련 라우트들을 맨 위로 이동
app.post('/store-payment-data', (req, res) => {
    try {
        console.log('💾 결제 데이터 저장 요청:', req.body);

        const { paymentData, userId } = req.body;

        if (!paymentData || !userId) {
            return res.status(400).json({
                success: false,
                message: '필수 데이터가 누락되었습니다.'
            });
        }

        // 임시 토큰 생성
        const tempToken = generateTempToken();

        // 데이터를 임시 저장 (5분 후 자동 삭제)
        tempDataStore.set(tempToken, {
            paymentData,
            userId,
            timestamp: Date.now()
        });

        // 5분 후 데이터 삭제
        setTimeout(() => {
            tempDataStore.delete(tempToken);
            console.log('🗑️ 토큰 만료로 삭제:', tempToken);
        }, 5 * 60 * 1000); // 5분

        console.log('✅ 결제 데이터 임시 저장 완료:', tempToken);

        res.json({
            success: true,
            tempToken: tempToken,
            redirectUrl: `/success?token=${tempToken}`
        });

    } catch (error) {
        console.error('❌ 데이터 저장 실패:', error);
        res.status(500).json({
            success: false,
            message: '데이터 저장 실패',
            error: error.message
        });
    }
});

app.get('/get-payment-data/:token', (req, res) => {
    try {
        const { token } = req.params;
        console.log('🔍 토큰으로 데이터 조회:', token);

        const data = tempDataStore.get(token);

        if (!data) {
            console.log('❌ 토큰에 해당하는 데이터 없음:', token);
            return res.status(404).json({
                success: false,
                message: '데이터를 찾을 수 없거나 만료되었습니다.'
            });
        }

        // 5분 경과 확인
        if (Date.now() - data.timestamp > 5 * 60 * 1000) {
            tempDataStore.delete(token);
            console.log('⏰ 토큰 만료:', token);
            return res.status(404).json({
                success: false,
                message: '데이터가 만료되었습니다.'
            });
        }

        // 한 번 조회 후 삭제 (보안)
        tempDataStore.delete(token);
        console.log('✅ 데이터 조회 성공, 토큰 삭제:', token);

        res.json({
            success: true,
            paymentData: data.paymentData,
            userId: data.userId
        });

    } catch (error) {
        console.error('❌ 데이터 조회 실패:', error);
        res.status(500).json({
            success: false,
            message: '데이터 조회 실패',
            error: error.message
        });
    }
});

// Firebase 설정 라우트
app.get('/firebase-config', (req, res) => {
    try {
        console.log('🔍 Firebase 환경변수 디버그:');
        console.log('API_KEY:', process.env.NEXT_FIREBASE_API_KEY ? '✅ 존재' : '❌ 없음');
        console.log('AUTH_DOMAIN:', process.env.NEXT_FIREBASE_AUTH_DOMAIN ? '✅ 존재' : '❌ 없음');
        console.log('PROJECT_ID:', process.env.NEXT_FIREBASE_PROJECT_ID ? '✅ 존재' : '❌ 없음');

        const config = {
            // service: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)|| "ㅇ안돼",
            apiKey: process.env.NEXT_FIREBASE_API_KEY || "dummy-api-key",
            authDomain: process.env.NEXT_FIREBASE_AUTH_DOMAIN || "dummy-auth-domain",
            databaseURL: "https://eroom-e6659-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: process.env.NEXT_FIREBASE_PROJECT_ID || "dummy-project-id",
            storageBucket: process.env.NEXT_FIREBASE_STORAGE_BUCKET || "dummy-storage-bucket",
            messagingSenderId: process.env.NEXT_FIREBASE_MESSAGING_SENDER_ID || "dummy-sender-id",
            appId: process.env.NEXT_FIREBASE_APP_ID || "dummy-app-id",
            measurementId: process.env.NEXT_FIREBASE_MEASUREMENT_ID || "dummy-measurement-id"
        };
        console.log('🎯 Firebase Config 전송:', Object.keys(config));
        res.setHeader('Content-Type', 'application/json');
        res.json(config);
    } catch (error) {
        console.error('❌ Firebase config 오류:', error);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({
            error: 'Firebase config 로드 실패',
            message: error.message
        });
    }
});

// 헬스체크 라우트. 디버깅용이니 지워도 무관
app.get('/health', (req, res) => {
    console.log('🔍 Firebase 초기화 상태:', firebaseInitialized);
    // console.log('🔍 환경변수 존재 여부:', !!process.env.FIREBASE_SERVICE_ACCOUNT);

    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        firebase: firebaseInitialized ? 'initialized' : 'disabled',
        // firebaseEnvExists: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        iamport: !!IMP_API_KEY,
        version: '2.1.0-debug',
        tempDataCount: tempDataStore.size
    });
});

const tempTokens = new Map(); // 임시로 uid 저장
// 기본 라우트들
app.get('/verify-token', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Authorization 헤더 읎음.'
        });
    }

    const idToken = authHeader.split('Bearer ')[1].trim();

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // ✅ accessToken 발급
        const accessToken = Math.random().toString(36).substring(2);
        tempTokens.set(accessToken, {
            uid,
            expiresAt: Date.now() + 1000 * 60 * 3 // 3분 유효
        });

        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const baseUrl = `${protocol}://${host}`;

        res.json({
            success: true,
            uid,
            message: '서버에서 응답!! 토큰 검증 성공!!',
            redirectUrl: `${baseUrl}/save-uid?token=${accessToken}`
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

    const nickname = authHeader.replace('Bearer ', '').trim();
    console.log('🔍 사용자 검증:', decodeURIComponent(nickname));

    if (!nickname) {
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
        nickname: decodeURIComponent(nickname),
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

    if (!imp_uid || !merchant_uid) return res.status(400).send('잘못된 요청입니다.');

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

app.get('/login', (req, res) => {
    const filePath = path.join(__dirname, '../public/login.html');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('login.html 파일 오류:', err);
            res.status(500).send('로그인 페이지를 찾을 수 없습니다.');
        }
    });
});

app.get('/save-uid', (req, res) => {
    const token = req.query.token;
    const tokenInfo = tempTokens.get(token);

    if (!tokenInfo) return res.status(401).send('유효하지 않은 토큰');

    if (Date.now() > tokenInfo.expiresAt) {
        tempTokens.delete(token);
        return res.status(401).send('토큰 만료');
    }

    const uid = tokenInfo.uid;

    // ✅ 토큰은 한번 쓰고 제거 (보안 위해)
    tempTokens.delete(token);

    // ✅ 사용자 정보를 세션 또는 쿠키로 저장
    res.cookie('uid', uid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 30 // 30분 유효
    });

    // ✅ 실제 크레딧샵 페이지로 리다이렉트
    res.redirect('/credit-shop');
});


app.get('/credit-shop', async (req, res) => {
    const uid = req.cookies.uid;
    if (!uid) return res.status(401).send('로그인 정보 없음');

    try {
        const userRecord = await admin.auth().getUser(uid);
        console.log('✅ 로그인한 사용자 이메일:', userRecord.email);

        const email = userRecord.email;

        console.log(`✅ 로그인한 사용자: UID = ${uid}, EMAIL = ${email}`);

        const filePath = path.join(__dirname, '../public/credit-shop.html');
        res.sendFile(filePath, (err) => {
            if (err) {
                console.error('login.html 파일 오류:', err);
                res.status(500).send('로그인 페이지를 찾을 수 없습니다.');
            }
        });
    }catch (err) {
        console.error('사용자 정보를 가져오는 중 오류:', err);
        return res.status(500).send('사용자 정보 조회 실패');
    }
});

// 크샵 uid값 띄우는 코드.
app.get('/user-info', async (req, res) => {
    const uid = req.cookies.uid;
    if (!uid) return res.status(401).json({ error: '로그인 필요' });

    try {
        const userRecord = await admin.auth().getUser(uid);
        const email = userRecord.email;
        return res.json({ uid, email });
    } catch (err) {
        console.error('사용자 정보 조회 실패:', err);
        return res.status(500).json({ error: '사용자 정보 조회 실패' });
    }
});

app.get('/', async (req, res) => {
    const filePath = path.join(__dirname, '../public/login.html');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('login.html 파일 오류:', err);
            res.status(500).send('로그인 페이지를 찾을 수 없습니다.');
        }
    });
});

app.get('/success', (req, res) => {
    const filePath = path.join(__dirname, '../public/success.html');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('success.html 읽기 오류:', err);
            return res.status(500).send('파일 읽기 오류');
        }
    });
});

app.post('/success', (req, res) => {
    res.redirect(`/success?${querystring.stringify(req.body)}`);
});

app.post('/iamport-webhook', (req, res) => {
    console.log('아임포트 웹훅 호출됨!', req.body);
    res.send('웹훅 OK');
});

// 에러 처리
app.use((err, req, res, next) => {
    console.error('서버 에러:', err);
    res.status(500).json({
        success: false,
        message: '서버 내부 오류가 발생했습니다.',
        error: err.message
    });
});

// 404 처리 - 맨 마지막에 위치
app.use((req, res) => {
    console.log('❌ 404 - 찾을 수 없는 경로:', req.path);
    res.status(404).json({
        success: false,
        message: '페이지를 찾을 수 없습니다.',
        path: req.path
    });
});


console.log(`🔥 Firebase: ${firebaseInitialized ? '활성화' : '비활성화 (테스트 모드)'}`);
console.log(`💳 아임포트: ${IMP_API_KEY ? '설정됨' : '미설정'}`);

// Vercel에서는 module.exports로 내보내야 함
module.exports = app;

// // 로컬테스트용 https
// const https = require('https');
//
// const options = {
//     key: fs.readFileSync(path.resolve(__dirname, '../mylocal.dev+4-key.pem')),
//     cert: fs.readFileSync(path.resolve(__dirname, '../mylocal.dev+4.pem'))
// };

// || 7999와 https는 로컬 개발용
if (require.main === module) {
    const PORT = process.env.PORT || 7999;
    // https.createServer(options, app).listen(PORT, () => {
    app.listen(PORT, () => {
        console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
        console.log(`✅ 서버 실행 중: http://localhost:${PORT}/login`);
        console.log(`🔍 헬스체크: http://localhost:${PORT}/health`);
    });
}