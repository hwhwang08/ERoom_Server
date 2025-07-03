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
    secret: process.env.SESSION_Key,
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
let db;
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
            db = admin.firestore();
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

// 파베에 결제 내역 저장.
app.post('/verify-and-store-payment', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const nickname = decodeURIComponent(authHeader?.replace('Bearer ', '') || '');

        const uid = req.cookies.uid;
        if (!uid) return res.status(401).json({ success: false, message: '로그인 필요' });
        console.log("파베에 저장전 유저 uid확인", uid)

        const { orderId, amount, orderName, method, paymentKey, creditAmount } = req.body;

        // 🔐 결제 진위 검증 로직도 추가하는 게 좋음 (ex. 아임포트 REST API로 imp_uid 검증)
        const now = new Date();
        const timestamp = now.toISOString().replace(/T/, '_').replace(/:/g, ':').replace(/\..+/, '') + now.getMilliseconds();

        const paymentDocument = {
            userUid: uid,
            userName: nickname,
            orderId,
            amount: parseInt(amount),
            orderName,
            paymentMethod: method,
            paymentKey,
            creditAmount: parseInt(creditAmount),
            paymentStatus: 'completed',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            timestamp: 'payment_' + now.toISOString()
        };

        // 💾 1. 결제 로그 저장
        await admin.firestore().collection('Log').doc('payment_' + timestamp).set(paymentDocument);

        // 💰 2. User 컬렉션에서 해당 유저의 기존 credit을 가져오기
        const userRef = admin.firestore().collection('User').doc(uid);
        const userSnap = await userRef.get();

        let currentCredit = 0;
        if (userSnap.exists) {
            const userData = userSnap.data();
            currentCredit = userData.credits || 0;
            console.log('✅ 현재 유저 크레딧:', currentCredit);
            console.log('💰 새로 산 크레딧:', creditAmount);
        }

        // 새로 결제한 금액(creditAmount)을 기존 크레딧에 더함.
        const newCredit = currentCredit + parseInt(creditAmount);

        console.log('🧮 계산된 크레딧:', currentCredit, '+', creditAmount, '=', newCredit);

        // 🔄 3. 여기가 credits필드 업데이트 하는부분. 파베에 크레딧 값 저장한다!!!
        await userRef.update({ credits: newCredit });

        // 디버기용으로 데이터들 보냄.
        res.json({ success: true, message: '결제 정보 및 크레딧 업데이트 완료',
            savedData: {
                nickname,
                orderId,
                amount,
                orderName,
                method,
                creditAmount,
                newCredit
            }
        });
    } catch (error) {
        console.error('❌ 서버 결제 저장 실패:', error);
        res.status(500).json({ success: false, message: '결제 저장 중 오류' });
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
            if (!res.headersSent) { // ✅ 응답이 아직 안 보냈을 경우만 처리
                console.error('success.html 읽기 오류:', err);
                res.status(500).send('파일 읽기 오류');
            }
        }
    });
});

app.post('/success', (req, res) => {
    res.redirect(`/success?${querystring.stringify(req.body)}`);
});

app.post('/webhook', async (req, res) => {
    const { imp_uid, status, amount } = req.body;

    if (!imp_uid) return res.status(400).send({ success: false, message: 'imp_uid 누락' });
    console.log('✅ 웹훅 요청 수신:', req.body);

    // const body = req.body;

    // 웹훅으로 들어오는것
    // imp_uid: 'imp_025557212534', <<<<<<<<< 이걸로 해야할거같은데
    //   merchant_uid: 'payment-1751461555928',
    //   status: 'cancelled',
    //   cancellation_id: '7NEX9CHCKPYNPXE1XY5G'

    // 파베에 있는것.
    // orderId "payment-1751461555928"
    // orderName
    // "2,000 크레딧"
    // paymentKey "imp_025557212534"
    // paymentStatus "completed"

    try {
        // 1. Log 컬렉션에서 paymentKey가 imp_uid와 일치하는 문서 찾기
        const querySnapshot = await db.collection('Log').where('paymentKey', '==', imp_uid).get();

        if (querySnapshot.empty) {
            console.log('해당 imp_uid에 해당하는 결제 기록이 없습니다.');
            return res.status(404).send({ success: false, message: '결제 기록 없음' });
        }

        // 여러 문서가 있을 수 있으니 하나씩 처리 (보통은 하나임)
        const docs = querySnapshot.docs;
        for (const doc of docs) {
            const paymentData = doc.data();
            console.log("유저 데이터.", doc.data())
            const userUid = paymentData.userUid;  // 유저 식별자
            console.log("유저 userUid.", userUid)


            if (['cancelled', 'refunded'].includes(status.toLowerCase())) {
                // 환불 처리 로직 (예: 상태 업데이트)
                const paymentRef = db.collection('Log').doc(userUid);
                await paymentRef.update({
                    paymentStatus: 'refunded',
                    refundAmount: parseInt(amount) || 0,
                    refundedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                console.log(`환불 처리 완료: ${imp_uid} 사용자: ${userUid}`);
            }
        }

        return res.status(200).send({ success: true, message: '환불 처리 완료' });

        // if (['cancelled', 'refunded'].includes(status.toLowerCase())) {
        //     // 환불 처리
        //     // 보통 환불은 기존 결제 문서를 찾아서 상태 업데이트 또는 새로운 환불 문서 생성
        //     // 여기서는 결제 문서 업데이트 예시 (merchant_uid 기반 문서 찾기 필요)
        //
        //     // console.log("uid확인 ", req.cookies.uid);
        //
        //     // 변경 코드 ====================
        //     // const userUid = custom_data?.uid;
        //     // console.log("uid확인 ", userUid);
        //     //
        //     // if (!userUid) {
        //     //     // uid 없으면 에러 처리
        //     //     console.error('❌ 사용자 UID가 없습니다.');
        //     //     return res.status(400).send({ success: false, message: '사용자 UID 누락' });
        //     // }
        //
        //     const paymentRef = db.collection('Log').doc(userUid);
        //
        //     // =====================
        //
        //     const paymentSnap = await paymentRef.get();
        //
        //     if (paymentSnap.exists) {
        //         await paymentRef.update({
        //             paymentStatus: 'refunded',
        //             refundAmount: parseInt(amount) || 0,
        //             refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        //             timestamp: now.toISOString()
        //         });
        //         console.log('💾 Firestore 환불 상태 업데이트 완료:', merchant_uid);
        //         return res.status(200).send({success: true, message: '환불 처리 완료'});
        //     } else {
        //         // 결제 기록이 없으면 새로 저장할 수도 있음
        //         const refundDoc = {
        //             userUid: custom_data?.uid || '오류',
        //             orderId: merchant_uid || 'unknown',
        //             refundAmount: parseInt(amount) || 0,
        //             paymentStatus: 'refunded',
        //             refundReason: '웹훅 환불 알림',
        //             createdAt: admin.firestore.FieldValue.serverTimestamp(),
        //             timestamp: now.toISOString()
        //         };
        //         await db.collection('Refunds').doc(formattedTimestamp).set(refundDoc);
        //         console.log('💾 Firestore에 새 환불 문서 저장:', refundDoc);
        //         return res.status(200).send({success: true, message: '새 환불 문서 저장 완료'});
        //     }
        // }else {
        //     console.warn('⚠️ 웹훅에서 결제 상태가 paid가 아님:', status);
        //     return res.status(200).send({ success: false, message: '결제 상태가 paid가 아님' });
        // }
    } catch (error) {
        console.error('❌ 환불 처리 중 오류:', error);
        return res.status(500).send({ success: false, message: '서버 오류' });
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