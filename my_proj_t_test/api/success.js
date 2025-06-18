
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

function parseCookies(req) {
    const list = {};
    const rc = req.headers.cookie;
    rc && rc.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    });
    return list;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        const parsed = querystring.parse(body);
        const cookies = parseCookies(req);
        const nickname = cookies.nickname || 'unknown';
        const paymentData = { ...parsed, nickname };

        const htmlPath = path.join(process.cwd(), 'public', 'success.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        const modifiedHtml = html.replace(
            '</body>',
            `<script>
                window.addEventListener('DOMContentLoaded', () => {
                    const paymentData = ${JSON.stringify(paymentData)};
                    document.getElementById('orderId').textContent = paymentData.orderId || paymentData.merchant_uid || '-';
                    document.getElementById('orderName').textContent = paymentData.orderName || '-';
                    document.getElementById('amount').textContent = paymentData.amount ? Number(paymentData.amount).toLocaleString() + '원' : '-';
                    document.getElementById('method').textContent = paymentData.method || '-';
                    window.paymentData = paymentData;
                });
            </script></body>`
        );

        res.setHeader('Content-Type', 'text/html');
        res.send(modifiedHtml);
    });
};