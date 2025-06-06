package com.hwang.Studies;

import com.google.gson.Gson;
import lombok.Getter;
import lombok.Setter;


public class Gson_test {
    public static void main(String[] args) {
        Gson gson = new Gson();
//        new GsonBuilder().create();
//        JsonObject jo = new JsonObject();
//        jo.addProperty("name", "김이름1");
//        jo.addProperty("age", 202);
//
//        String info = gson.toJson(jo);
//        System.out.println("사용자 정보입니다." + info);
        String js = "{name:김이름3, age:23}";
//        User user = new User();
        User user = gson.fromJson(js, User.class);

//        user.setName("김이름");
//        user.setAge(20);
//        String info = gson.toJson(user);
//        System.out.println("사용자 정보" + info);
        System.out.println(user.getName());
        System.out.println(user.getAge());

    }
    @Getter
    @Setter
    public static class User {
        private String name;
        private int age;
    }

}


