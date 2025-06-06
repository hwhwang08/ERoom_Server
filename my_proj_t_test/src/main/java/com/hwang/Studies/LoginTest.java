package com.hwang.Studies;

import com.google.api.core.ApiFuture;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;

import java.io.FileInputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.Scanner;

public class LoginTest {
    public static void main(String[] args) throws Exception {
        // 설정> 서비스 계정> 새키 생성으로 json 파일 다운> 리소스로 옮겨서 경로 설정
        FileInputStream serviceAccount = new FileInputStream("src/main/resources/test-eac1c-a3a71f03f53f.json");

        FirebaseOptions options = new FirebaseOptions.Builder()
                .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                .setDatabaseUrl("https://test-eac1c-default-rtdb.asia-southeast1.firebasedatabase.app/")
                .build();
        // 내 프로젝트 리얼타임 그거 url

        FirebaseApp.initializeApp(options);
        System.out.println("파베 연결");

        Scanner sc = new Scanner(System.in);
        System.out.println("회원가입 메일 입력: ");
        String email = sc.nextLine();
        System.out.println("회원가입 비번 입력:  ");
        String password = sc.nextLine();

        // 사용자 생성 (회원가입)
        UserRecord user = createUser(email, password);
        System.out.println("회원가입 성공! UID: " + user.getUid());

        // Database에 uid 기반으로 데이터 저장
        saveData(user.getUid(), email, password);
    }

    private static UserRecord createUser(String email, String password) throws Exception {
        FirebaseAuth auth = FirebaseAuth.getInstance();
        UserRecord.CreateRequest request = new UserRecord.CreateRequest()
                .setEmail(email)
                .setPassword(password);
        try {
            return auth.createUser(request);
        } catch (FirebaseAuthException e) {
            if (e.getAuthErrorCode() == AuthErrorCode.EMAIL_ALREADY_EXISTS) {
                System.out.println("이미 가입된 이메일입니다. 로그인 시도 또는 다른 이메일을 사용하세요.");
                return auth.getUserByEmail(email);  // 기존 유저 정보 반환 (선택)
            } else {
                throw e;  // 다른 오류는 다시 던짐
            }
        }
    }

    public static void saveData(String uid, String email, String pw) throws Exception {
        DatabaseReference ref = FirebaseDatabase.getInstance().getReference("LoginDatas");

        // 임의의 key로 데이터 저장 (혹은 이메일 해시 등으로 key 설정)
//        String key = ref.push().getKey();
        // email로 하면 @때문에 오류 뜸. 특수문자.
        String key = "userUID_" + uid;

        Map<String, Object> data = new HashMap<>();
        data.put("uid", uid);
        data.put("email", email);
        data.put("password", pw);

        ApiFuture<Void> future = ref.child(key).setValueAsync(data);
        future.get();  // 저장될 때까지 대기. 이거 안넣으면 저장 되기 전에 꺼버려서 저장 안된다.
        System.out.println("로그인 시도 데이터 저장 완료");
    }
}
