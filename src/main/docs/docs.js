const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;

// 미들웨어 설정
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));  // public 폴더에 HTML 파일 두기

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/docs.html');
});

// 데이터 저장 예시 (메모리)
let dataStore = [];

// GET 요청 처리
app.get('/api/data', (req, res) => {
    res.json(dataStore);
});

// POST 요청 처리
app.post('/api/data', (req, res) => {
    const newData = req.body;
    dataStore.push(newData);
    res.json({ message: 'Data received', data: newData });
});

// 서버 실행
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
