const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const querystring = require('querystring');
const axios = require('axios');
const app = express();
const fs = require('fs');
const session = require('express-session');
// env파일불러오는 코드.
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// 미들웨어 설정
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Cookie'],
    credentials: true
}));

app.use(session({
    secret: 'your-secret-key', // 원하는 시크릿 키 문자열 추후 수정할것.
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 30 // 30분
    }
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

// 아임포트 토큰 발급 함수 추가
async function getToken() {
    try {
        const { data } = await axios.post('https://api.iamport.kr/users/getToken', {
            imp_key: IMP_API_KEY,
            imp_secret: IMP_API_SECRET
        });

        if (data.code === 0) {
            return data.response.access_token;
        } else {
            throw new Error('토큰 발급 실패');
        }
    } catch (error) {
        console.error('아임포트 토큰 발급 오류:', error);
        throw error;
    }
}

// 기존 verifyPayment 함수 수정
async function verifyPayment(imp_uid) {
    try {
        const token = await getToken();
        const { data } = await axios.get(`https://api.iamport.kr/payments/${imp_uid}`, {
            headers: { Authorization: `Bearer ${token}` } // Bearer 추가
        });

        if (data.code === 0 && data.response.status === 'paid') {
            console.log("!!결제 성공!")
            return data.response; // 전체 결제 정보 반환
        } else {
            console.log("!!결제 실패!")
            return false;
        }
    } catch (error) {
        console.error('결제 검증 오류:', error);
        return false;
    }
}
// 환불 처리 함수
async function processRefund(imp_uid, reason = '사용자 요청') {
    try {
        const token = await getToken();

        // 먼저 결제 정보 조회
        const paymentInfo = await verifyPayment(imp_uid);
        if (!paymentInfo) throw new Error('결제 정보를 찾을 수 없습니다');

        // 환불 요청
        const { data } = await axios.post('https://api.iamport.kr/payments/cancel', {
            imp_uid: imp_uid,
            reason: reason,
            amount: paymentInfo.amount, // 전체 금액 환불
            checksum: paymentInfo.amount // 검증용
        }, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (data.code === 0) {
            console.log('✅ 환불 처리 성공:', data.response);
            return data.response;
        } else throw new Error(`환불 실패: ${data.message}`);
    } catch (error) {
        console.error('환불 처리 오류:', error);
        throw error;
    }
}
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
    const credit = req.query.credit;

    console.log("들어온 크레딧값 확인용", credit);

    if (!tokenInfo) return res.status(401).send('유효하지 않은 토큰');

    if (Date.now() > tokenInfo.expiresAt) {
        tempTokens.delete(token);
        return res.status(401).send('토큰 만료');
    }

    const uid = tokenInfo.uid;
    // ✅ 토큰은 한번 쓰고 제거 (보안 위해)
    tempTokens.delete(token);

    // ✅ uid 쿠키로 저장
    res.cookie('uid', uid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 30 // 30분 유효
    });

    // ✅ credit 세션에 저장
    if (credit) req.session.selectedCredit = credit;

    // ✅ 실제 크레딧샵 페이지로 리다이렉트
    res.redirect('/');
});

