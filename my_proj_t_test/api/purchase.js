
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            const { uid, creditAmount, timestamp, price } = data;

            console.log('크레딧 구매 정보 수신:', { uid, creditAmount, timestamp, price });

            res.status(200).json({
                success: true,
                message: '크레딧 구매 정보가 성공적으로 처리되었습니다',
                data: { uid, creditAmount, timestamp, price }
            });
        } catch (err) {
            res.status(400).json({
                success: false,
                message: '잘못된 JSON 데이터입니다.'
            });
        }
    });
};