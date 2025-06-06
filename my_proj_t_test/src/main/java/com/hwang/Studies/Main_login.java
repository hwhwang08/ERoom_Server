package com.hwang.Studies;

import java.util.Scanner;

public class Main_login {

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        Login_java loginService = new Login_java();

        while (true) {
            System.out.println("\n1. 로그인");
            System.out.println("2. 회원가입");
            System.out.println("3. 종료");
            System.out.print("선택: ");
            int choice = sc.nextInt();
            sc.nextLine();  // 버퍼 클리어

            if (choice == 1) {
                System.out.print("아이디: ");
                String username = sc.nextLine();
                System.out.print("비밀번호: ");
                String password = sc.nextLine();

                boolean success = loginService.login(username, password);
                if (success) {
                    System.out.println("로그인 성공!");
                } else {
                    System.out.println("로그인 실패!");
                }
            } else if (choice == 2) {
                System.out.print("새 아이디: ");
                String username = sc.nextLine();
                System.out.print("새 비밀번호: ");
                String password = sc.nextLine();

                loginService.register(username, password);
            } else if (choice == 3) {
                System.out.println("프로그램 종료");
                break;
            } else {
                System.out.println("잘못된 선택");
            }
        }
    }
}
