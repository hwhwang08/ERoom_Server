const express = require('express');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');
const https = require('https');
const fs = require('fs');
const session = require('express-session');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();
// const PORT_HTTP = 7999;  // HTTP 포트 (리다이렉트용)
const PORT_HTTPS = 7999; // HTTPS 포트

// HTTPS 인증서 처리
const httpsOptions = {
    key: fs.readFileSync(path.resolve(__dirname, '../../../mylocal.dev+4-key.pem')),
    cert: fs.readFileSync(path.resolve(__dirname, '../../../mylocal.dev+4.pem')),
};

// Firebase Admin 초기화. 경로는 .env에 넣고 불러오는 걸 추천
const serviceAccountPath = process.env.FIREBASE_CREDENTIAL_PATH || '../../../src/main/resources/eroom-e6659-firebase-adminsdk-fbsvc-60b39b555b.json';
const serviceAccount = require(path.resolve(serviceAccountPath));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://eroom-e6659-default-rtdb.asia-southeast1.firebasedatabase.app"
});

// 파이어베이스 db에 연결. 데이터스토어
const db = admin.firestore();

// 미들웨어? 중간다리역할이랬던가.
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 로깅 미들웨어
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.use(session({
    secret: process.env.SESSION_Key,  // 꼭 바꿔주세요
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true }   // HTTPS 환경이면 true로 변경
}));


// Firebase에서 유저 존재 여부 확인 함수
async function checkUserExists(uid) {
    try {
        // 파이어베이스 user_Datas 콜렉션 기반으로 uid일치를 확인하는 코드.
        const userdata = await db.collection('user_Datas')
            .where("uid", "==", uid)
            .get();

        const userDataArray = userdata.docs.map(doc => doc.data());

        return {
            userExists: !userdata.empty,
            userdata: userdata.docs.map(doc => doc.data()) // 배열로 파싱
        };
    } catch (error) {
        console.error('파베 유저 확인 오류:', error);
        return { userExists: false, userdata: [] };
    }
}

// API 엔드포인트들
// 사용자 검증 및 결제 정보 확인
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

// 크레딧 구매 정보 처리
app.post('/purchase', (req, res) => {
    const { uid, creditAmount, timestamp, price } = req.body;
    console.log('크레딧 구매 정보 수신:', { uid, creditAmount, timestamp, price });
    res.json({ success: true, message: '크레딧 구매 정보가 성공적으로 처리되었습니다', data: { uid, creditAmount, timestamp, price } });
});

// 인덱스에서 유저 id확인 그거.
function validateUserId(userId) {return true;}

// 보안문제로 개인키 env에 넣음
const IMP_API_KEY = process.env.IMP_KEY;
const IMP_API_SECRET = process.env.IMP_SECRET;

// 아임포트 토큰 발급
async function getToken() {
    const response = await axios.post('https://api.iamport.kr/users/getToken', {
        imp_key: IMP_API_KEY,
        imp_secret: IMP_API_SECRET,
    });
    if (response.data.code === 0) {
        return response.data.response.access_token;
    }
    throw new Error('아임포트 토큰 발급 실패');
}

app.get('/payment-complete', async (req, res) => {
    const { imp_uid, merchant_uid } = req.query;

    if (!imp_uid || !merchant_uid) {
        return res.status(400).send('잘못된 요청입니다. (imp_uid 또는 merchant_uid 없음)');
    }

    try {
        const verified = await verifyPayment(imp_uid); // 아까 만든 결제 검증 함수 사용
        if (verified) {
            // 성공 페이지 보여주기
            res.redirect(`/success?imp_uid=${imp_uid}&merchant_uid=${merchant_uid}`);
        } else {
            // 실패 페이지 보여주기
            res.redirect(`/fail.html?imp_uid=${imp_uid}&merchant_uid=${merchant_uid}`);
        }
    } catch (err) {
        console.error('결제 검증 중 오류 발생:', err);
        res.status(500).send('서버 오류가 발생했습니다.');
    }
});

// 외부 api요청?
const axios = require('axios');
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

    // 토스 결제시 필요. 토스는 2단계 인증이라
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

// /public/credit-shop.html로 해야하는걸 그냥 /credit-shop.html로 해도 바로 연결되게 해주는것
app.use(express.static(path.join(__dirname, 'public')));

// firebase-config.js 연결. 보안땜에 따로 뺌
app.get('/firebase-config.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'firebase-config.js'));
});

