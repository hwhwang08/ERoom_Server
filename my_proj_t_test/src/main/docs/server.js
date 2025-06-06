
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin'); // Firebase Admin SDK 추가

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();
const PORT = 7999;


// Firebase Admin 초기화
const serviceAccount = require('../../../src/main/resources/eroom-e6659-firebase-adminsdk-fbsvc-60b39b555b.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://eroom-e6659-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.firestore();

// 로깅 미들웨어 추가
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// 미들웨어 설정
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 파이어베이스에서 유저 존재 여부 확인하는 함수
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

// ===========================================
// API 엔드포인트들을 먼저 정의 (중요!)
// ===========================================

// GET 방식 사용자 검증 엔드포인트 추가 (기존 POST 엔드포인트 바로 다음에 추가)
app.get('/verify-user-and-payment', async (req, res) => {
    try {
        console.log('=== GET /verify-user-and-payment 엔드포인트 호출됨 ===');
        
        // Authorization 헤더에서 User ID 추출
        const authHeader = req.headers['authorization'];
        
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                userExists: false,
                message: 'Authorization 헤더가 필요합니다'
            });
        }
        
        // "Bearer user_alice_123" 형식에서 userId 추출
        const userId = authHeader.replace('Bearer ', '').trim();
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                userExists: false,
                message: '유효하지 않은 Authorization 헤더 형식입니다'
            });
        }
        
        console.log(`Authorization 헤더에서 받은 사용자 ID: ${userId}`);
        
        // Firebase에서 유저 존재 여부 확인
        const userExists = await checkUserExists(userId);
        
        // Query Parameters에서 결제 데이터 추출
        const { orderId, amount, orderName, method, paymentKey, creditAmount } = req.query;
        
        console.log('받은 결제 데이터:', { orderId, amount, orderName, method, paymentKey, creditAmount });
        
        // 응답에 유저 존재 여부와 결제 데이터 처리 결과 포함
        if (userExists) {
            console.log(`유효한 사용자 - 결제 데이터 처리: ${userId}`);
            
            res.json({
                success: true,
                userExists: true,
                userId: userId,
                message: '사용자 검증 및 결제 데이터 처리 완료',
                paymentData: {
                    orderId,
                    amount,
                    orderName,
                    method,
                    paymentKey,
                    creditAmount
                }
            });
        } else {
            console.log(`존재하지 않는 사용자: ${userId}`);
            
            res.status(404).json({
                success: false,
                userExists: false,
                message: '존재하지 않는 사용자입니다'
            });
        }
        
    } catch (error) {
        console.error('사용자 검증 오류:', error);
        res.status(500).json({
            success: false,
            userExists: false,
            message: '서버 오류: ' + (error.message || '알 수 없는 오류')
        });
    }
});

// 크레딧 구매 정보 처리 엔드포인트
app.post('/purchase', (req, res) => {
    const {uid, creditAmount, timestamp, price} = req.body;

    console.log('크레딧 구매 정보 수신:', {
        uid,
        creditAmount,
        timestamp,
        price
    });

    res.json({
        success: true,
        message: '크레딧 구매 정보가 성공적으로 처리되었습니다',
        data: { uid, creditAmount, timestamp, price }
    });
});

// 결제 완료 API
app.post('/payments/complete', async (req, res) => {
    try {
        const { imp_uid, merchant_uid } = req.body;

        if (!imp_uid) {
            return res.status(400).json({
                success: false,
                message: 'imp_uid가 필요합니다'
            });
        }

        // 결제 정보 검증
        const paymentData = await verifyPayment(imp_uid);

        // 결제 상태에 따른 처리
        if (paymentData.status === 'paid') {
            console.log(`결제 완료: 주문번호 ${merchant_uid}, 금액 ${paymentData.amount}원`);

            res.json({
                success: true,
                message: '결제가 성공적으로 처리되었습니다',
                payment: paymentData
            });
        } else {
            console.warn(`결제 상태 비정상: ${paymentData.status}`);
            res.json({
                success: false,
                message: `결제 상태가 유효하지 않습니다: ${paymentData.status}`
            });
        }
    } catch (error) {
        console.error('결제 처리 오류:', error);
        res.status(500).json({
            success: false,
            message: '서버 오류: ' + (error.message || '알 수 없는 오류')
        });
    }
});

// ===========================================
// 정적 파일 및 HTML 라우팅
// ===========================================

// 정적 파일 서빙 (현재 폴더 기준으로 public 폴더)
app.use(express.static(path.join(__dirname, 'public')));

// firebase-config.js 파일을 직접 서빙
app.get('/firebase-config.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'firebase-config.js'));
});

