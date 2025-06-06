// const express = require('express');
// const admin = require('firebase-admin');
// const app = express();
// const cors = require('cors');
// console.log('토큰 테스트 창');
//
// app.use(cors());
// app.use(express.json()); // JSON 파싱
//
// // Firebase Admin 초기화
// admin.initializeApp({
//     credential: admin.credential.cert(require('../../../src/main/resources/eroom-e6659-firebase-adminsdk-fbsvc-60b39b555b.json')) // Firebase 서비스 계정 키
// });
//
// // 토큰 검증 라우트
// app.post('/verify-token', async (req, res) => {
//     const authHeader = req.headers.authorization;
//
//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//         return res.status(401).json({ success: false, message: '토큰이 제공되지 않았습니다.' });
//     }
//
//     const idToken = authHeader.split('Bearer ')[1];
//
//     // !!!!!!!!!! verifyIdToken 이게 검증하는거
//     try {
//         const decodedToken = await admin.auth().verifyIdToken(idToken); // 검증!
//         const uid = decodedToken.uid;
//         return res.json({ success: true, uid });
//     } catch (error) {
//         return res.status(401).json({ success: false, message: '유효하지 않은 토큰입니다.' });
//     }
// });
//
// // 서버 시작
// app.listen(7999, () => {
//     console.log('토큰 검증 서버 실행 중 (http://localhost:7999)');
// });
