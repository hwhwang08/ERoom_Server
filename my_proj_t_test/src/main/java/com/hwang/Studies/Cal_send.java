package com.hwang.Studies;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class Cal_send {
    public static void main(String[] args) throws Exception {
        JsonArray ja = new JsonArray();
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        while(true) {
            System.out.print("계산기 이용: 1, 지금까지 계산 기록 확인: 2 ");
            String temp = br.readLine();
            if (temp.equals("1")) {
                for (;;) {
                    System.out.print("계산할 숫자를 입력하세요 : ");
                    String temp2 = br.readLine();
                    if (temp2.equals("exit")) {
                        System.out.println("계산기 종료\n");
                        break;
                    }
                    int num1 = Integer.parseInt(temp2);
                    System.out.print("계산할 기호를 입력하세요. : ");
                    String etc = br.readLine();
                    System.out.print("계산할 숫자를 입력하세요. : ");
                    int num2 = Integer.parseInt(br.readLine());
                    int re = 0;
                    switch (etc) {
                        case ("+"): re = num1 + num2; break;
                        case ("-"): re = num1 - num2; break;
                        case ("*"): re = num1 * num2; break;
                        case ("/"): re = num1 / num2; break;
                    }
                    JsonObject jo = new JsonObject();
                    jo.addProperty("num1", num1);
                    jo.addProperty("sign", etc);
                    jo.addProperty("num2", num2);
                    jo.addProperty("re", re);
                    ja.add(jo);
                    sendtoServer(jo, ja);
                    System.out.println("결과: "+ re);
                }
            } else if (temp.equals("2")) {
                System.out.println("지금까지의 계산 기록\n" + ja);
            } else if(temp.equals("exit")) {
                System.out.println("진짜 끝");
                break;
            }
        }
    }

    public static void sendtoServer(JsonObject jo, JsonArray ja) throws Exception {
        // 전송용 JSON 객체로 포장
        JsonObject sendJson = new JsonObject();
        sendJson.add("jarray", ja);
        sendJson.add("jo", jo);

        // 서버 연결
        URL url = new URL("http://localhost:7999/cal");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();

        // Post설정
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        // 뒤에 보낼 데이터 타입이 json이라고 명시하는것.
        conn.setRequestProperty("Content-Type", "application/json");

        OutputStream os = conn.getOutputStream();
        byte[] input = sendJson.toString().getBytes(StandardCharsets.UTF_8);
        os.write(input);
    }
}