app.get('/', async (req, res) => {
    const uid = req.cookies.uid;
    if (!uid) return res.redirect('/login');

    try {
        const userRecord = await admin.auth().getUser(uid);
        console.log('✅ 로그인한 사용자 이메일:', userRecord.email);

        const selectedCredit = req.session.selectedCredit || null;
        const email = userRecord.email;

        console.log(`✅ 로그인한 사용자: UID = ${uid}, EMAIL = ${email}`);

        const filePath = path.join(__dirname, '../public/credit-shop.html');
        // 한번 쓴 세션은 지우기
        delete req.session.selectedCredit;

        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.error('credit-shop.html 파일 오류:', err);
                res.status(500).send('로그인 페이지를 찾을 수 없습니다.');
            }

            const injected = data.replace(
                '</head>',
                `<script>window.selectedCredit = "${selectedCredit}";</script></head>`
            );
            res.send(injected);
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

// 안쓰이긴할텐데 혹여나 넣음
app.get('/credit-shop', async (req, res) => {
    const filePath = path.join(__dirname, '../public/credit-shop.html');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('크레딧샵 파일 오류:', err);
            res.status(500).send('크레딧샵을 찾을 수 없습니다.');
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

app.post('/iamport-webhook', async (req, res) => {
    const body = req.body;

    console.log('아임포트 웹훅 호출됨!', body);
    console.log('🔔 아임포트 웹훅 수신:', JSON.stringify(body, null, 2));

    try {
        // 웹훅 응답 우선 처리 (타임아웃 방지)
        res.status(200).send('OK');

        const { imp_uid, merchant_uid, status, custom_data } = body;

        // 결제 완료 시 처리
        if (status === 'paid') {
            console.log('💳 결제 완료 웹훅');

            // Firebase에 결제 정보 저장
            const paymentData = {
                imp_uid,
                merchant_uid,
                status: 'completed',
                paymentStatus: 'completed',
                paidAt: new Date().toISOString(),
                amount: body.amount,
                custom_data: JSON.stringify({ uid: currentUserUid })
            };

            // custom_data에서 uid 추출
            let uid = null;
            if (custom_data) {
                const parsedCustomData = typeof custom_data === 'string' ?
                    JSON.parse(custom_data) : custom_data;
                uid = parsedCustomData?.uid;
            }

            if (uid) {
                await admin.database()
                    .ref(`user_Payment/${uid}/${merchant_uid}`)
                    .set(paymentData);
                console.log(`✅ 결제 데이터 저장 완료: ${uid}/${merchant_uid}`);
            }
        }

        // 결제 취소/환불 시 처리
        else if (status === 'cancelled') {
            console.log('🔄 환불 처리 웹훅');

            const {
                cancel_amount,
                cancelled_at,
                reason,
                buyer_name
            } = body;

            const refundData = {
                paymentStatus: 'refunded',
                refundAmount: cancel_amount,
                refundReason: reason || '사용자 요청',
                refundedAt: new Date(cancelled_at * 1000).toISOString(),
                status: 'refunded'
            };

            // custom_data에서 uid 추출
            let uid = null;
            if (custom_data) {
                const parsedCustomData = typeof custom_data === 'string' ?
                    JSON.parse(custom_data) : custom_data;
                uid = parsedCustomData?.uid;
            }

            if (!uid) {
                console.error('❌ uid가 없어서 환불 처리 불가');
                return;
            }

            // Firebase 업데이트
            await admin.database()
                .ref(`user_Payment/${uid}/${merchant_uid}`)
                .update(refundData);

            console.log(`✅ 환불 데이터 업데이트 완료: ${uid}/${merchant_uid}`);

            // 필요하다면 사용자 크레딧도 차감
            // await deductUserCredit(uid, creditAmount);
        }

        else {
            console.log(`ℹ️ 기타 상태 웹훅: ${status}`);
        }

    } catch (error) {
        console.error('❌ 웹훅 처리 중 오류:', error);
    }
});

// 환불 처리 API 엔드포인트 추가
app.post('/refund', async (req, res) => {
    const { imp_uid, merchant_uid, uid, reason } = req.body;

    console.log('환불 요청 받음:', { imp_uid, merchant_uid, uid, reason });

    if (!imp_uid || !merchant_uid || !uid) {
        return res.status(400).json({
            success: false,
            message: '필수 파라미터가 누락되었습니다 (imp_uid, merchant_uid, uid 필요)'
        });
    }

    try {
        // 1. 아임포트 환불 처리
        const refundResult = await processRefund(imp_uid, reason || '사용자 요청');
        console.log('✅ 아임포트 환불 완료:', refundResult);

        // 2. Firestore에서 paymentStatus 업데이트
        if (firebaseInitialized && admin.firestore) {
            const db = admin.firestore();
            const paymentRef = db.collection('user_Payment').doc(uid).collection('payments').doc(merchant_uid);

            await paymentRef.update({
                paymentStatus: 'refund',
                refundDate: admin.firestore.FieldValue.serverTimestamp(),
                refundReason: reason || '사용자 요청',
                refundAmount: refundResult.amount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log('✅ Firestore paymentStatus 업데이트 완료: refund');
        }

        res.json({
            success: true,
            message: '환불이 성공적으로 처리되었습니다',
            data: {
                imp_uid,
                merchant_uid,
                refundAmount: refundResult.amount,
                refundDate: refundResult.cancelled_at,
                paymentStatus: 'refund'
            }
        });

    } catch (error) {
        console.error('❌ 환불 처리 중 오류:', error);
        res.status(500).json({
            success: false,
            message: '환불 처리 중 오류가 발생했습니다',
            error: error.message
        });
    }
});

// 특정 사용자의 결제 내역 조회 API (환불 상태 확인용)
app.get('/payment-history/:uid', async (req, res) => {
    const { uid } = req.params;

    if (!uid) {
        return res.status(400).json({
            success: false,
            message: 'UID가 필요합니다'
        });
    }

    try {
        if (firebaseInitialized && admin.firestore) {
            const db = admin.firestore();
            const paymentsRef = db.collection('user_Payment').doc(uid).collection('payments');
            const snapshot = await paymentsRef.orderBy('createdAt', 'desc').get();

            const payments = [];
            snapshot.forEach(doc => {
                payments.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            res.json({
                success: true,
                data: payments
            });
        } else {
            res.status(503).json({
                success: false,
                message: 'Firebase가 초기화되지 않았습니다'
            });
        }
    } catch (error) {
        console.error('❌ 결제 내역 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '결제 내역 조회 중 오류가 발생했습니다',
            error: error.message
        });
    }
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

// 로컬테스트용 https
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