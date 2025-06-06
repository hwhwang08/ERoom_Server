package com.hwang.Studies;

public class TestDTO {
    private String id;
    private String pw;
    private String name;
    private String email;
    private String customer;

    public void setUser(String id, String pw) {
        this.id = id;
        this.pw = pw;
    }
    public String getId() {
        return id;
    }
    public String getPw() {
        return pw;
    }
}
