const express = require("express");
const Router = express.Router();
const { homeHandler, resultHandler } = require("../controllers/result-control");

Router.get("/", homeHandler);
Router.post("/result", resultHandler);

module.exports = Router;