// 기본 루트 - index.html로 이동
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 사용자별 크레딧 상점 페이지 (Firebase 검증 추가)
app.get('/:userId/credit-shop.html', async (req, res) => {
    const userId = req.params.userId;

    console.log(`크레딧 상점 접근 시도 - userId: ${userId}`);

    // 사용자 ID 유효성 검사
    const uidRegex = /^[a-zA-Z0-9_-]{4,20}$/;

    if (!uidRegex.test(userId)) {
        console.log(`유효하지 않은 사용자 ID: ${userId}`);
        return res.redirect('/?error=invalid_format&attempted_id=' + encodeURIComponent(userId));
    }

    // Firebase에서 유저 존재 여부 확인
    const userExists = await checkUserExists(userId);

    if (!userExists) {
        console.log(`Firebase에 존재하지 않는 사용자 ID: ${userId}`);
        return res.redirect('/?error=user_not_found&attempted_id=' + encodeURIComponent(userId));
    }

    // 파일 경로 확인 및 수정
    const fs = require('fs');
    const filePath = path.join(__dirname, 'public', 'credit-shop.html');

    console.log(`파일 경로: ${filePath}`);

    // 파일 존재 여부 확인
    if (!fs.existsSync(filePath)) {
        console.error(`파일이 존재하지 않습니다: ${filePath}`);
        return res.status(404).send('credit-shop.html 파일을 찾을 수 없습니다.');
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('파일 읽기 오류:', err);
            res.status(500).send('파일을 읽을 수 없습니다.');
            return;
        }

        console.log(`파일 읽기 성공 - 사용자 ID: ${userId}`);

        // HTML에 사용자 ID를 자동으로 설정하는 스크립트 추가
        const modifiedHtml = data.replace(
            '</body>',
            `<script>
                // URL에서 사용자 ID 자동 설정
                window.addEventListener('DOMContentLoaded', function() {
                    const userId = '${userId}';
                    sessionStorage.setItem('userId', userId);
                    
                    // 사용자 ID 표시 요소가 있다면 업데이트
                    const userIdElement = document.getElementById('user-id');
                    if (userIdElement) {
                        userIdElement.textContent = userId;
                    }
                    
                    console.log('사용자 ID 자동 설정:', userId);
                });
            </script>
            </body>`
        );

        res.send(modifiedHtml);
    });
});

// success 페이지 POST 요청 처리 (HTTP Body로 데이터 수신)
app.post('/:userId/success.html', async (req, res) => {
    const userId = req.params.userId;
    
    console.log(`POST 방식으로 success 페이지 접근 - userId: ${userId}`);
    console.log('전달받은 결제 데이터:', req.body);
    
    // 사용자 ID 유효성 검사
    const uidRegex = /^[a-zA-Z0-9_-]{4,20}$/;
    if (!uidRegex.test(userId)) {
        return res.redirect('/?error=invalid_format&attempted_id=' + encodeURIComponent(userId));
    }
    
    // Firebase에서 유저 존재 여부 확인
    const userExists = await checkUserExists(userId);
    if (!userExists) {
        console.log(`Firebase에 존재하지 않는 사용자 ID: ${userId}`);
        return res.redirect('/?error=user_not_found&attempted_id=' + encodeURIComponent(userId));
    }
    
    // success.html 파일 읽기
    const fs = require('fs');
    const filePath = path.join(__dirname, 'public', 'success.html');
    
    if (!fs.existsSync(filePath)) {
        console.error(`success.html 파일이 존재하지 않습니다: ${filePath}`);
        return res.status(404).send('success.html 파일을 찾을 수 없습니다.');
    }
    
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('파일 읽기 오류:', err);
            res.status(500).send('파일을 찾을 수 없습니다.');
            return;
        }
        
        // 전달받은 데이터에 userId 추가
        const paymentDataWithUserId = {
            ...req.body,
            userId: userId
        };
        
        // HTML에 결제 데이터를 자동으로 설정하는 스크립트 추가
        const modifiedHtml = data.replace(
            '</body>',
            `<script>
                // HTTP POST로 받은 데이터 설정
                window.addEventListener('DOMContentLoaded', function() {
                    const paymentData = ${JSON.stringify(paymentDataWithUserId)};
                    
                    console.log('서버에서 주입된 결제 데이터:', paymentData);
                    
                    // 데이터 표시
                    document.getElementById('userId').textContent = paymentData.userId || '-';
                    document.getElementById('orderId').textContent = paymentData.orderId || '-';
                    document.getElementById('orderName').textContent = paymentData.orderName || '-';
                    document.getElementById('amount').textContent = paymentData.amount ? 
                        Number(paymentData.amount).toLocaleString() + '원' : '-';
                    document.getElementById('method').textContent = paymentData.method || '-';
                    
                    // 뒤로가기 링크 설정
                    const backLink = document.getElementById('back-to-shop');
                    if (backLink) {
                        backLink.setAttribute('href', '/' + paymentData.userId + '/credit-shop.html');
                    }
                    
                    // 전역 변수에 데이터 저장 (다른 함수에서 사용할 수 있도록)
                    window.paymentData = paymentData;
                    
                    // 결제 확인 및 구매 정보 전송
                    if (paymentData.paymentKey && paymentData.orderId && paymentData.amount) {
                        confirmPayment(paymentData.paymentKey, paymentData.orderId, paymentData.amount);
                    }
                    
                    if (paymentData.userId && paymentData.amount && paymentData.creditAmount) {
                        sendPurchaseInfo(paymentData.userId, paymentData.creditAmount, paymentData.amount);
                    }
                });
            </script>
            </body>`
        );
        
        res.send(modifiedHtml);
    });
});

