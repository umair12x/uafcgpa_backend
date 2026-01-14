require("dotenv").config();

const apiKeyMiddleware = (req, res, next) => {

  const clientKey = req.headers["x-api-key"];
  const serverKey = process.env.API_KEY;
 

  if (!serverKey) {
    console.error("API_KEY is missing in environment");
    return res
      .status(500)
      .json({ type: "error", message: "Server env missing API key" });
  }

  if (!clientKey || clientKey !== serverKey) {
    return res
      .status(401)
      .json({ type: "error", message: "Unauthorized request" });
  }

  next();
};

module.exports = apiKeyMiddleware;
