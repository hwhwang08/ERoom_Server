package com.hwang.Studies;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

import static java.lang.Integer.parseInt;

public class Gson_cal {
    public static void main(String[] args) throws IOException {
        int num1, num2, num3 = 0;
        BufferedReader bf = new BufferedReader(new InputStreamReader(System.in));
        Gson gson = new Gson();
        JsonObject jo = new JsonObject();
        JsonArray ja = new JsonArray();
        for(;;) {
            System.out.println("숫자를 입력해주세요");
            num1 = parseInt(bf.readLine());
            System.out.println("무슨 계산을 하실건가요? 기호를 넣으세요.(+,-,*,/)");
            String etc = bf.readLine();
            System.out.println("숫자를 입력해주세요");
            num2 = parseInt(bf.readLine());
            switch(etc) {
                case("+"):
                    num3 = num1 + num2;
                    System.out.printf("%d + %d = %d", num1, num2, num3);
                break;
                case("-"):
                    num3 = num1 - num2;
                    System.out.printf("%d - %d = %d", num1, num2, num3);
                break;
                case("*"):
                    num3 = num1 * num2;
                    System.out.printf("%d + %d = %d", num1, num2, num3);
                break;
                case("/"):
                    num3 = num1 / num2;
                    System.out.printf("%d + %d = %d", num1, num2, num3);
                break;
                default:
                    System.out.println("잘못된 입력입니다.");
                break;
            }
            if(num1 == -333) break;
            // Gson 추가
            jo.addProperty("값1", num1);
            jo.addProperty("기호", etc);
            jo.addProperty("값2", num2);
            jo.addProperty("결과값", num3);
            ja.add(jo);
            String save = gson.toJson(ja);
            System.out.println("\njson 저장값\n" + save);
        }
            bf.close();
    }
}
