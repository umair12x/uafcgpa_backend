const scraper = require("../utils/scraper");

const homeHandler = async (req, res) => {
  return res.status(200).json({ type: "info", message: "Result Scraper Home" });
};

const resultHandler = async (req, res) => {
  try {
    const { regNo } = req.body;

    if (!regNo || regNo.trim().length === 0) {
      return res.status(400).json({
        type: "error",
        message: "Registration number is required",
      });
    }

    const data = await scraper(regNo.trim());

    if (!data || data.success === false) {
      return res.status(data.type === "error" ? 500 : 400).json({
        type: data.type || "error",
        message: data.message || "Failed to fetch result",
        details: data.details || null,
      });
    }

   
    return res.status(200).json({
      type: "success",
      message: data.message,
      studentName: data.studentName,
      registrationNo: data.registrationNo,
      Cgpa: data.Cgpa,
      result: data.result,
    });
  } catch (err) {
    console.error("❌ Server Error:", err.message);
    return res.status(500).json({
      type: "error",
      message: "Internal server error, please try again later",
    });
  }
};

module.exports = { homeHandler, resultHandler };
