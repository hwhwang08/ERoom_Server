package com.hwang.Studies;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class Jami_API {
    private static final String API_KEY = "AIzaSyBtgg2M_vZJebIPK3FTEb17g2trnehZL9c";
    private static final String MODEL_NAME = "gemini-2.5-flash-preview-05-20";

    public static void main(String[] args) throws Exception {
        for(;;) {
            BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
            System.out.println("프롬프트를 입력하세요: ");
            String prompt = br.readLine();
            String response = callGeminiApi(prompt);
            System.out.println("Response from API: " + response);
        }
    }

    private static String callGeminiApi(String prompt) throws Exception {
        String urlString = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL_NAME + ":generateContent?key=" + API_KEY;
        URL url = new URL(urlString);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setDoOutput(true);

        // JSON 형식이 올바른지 확인
        String jsonInputString = String.format(
                "{\"contents\": [{\"parts\": [{\"text\": \"%s\"}]}]}",
                prompt.replace("\n", "\\n")
        );

        try (OutputStream os = conn.getOutputStream()) {
            byte[] input = jsonInputString.getBytes("utf-8");
            os.write(input, 0, input.length);
        }

        int responseCode = conn.getResponseCode();
        if (responseCode == 200) { // 성공적인 응답 코드 200을 체크
            try (BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), "utf-8"))) {
                StringBuilder response = new StringBuilder();
                String responseLine;
                while ((responseLine = br.readLine()) != null) {
                    response.append(responseLine.trim());
                }

                // JSON 응답에서 메시지만 추출
                JSONObject jsonResponse = new JSONObject(response.toString());
                if (jsonResponse.has("candidates")) {
                    JSONArray candidates = jsonResponse.getJSONArray("candidates");
                    StringBuilder message = new StringBuilder();
                    for (int i = 0; i < candidates.length(); i++) {
                        JSONObject content = candidates.getJSONObject(i).getJSONObject("content");
                        JSONArray parts = content.getJSONArray("parts");
                        for (int j = 0; j < parts.length(); j++) {
                            message.append(parts.getJSONObject(j).getString("text")).append("\n");
                        }
                    }
                    return message.toString().trim();
                } else {
                    return "No candidates found in the response.";
                }
            }
        } else if (responseCode == 401) {
            throw new RuntimeException("Failed : HTTP error code : 401 Unauthorized. Please check your API key and permissions.");
        } else {
            try (BufferedReader br = new BufferedReader(new InputStreamReader(conn.getErrorStream(), "utf-8"))) {
                StringBuilder response = new StringBuilder();
                String responseLine;
                while ((responseLine = br.readLine()) != null) {
                    response.append(responseLine.trim());
                }
                throw new RuntimeException("Failed : HTTP error code : 400 Bad Request. Response: " + response.toString());
            }
        }
    }
}
