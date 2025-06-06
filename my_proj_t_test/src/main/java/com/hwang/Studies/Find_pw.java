package com.hwang.Studies;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.database.*;

import java.io.FileInputStream;
import java.util.Scanner;

public class Find_pw {
    public static void main(String[] args) throws Exception {
        // Firebase 초기화
        FileInputStream serviceAccount = new FileInputStream("src/main/resources/test-eac1c-a3a71f03f53f.json");
        FirebaseOptions options = new FirebaseOptions.Builder()
                .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                .setDatabaseUrl("https://test-eac1c-default-rtdb.asia-southeast1.firebasedatabase.app/")
                .build();
        FirebaseApp.initializeApp(options);

        // 사용자 입력 받기
        Scanner sc = new Scanner(System.in);
        System.out.println("아이디(이메일) 입력: ");
        String email = sc.nextLine();

        // 비밀번호 가져오기
        DatabaseReference ref = FirebaseDatabase.getInstance().getReference("LoginDatas");
        Query query = ref.orderByChild("email").equalTo(email);
        query.addListenerForSingleValueEvent(new ValueEventListener() {
            @Override
            public void onDataChange(DataSnapshot snapshot) {
                if (snapshot.exists()) {
                    for (DataSnapshot userSnapshot : snapshot.getChildren()) {
                        String password = userSnapshot.child("password").getValue(String.class);
                        System.out.println("비밀번호: " + password);
                    }
//                    String password = snapshot.child("password").getValue(String.class);
//                    System.out.println("비밀번호: " + password);
                } else {
                    System.out.println("해당 사용자가 없습니다.");
                }
            }

            @Override
            public void onCancelled(DatabaseError error) {
                System.err.println("DB 오류: " + error.getMessage());
            }
        });
        Thread.sleep(3000);
    }
}
