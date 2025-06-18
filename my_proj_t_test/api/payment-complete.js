const axios = require('axios');

async function getToken() {
    const response = await axios.post('https://api.iamport.kr/users/getToken', {
        imp_key: process.env.IMP_KEY,
        imp_secret: process.env.IMP_SECRET,
    });
    if (response.data.code === 0) return response.data.response.access_token;
    throw new Error('아임포트 토큰 발급 실패');
}

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

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const { imp_uid, merchant_uid } = req.query;

    if (!imp_uid || !merchant_uid) {
        return res.status(400).json({ success: false, message: '잘못된 요청입니다.' });
    }

    try {
        const verified = await verifyPayment(imp_uid);
        const redirectUrl = verified
            ? `/api/success?imp_uid=${imp_uid}&merchant_uid=${merchant_uid}`
            : `/fail.html?imp_uid=${imp_uid}&merchant_uid=${merchant_uid}`;

        res.redirect(302, redirectUrl);
    } catch (err) {
        console.error('결제 검증 오류:', err);
        res.status(500).json({ success: false, message: '서버 오류 발생' });
    }
}