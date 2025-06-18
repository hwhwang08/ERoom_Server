module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const jsonData = JSON.parse(body);
            console.log('아임포트 웹훅 호출됨!', jsonData);

            // 여기서 실제 웹훅 처리 로직 추가

            res.status(200).json({ success: true, message: '웹훅 처리 완료' });
        } catch (e) {
            console.error('웹훅 JSON 파싱 오류:', e);
            res.status(400).json({ success: false, message: 'Invalid JSON' });
        }
    });
};