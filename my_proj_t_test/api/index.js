const express = require("express");
const app = express();

app.get("/", (req, res) => res.send("Express on Vercel"));

app.listen(7999, () => console.log("서버 준비 완료~ 7999."));

module.exports = app;