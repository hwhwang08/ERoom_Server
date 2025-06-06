package com.hwang.Studies;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

public class Cal_server {
    public static void main(String[] args) throws Exception {
        // 서버 생성
        HttpServer server = HttpServer.create(new InetSocketAddress(7999), 0);
        server.createContext("/cal", new CalHandler());
        server.setExecutor(null);
        System.out.println("서버 시작됨: http://localhost:7999/cal");
        server.start();
    }

    private static class CalHandler implements HttpHandler {
        @Override
        // Https가 아니라 Http다. 헷갈리지 말것. HttpExchange = 요청과 응답 다루는 객체.
        public void handle(HttpExchange exch) throws IOException {
            // getRequestMethod메소드를 문자열로 가져오기
            if("POST".equals(exch.getRequestMethod())) {
                InputStream is = exch.getRequestBody();
                // readAllBytes=한번에 전체 바이트 읽기?
                String body = new String(is.readAllBytes(), StandardCharsets.UTF_8);

                Gson gson = new Gson();
                JsonObject json = gson.fromJson(body, JsonObject.class);
                JsonArray ja = json.getAsJsonArray("jarray");
                JsonObject jo = json.getAsJsonObject("jo");
                System.out.println("=========서버에서 받은 데이터=========");
                System.out.println("numner1 = " + jo.get("num1").getAsInt());
                System.out.println("sign = " + jo.get("sign").getAsString());
                System.out.println("numner2 = " + jo.get("num2").getAsInt());
                System.out.println("result= " + jo.get("re").getAsInt());
                System.out.println("지금까지 리스트 = " + ja.toString());

                String re = "서버 연결 OK";
                byte[] responseBytes = re.getBytes(StandardCharsets.UTF_8);
                exch.sendResponseHeaders(200, re.getBytes().length);
                OutputStream os = exch.getResponseBody();
                os.write(responseBytes);
                os.close();
            } else {
                exch.sendResponseHeaders(405, -1); // 메소드 실행 안될시
            }
        }
    }
}
