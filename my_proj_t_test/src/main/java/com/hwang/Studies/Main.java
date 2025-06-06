package com.hwang.Studies;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.*;
import java.util.stream.Collectors;

class Main {
    // s 뺄것.
    private static final String URL_M = "http://192.168.0.248:7999/health";

    public static void main(String[] args) throws IOException {
        URL url = URI.create(URL_M).toURL();
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        // 연결, InputStreamReader 바이트를 문자로 변환해 읽기 .line으로 줄단위로 읽어들여서 스트림의 줄을 하나의 문자열로 합치기. 밑은 그냥 세트라 생각하고 외우자.
        // 한줄로 읽게 BufferedReader로 감싸고 join으로 합치기
//        System.out.println(new BufferedReader(new InputStreamReader(conn.getInputStream())).lines().collect(Collectors.joining()));
        InputStreamReader ir = new InputStreamReader(conn.getInputStream());
        BufferedReader br = new BufferedReader(ir);
        System.out.println(br.lines().collect(Collectors.joining()));
        // 연결 끊기
        conn.disconnect();

    }
}