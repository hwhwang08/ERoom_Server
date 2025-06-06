package com.hwang.Studies;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class LoginTest2 {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        System.out.println("이메일 입력: ");
        String email = br.readLine();
        System.out.println("비밀번호 입력: ");
        String password = br.readLine();

//        String email = "asdf@naver.com";
//        String password = "asdfasdf";
        String apiKey = "AIzaSyC0LoanbLtGGN7ccXibBDRnpvvQaXguErM";  // Firebase 콘솔 -> 프로젝트 설정 -> 웹 API 키

        String endpoint = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + apiKey;
        String jsonInputString = String.format(
                "{\"email\":\"%s\",\"password\":\"%s\",\"returnSecureToken\":true}",
                email, password);

        URL url = new URL(endpoint);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json; UTF-8");
        conn.setDoOutput(true);

        try (OutputStream os = conn.getOutputStream()) {
            byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
            os.write(input, 0, input.length);
        }

        int code = conn.getResponseCode();
        InputStream responseStream = (code == 200) ? conn.getInputStream() : conn.getErrorStream();
        BufferedReader br2 = new BufferedReader(new InputStreamReader(responseStream, StandardCharsets.UTF_8));
        StringBuilder response = new StringBuilder();
        String responseLine;
        while ((responseLine = br2.readLine()) != null) {
            response.append(responseLine.trim());
        }

        System.out.println("응답 코드: " + code);

        // Gson으로 Pretty Print
        Gson gson = new GsonBuilder().setPrettyPrinting().create();
        Object jsonObject = gson.fromJson(response.toString(), Object.class);
        String prettyJson = gson.toJson(jsonObject);

        System.out.println("응답 내용: \n" + prettyJson);
    }
}