// 사용자별 결제 성공 페이지 (Firebase 검증 추가)
app.get('/:userId/success.html', async (req, res) => {
    const userId = req.params.userId;

    // 사용자 ID 유효성 검사
    const uidRegex = /^[a-zA-Z0-9_-]{4,20}$/;

    if (!uidRegex.test(userId)) {
        return res.redirect('/?error=invalid_format&attempted_id=' + encodeURIComponent(userId));
    }

    // Firebase에서 유저 존재 여부 확인
    const userExists = await checkUserExists(userId);

    if (!userExists) {
        console.log(`Firebase에 존재하지 않는 사용자 ID: ${userId}`);
        return res.redirect('/?error=user_not_found&attempted_id=' + encodeURIComponent(userId));
    }

    // success.html 파일 확인
    const fs = require('fs');
    const filePath = path.join(__dirname, 'public', 'success.html');

    if (!fs.existsSync(filePath)) {
        console.error(`success.html 파일이 존재하지 않습니다: ${filePath}`);
        return res.status(404).send('success.html 파일을 찾을 수 없습니다.');
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('파일 읽기 오류:', err);
            res.status(500).send('파일을 찾을 수 없습니다.');
            return;
        }

        // HTML에 사용자 ID를 자동으로 설정하는 스크립트 추가
        const modifiedHtml = data.replace(
            '</body>',
            `<script>
                // URL에서 사용자 ID 자동 설정
                window.addEventListener('DOMContentLoaded', function() {
                    const userId = '${userId}';
                    sessionStorage.setItem('userId', userId);
                    
                    console.log('결제 성공 페이지 - 사용자 ID 자동 설정:', userId);
                });
            </script>
            </body>`
        );

        res.send(modifiedHtml);
    });
});

// 일반적인 라우트는 가장 마지막에 정의
app.get('/:userId', async (req, res) => {
    const userId = req.params.userId;

    console.log(`사용자 ID 접근 - userId: ${userId}`);

    // 사용자 ID 유효성 검사 (4-20자의 영문, 숫자, 하이픈, 언더스코어)
    const uidRegex = /^[a-zA-Z0-9_-]{4,20}$/;

    if (!uidRegex.test(userId)) {
        // 유효하지 않은 ID인 경우 메인 페이지로 리다이렉트
        return res.redirect('/?error=invalid_format&attempted_id=' + encodeURIComponent(userId));
    }

    // Firebase에서 유저 존재 여부 확인
    try {
        const userExists = await checkUserExists(userId);

        if (userExists) {
            // 사용자가 존재하는 경우 크레딧 상점으로 리다이렉트
            console.log('Firebase에서 사용자 ID 확인 완료:', userId);
            res.redirect(`/${userId}/credit-shop.html`);
        } else {
            // 사용자가 존재하지 않는 경우 index로 리다이렉트
            console.log('존재하지 않는 사용자 ID:', userId);
            res.redirect(`/?error=user_not_found&attempted_id=${encodeURIComponent(userId)}`);
        }
    } catch (error) {
        console.error('Firebase 사용자 확인 오류:', error);
        // 오류 발생 시 index로 리다이렉트
        res.redirect(`/?error=verification_failed&attempted_id=${encodeURIComponent(userId)}`);
    }
});

// ===========================================
// 아임포트 관련 함수들
// ===========================================

// 아임포트 API 키
const IMP_KEY = process.env.IMP_KEY;
const IMP_SECRET = process.env.IMP_SECRET;


// 아임포트 액세스 토큰 가져오기
async function getAccessToken() {
    try {
        const { data } = await axios.post('https://api.iamport.kr/users/getToken', {
            imp_key: IMP_KEY,
            imp_secret: IMP_SECRET,
        });
        return data.response.access_token;
    } catch (error) {
        console.error('아임포트 토큰 발급 오류:', error.message);
        throw new Error('토큰 발급 실패');
    }
}

// 결제 검증 함수
async function verifyPayment(imp_uid) {
    try {
        const token = await getAccessToken();
        const { data } = await axios.get(`https://api.iamport.kr/payments/${imp_uid}`, {
            headers: { Authorization: token },
        });
        return data.response;
    } catch (error) {
        console.error('결제 정보 조회 오류:', error.message);
        throw error;
    }
}

// 토큰 검증 테스트용
app.post('/verify-token', async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: '토큰이 제공되지 않았습니다.' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;
        return res.json({ success: true, uid });
    } catch (error) {
        return res.status(401).json({ success: false, message: '유효하지 않은 토큰입니다.' });
    }
});


// 서버 시작
app.listen(PORT, () => {
    console.log(`메인 페이지: http://localhost:${PORT}`);
    console.log(`사용자별 크레딧 상점 예시: http://localhost:${PORT}/user_alice_123`);
    console.log(`토큰 테스트용 임시 로그인: http://localhost:${PORT}/test_login.html`);
});