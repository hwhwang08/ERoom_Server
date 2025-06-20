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

// Firebase 초기화 - 더 안정적인 방법
let admin = null;
let firebaseInitialized = false;
let firebaseError = null;

async function initializeFirebase() {
    try {
        console.log('🚀 Firebase Admin SDK 로드 시작...');

        // 동적으로 Firebase Admin 로드
        admin = await import('firebase-admin').then(module => module.default || module);
        console.log('✅ Firebase Admin SDK 모듈 로드 성공');

        // 이미 초기화된 앱이 있는지 확인
        if (admin.apps && admin.apps.length > 0) {
            console.log('ℹ️ Firebase Admin 앱이 이미 초기화됨');
            firebaseInitialized = true;
            return;
        }

        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            console.log('🔑 FIREBASE_SERVICE_ACCOUNT 환경변수 발견');

            try {
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
                console.log('✅ JSON 파싱 성공');
                console.log('🔍 프로젝트 ID:', serviceAccount.project_id);

                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: "https://eroom-e6659-default-rtdb.asia-southeast1.firebasedatabase.app"
                });

                firebaseInitialized = true;
                console.log('✅ Firebase Admin SDK 초기화 성공 (환경변수)');

            } catch (jsonError) {
                firebaseError = `JSON 파싱 실패: ${jsonError.message}`;
                console.error('❌ JSON 파싱 실패:', jsonError.message);
            }
        } else {
            console.log('⚠️ FIREBASE_SERVICE_ACCOUNT 환경변수가 설정되지 않음');
            firebaseError = 'FIREBASE_SERVICE_ACCOUNT 환경변수 없음';

            // 로컬 개발환경용
            try {
                console.log('📁 로컬 Firebase 서비스 계정 파일 검색 중...');
                const serviceAccount = require('../eroom-e6659-firebase-adminsdk-fbsvc-60b39b555b.json');

                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: "https://eroom-e6659-default-rtdb.asia-southeast1.firebasedatabase.app"
                });

                firebaseInitialized = true;
                console.log('✅ Firebase Admin SDK 초기화 성공 (로컬 파일)');

            } catch (err) {
                console.warn('⚠️ 로컬 Firebase 서비스 계정 파일을 찾을 수 없습니다:', err.message);
                firebaseError = `로컬 파일 로드 실패: ${err.message}`;
            }
        }

    } catch (error) {
        firebaseError = `Firebase 초기화 오류: ${error.message}`;
        console.error('❌ Firebase 초기화 오류:', error.message);
        console.log('💡 Firebase 기능은 비활성화됩니다.');
    }
}

// Firebase 초기화 실행
initializeFirebase().then(() => {
    console.log('🏁 Firebase 초기화 완료');
    console.log('🔥 Firebase 상태:', firebaseInitialized ? '활성화' : '비활성화');
    if (firebaseError) {
        console.log('❌ Firebase 오류:', firebaseError);
    }
});

// 임시 데이터 저장소 (메모리)
const tempDataStore = new Map();

// 임시 토큰 생성 함수
function generateTempToken() {
    return 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function checkUserExists(uid) {
    if (!firebaseInitialized || !admin) {
        console.log('❌ Firebase가 초기화되지 않음');
        return { userExists: false, userdata: [] };
    }

    try {
        console.log('🔍 Firebase에서 사용자 검색:', uid);

        const db = admin.firestore();
        const userdata = await db.collection('user_Datas')
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

// 결제 데이터 저장
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

        const tempToken = generateTempToken();

        tempDataStore.set(tempToken, {
            paymentData,
            userId,
            timestamp: Date.now()
        });

        setTimeout(() => {
            tempDataStore.delete(tempToken);
            console.log('🗑️ 토큰 만료로 삭제:', tempToken);
        }, 5 * 60 * 1000);

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

        if (Date.now() - data.timestamp > 5 * 60 * 1000) {
            tempDataStore.delete(token);
            console.log('⏰ 토큰 만료:', token);
            return res.status(404).json({
                success: false,
                message: '데이터가 만료되었습니다.'
            });
        }

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

// Firebase 설정 라우트 - 실제 환경변수 사용
app.get('/firebase-config', (req, res) => {
    try {
        console.log('🔍 Firebase 환경변수 확인:');
        console.log('API_KEY:', process.env.NEXT_FIREBASE_API_KEY ? '✅' : '❌');
        console.log('AUTH_DOMAIN:', process.env.NEXT_FIREBASE_AUTH_DOMAIN ? '✅' : '❌');
        console.log('PROJECT_ID:', process.env.NEXT_FIREBASE_PROJECT_ID ? '✅' : '❌');

        const config = {
            apiKey: process.env.NEXT_FIREBASE_API_KEY,
            authDomain: process.env.NEXT_FIREBASE_AUTH_DOMAIN,
            databaseURL: "https://eroom-e6659-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: process.env.NEXT_FIREBASE_PROJECT_ID,
            storageBucket: process.env.NEXT_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.NEXT_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.NEXT_FIREBASE_APP_ID,
            measurementId: process.env.NEXT_FIREBASE_MEASUREMENT_ID
        };

        // 필수 설정이 없으면 에러 반환
        if (!config.apiKey || !config.projectId) {
            return res.status(500).json({
                error: 'Firebase 설정이 완전하지 않습니다.',
                message: 'Vercel 환경변수를 확인해주세요.'
            });
        }

        console.log('🎯 Firebase Config 전송:', Object.keys(config));
        res.json(config);

    } catch (error) {
        console.error('❌ Firebase config 오류:', error);
        res.status(500).json({
            error: 'Firebase config 로드 실패',
            message: error.message
        });
    }
});

// 헬스체크
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        firebase: firebaseInitialized ? 'initialized' : 'error',
        firebaseError: firebaseError,
        iamport: !!IMP_API_KEY,
        version: '3.0.0-production',
        tempDataCount: tempDataStore.size
    });
});