// 기본 루트 크레딧샵
app.get('/', async (req, res) => {
    // res.sendFile(path.join(__dirname, 'public', 'credit-shop.html'));
    // req.params는 URL 경로에 /save-uid/:user_id 같이 Path Parameter를 사용할 때 쓰는 거.
    // ?uid=xxx처럼 쿼리스트링으로 보낸 건 req.query를 써야함
    // userId는 /:userId로 들어오는 그것. decodeURIComponent는 한글닉 처리
    const uid = req.session.uid;
    if (!uid) return res.sendFile(path.join(__dirname, 'public', 'login.html'));

    const result = await checkUserExists(uid);
    // encodeURIComponent할시 %ed%dj%어쩌구로 나오는것.
    // const userid = encodeURIComponent(result.userdata[0]?.nickname || 'unknown');
    // 닉네임 꺼내기 (userdatas 배열에서 첫 번째 닉네임, 없으면 'unknown')
    const nickname = result.userdata[0]?.nickname || 'unknown';
    req.session.nickname = nickname;
    console.log('접속 완. 닉네임:', nickname);

    // 화면을 띄우는것.
    const htmlPath = path.join(__dirname, 'public', 'credit-shop.html');
    fs.readFile(htmlPath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('파일 읽기 오류');

        const modifiedHtml = data.replace(
            '</body>',
            `<script>
        // userid가 인코딩된 상태라서 디코딩 필요. 유니티로 할떄 한글 안깨지게 하는것.
          const nickname = '${nickname}';
          const uid = '${uid}';
          sessionStorage.setItem('userId', nickname);
          sessionStorage.setItem('userUid', uid);
          const userIdElement = document.getElementById('user-id');
          if (userIdElement) userIdElement.textContent = nickname;
          </script></body>`
        );
        res.send(modifiedHtml);
    });
});

// Firebase ID 토큰 검증 - 기존 '/' → '/verify-token' 으로 변경 !!! 혜주님과 연동하는 코드
app.get('/verify-token', async (req, res) => {
    console.log("유니티 토큰 연결!!")

    // req.headers는 요청에 포함된 http 헤더 담은 객체.
    // 파이어베이스 id토큰이 Authorization: Bearer <토큰>형태로 담긴다. 이건 토큰 가져오는 코드. 없을시 if문 실행
    const authHeader = req.headers['authorization'];
    console.log("받은 Authorization 헤더 확인:", authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Authorization 헤더가 없습니다.' });

    const idToken = authHeader.split('Bearer ')[1].trim();

    try {
        // 토큰 인증이 벌어지는 코드.
        // admin.auth().verifyIdToken(idToken) 유효한 토큰인지 확인.
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        // 유효할시 고유 uid 반환
        const uid = decodedToken.uid;
        console.log("토큰 검증 완: ", uid)

        // !!! loginHistory콜렉션조회해서 해당 uid기록 있는지 확인. 추후 userData는 내가 만든 임시 콜렉션
        const result = await checkUserExists(uid);
        console.log(result.userdata);    // 배열 형태로 사용자 데이터

        // const nickname = result.userdata;
        // [0]?.nickname || "unknown"은 한글 닉 안깨지게 하는용
        const nickname = result.userdata[0]?.nickname || "unknown";

        // 유니티로 보내는 제이슨
        return res.json({
            success: true,
            uid,
            nickname,
            message: '토큰 검증 성공했습니다!!',
            redirectUrl: `https://192.168.0.170:7999/save-uid?uid=${uid}`
        });
    } catch (error) {
        console.error('토큰 검증 실패:', error);
        return res.status(401).json({ success: false, message: '유효하지 않은 토큰임.' });
    }
});

// 유니티에서 보낸 토큰 받는 코드.
app.get('/save-uid', async (req, res) => {
    const uid = req.query.uid;
    console.log("받은 UID!! ", uid);

    try {
        const result = await checkUserExists(uid);
        console.log("유저 존재 여부:", result.userExists);
        console.log("유저 데이터:", result.userdata);    // 배열 형태로 사용자 데이터

        // 필요에 따라 조건 분기도 가능
        if (result.userExists) {
            req.session.uid = uid;  // 세션에 uid 저장
            return res.redirect('/');
        } else res.status(404).send('해당 UID의 유저를 찾을 수 없습니다.');
    } catch (error) {
        console.error("오류 발생:", error);
        res.status(500).send('서버 오류 발생');
    }
});

app.get('/login', async (req, res) => {
    console.log('로그인 이동');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 결제 성공창 처리. 검증 끝난 결제 정보를 success 페이지로 넘김
app.post('/success', async (req, res) => {
    const nickname = req.session.nickname || 'unknown';
    console.log("서세스 유저 아이디", nickname);

    const paymentData = { ...req.body, nickname };

    const filePath = path.join(__dirname, 'public', 'success.html');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('파일을 읽을 수 없습니다.');

        const modifiedHtml = data.replace(
            '</body>',
            `<script>
    window.addEventListener('DOMContentLoaded', () => {
      const paymentData = ${JSON.stringify(paymentData)};
      // 주문 번호
      document.getElementById('orderId').textContent = paymentData.orderId || paymentData.merchant_uid || '-';
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

// 아임포트 웹훅 처리용 엔드포인트
app.post('/iamport-webhook', (req, res) => {
    console.log('아임포트 웹훅 호출됨!', req.body);

    // 여기에 결제 정보 검증/처리 로직 작성
    res.status(200).send('웹훅 OK'); // 아임포트가 성공했다고 인식하려면 반드시 200을 반환해야 함
});

// HTTPS 서버 실행
// https.createServer(httpsOptions, app).listen(PORT_HTTPS, () => {
// '0.0.0.0'은 모든 네트워크 인터페이스에서(ip)접근 허용한단뜻. 위의 방식대로는 유니티랑 연동이 안된다는데..
https.createServer(httpsOptions, app).listen(PORT_HTTPS, '0.0.0.0', () => {
    console.log(`HTTPS 서버 실행 중: https://localhost:${PORT_HTTPS}`);
    console.log(`토큰 테스트용 임시 로그인: https://localhost:${PORT_HTTPS}/test_login.html`);
});
