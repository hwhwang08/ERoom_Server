// api/save-uid.js
import { checkUserExists } from '../src/main/docs/server.js'; // 확장자 필수일 수 있음

export default async function handler(req, res) {
    const { uid } = req.query;
    console.log("받은 UID!! ", uid);

    try {
        const result = await checkUserExists(uid);
        console.log("유저 존재 여부:", result.userExists);

        if (result.userExists) {
            // 세션은 Vercel에서 기본 미지원, 클라이언트에 저장하거나 JWT로 대체
            return res.redirect('/');
        } else {
            return res.status(404).send('해당 UID의 유저를 찾을 수 없습니다.');
        }
    } catch (error) {
        console.error("오류 발생:", error);
        return res.status(500).send('서버 오류 발생');
    }
}