// 사용자 UID 저장 및 확인
app.get('/save-uid', async (req, res) => {
    try {
        const { uid } = req.query;

        if (!uid) {
            return res.status(400).json({
                success: false,
                message: 'UID가 필요합니다.'
            });
        }

        console.log('💾 UID 저장 요청:', uid);

        // Firebase에서 사용자 확인
        const userCheck = await checkUserExists(uid);

        if (!userCheck.userExists) {
            console.log('❌ 해당 UID의 유저를 찾을 수 없습니다:', uid);
            return res.status(404).json({
                success: false,
                message: '해당 UID의 유저를 찾을 수 없습니다. Firebase에 등록된 사용자인지 확인해주세요.',
                uid: uid
            });
        }

        console.log('✅ 사용자 확인 완료:', userCheck.userdata[0]?.nickname || 'Unknown');

        const userData = userCheck.userdata[0];
        const redirectScript = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>로그인 처리 중...</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .container {
                    text-align: center;
                    background: white;
                    padding: 40px;
                    border-radius: 20px;
                    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
                }
                .loading {
                    display: inline-block;
                    width: 40px;
                    height: 40px;
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #667eea;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 20px auto;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .success {
                    background: #d4edda;
                    border: 1px solid #c3e6cb;
                    padding: 10px;
                    border-radius: 5px;
                    margin: 10px 0;
                    color: #155724;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🔐 Firebase 인증 완료</h2>
                <div class="success">✅ 사용자 인증 성공: ${userData.nickname}</div>
                <div class="loading"></div>
                <p>크레딧 상점으로 이동 중...</p>
            </div>
            <script>
                console.log('💾 UID 저장:', '${uid}');
                console.log('👤 사용자 정보:', '${userData.nickname}');
                console.log('📧 이메일:', '${userData.email || 'N/A'}');
                
                // sessionStorage에 사용자 정보 저장
                sessionStorage.setItem('userUid', '${uid}');
                sessionStorage.setItem('userNickname', '${userData.nickname}');
                sessionStorage.setItem('userEmail', '${userData.email || ''}');
                
                console.log('✅ sessionStorage 저장 완료');
                
                // 2초 후 크레딧 상점으로 이동
                setTimeout(() => {
                    window.location.href = '/credit-shop.html';
                }, 2000);
            </script>
        </body>
        </html>
        `;

        res.send(redirectScript);

    } catch (error) {
        console.error('❌ save-uid 처리 오류:', error);
        res.status(500).json({
            success: false,
            message: 'Firebase 연결 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 결제 관련 라우트들
app.post('/purchase', async (req, res) => {
    const { uid, creditAmount, timestamp, price } = req.body;
    console.log('크레딧 구매 정보 수신:', { uid, creditAmount, timestamp, price });

    // Firebase에 구매 정보 저장 (옵션)
    if (firebaseInitialized && admin) {
        try {
            const db = admin.firestore();
            await db.collection('purchases').add({
                uid,
                creditAmount: parseInt(creditAmount),
                price: parseInt(price),
                timestamp: new Date(timestamp),
                status: 'pending'
            });
            console.log('✅ Firebase에 구매 정보 저장 완료');
        } catch (error) {
            console.error('❌ Firebase 구매 정보 저장 실패:', error);
        }
    }

    res.json({
        success: true,
        message: 'Firebase에 크레딧 구매 정보가 성공적으로 저장되었습니다',
        data: { uid, creditAmount, timestamp, price }
    });
});

// 나머지 라우트들...
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
    console.log('🔍 사용자 검증:', decodeURIComponent(userId));

    const { orderId, amount, orderName, method, paymentKey, creditAmount } = req.query;

    // Firebase에서 사용자 확인
    const userCheck = await checkUserExists(decodeURIComponent(userId));

    res.json({
        success: true,
        userExists: userCheck.userExists,
        userId: decodeURIComponent(userId),
        message: userCheck.userExists ? 'Firebase에서 사용자 확인 완료' : '사용자를 찾을 수 없음',
        paymentData: { orderId, amount, orderName, method, paymentKey, creditAmount }
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
    const token = req.query.token;
    if (token) {
        const filePath = path.join(__dirname, '../public/success.html');
        return res.sendFile(filePath);
    }

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

// 에러 처리
app.use((err, req, res, next) => {
    console.error('서버 에러:', err);
    res.status(500).json({
        success: false,
        message: '서버 내부 오류가 발생했습니다.',
        error: err.message
    });
});

// 404 처리
app.use((req, res) => {
    console.log('❌ 404 - 찾을 수 없는 경로:', req.path);
    res.status(404).json({
        success: false,
        message: '페이지를 찾을 수 없습니다.',
        path: req.path
    });
});

// Vercel에서는 module.exports로 내보내야 함
module.exports = app;

// 로컬 개발용
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
        console.log(`🔍 헬스체크: http://localhost:${PORT}/health`);
        console.log(`🔥 Firebase: ${firebaseInitialized ? '활성화' : '비활성화'}`);
        console.log(`💳 아임포트: ${IMP_API_KEY ? '설정됨' : '미설정'}`);
    });
}