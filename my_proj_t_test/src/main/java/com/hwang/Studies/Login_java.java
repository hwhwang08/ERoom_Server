package com.hwang.Studies;

import java.util.ArrayList;
import java.util.List;

public class Login_java {
    private List<TestDTO> userList;

    public Login_java() {
        userList = new ArrayList<>();
        // 예시 사용자 추가 (테스트용)
//        userList.add(new TestDTO("test1", "pass1"));
        TestDTO user = new TestDTO();
        user.setUser("test1", "pass1");
        userList.add(user);
    }

    public boolean login(String username, String password) {
        for (TestDTO user : userList) {
            if (user.getId().equals(username) && user.getPw().equals(password)) {
                return true; // 로그인 성공
            }
        }
        return false; // 로그인 실패
    }

    public void register(String username, String password) {
        TestDTO user = new TestDTO();
        user.setUser(username, password);  // void 메소드 호출
        userList.add(user);                // 리스트에 객체 추가
        System.out.println("사용자 등록 완료");
    }
}