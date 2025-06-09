package com.hwang.Studies;

public class Room {
    private final String roomId;
    private final String roomAuthor;
    private final String playCount;
    private final RoomChatData chatData;



    public Room(String roomId) {
        this.roomId = roomId;
        this.roomAuthor = "김이름";
        this.playCount = "0";
        this.chatData = new RoomChatData();
    }
}
