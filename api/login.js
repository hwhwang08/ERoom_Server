const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const htmlPath = path.join(process.cwd(), 'public', 'login.html');

        // 파일이 존재하는지 확인
        if (!fs.existsSync(htmlPath)) {
            console.error('login.html 파일을 찾을 수 없습니다:', htmlPath);
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Login</title>
                    <meta charset="utf-8">
                </head>
                <body>
                    <h1>로그인 페이지</h1>
                    <p>login.html 파일을 찾을 수 없습니다.</p>
                    <p>파일 경로: ${htmlPath}</p>
                </body>
                </html>
            `);
        }

        const html = fs.readFileSync(htmlPath, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        console.error('로그인 페이지 로드 오류:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error</title>
                <meta charset="utf-8">
            </head>
            <body>
                <h1>서버 오류</h1>
                <p>로그인 페이지를 로드할 수 없습니다.</p>
                <p>오류: ${error.message}</p>
            </body>
            </html>
        `);
    }
};