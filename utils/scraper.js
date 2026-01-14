require("dotenv").config();
const { firefox } = require("playwright");

const scraper = async (regNo) => {
  let browser;
  try {
    browser = await firefox.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.setDefaultTimeout(10000);
    await page.route("**/*", (route) => {
      const req = route.request();
      const url = req.url();
      const resource = req.resourceType();

      if (
        resource === "image" ||
        resource === "media" ||
        resource === "font" ||
        url.includes("analytics") ||
        url.includes("ads") ||
        url.includes("tracker") ||
        url.includes(".css") ||
        url.includes(".svg") ||
        url.includes(".woff") ||
        url.includes(".woff2") ||
        url.includes(".eot") ||
        url.includes(".ttf") ||
        url.includes(".mp4") ||
        url.includes(".webm") ||
        url.includes(".m3u8") ||
        url.includes(".json")
      ) {
        return route.abort();
      }

      route.continue();
    });

    try {
      await page.goto(process.env.LOGIN_URL, { waitUntil: "domcontentloaded" });
    } catch (err) {
      if (err.message.includes("ERR_CERT"))
        throw {
          type: "error",
          message: "SSL issue detected, website certificate invalid",
        };
      if (err.message.includes("Timeout"))
        throw { type: "warning", message: "Website took too long to respond" };
      throw { type: "error", message: "Unable to reach university website" };
    }

    await page.fill("#REG", regNo);
    await page.click("input[type='submit'][value='Result']");
    await page.waitForLoadState("domcontentloaded");

    const hasTable = await page.$(".table.tab-content");
    if (!hasTable) {
      throw {
        type: "error",
        message: "No result found for this registration number",
      };
    }

    const rawInfo = await page.textContent(".table.tab-content");
    const cleanedInfo = rawInfo.replace(/\s+/g, " ").trim();

    const match = cleanedInfo.match(
      /Registration #\s*([^\s]+).*?Student Full Name\s*(.*)/i
    );
    const registrationNo = match ? match[1]?.trim() : "";
    const studentName = match ? match[2]?.trim() : "";

    if (!studentName) {
      throw {
        type: "warning",
        message: "Invalid registration number, student not found",
      };
    }

    const { Cgpa, result } = await page.$$eval(
      ".table.tab-content tr",
      (rows) => {
        const allCourses = {};

        const getQualityPoint = (obt, ch) => {
          if (ch <= 0) return 0;
          const total = ch * 20;
          const pct = (obt / total) * 100;
          if (pct < 40) return 0;
          if (pct < 50) return 1 + (pct - 40) * 0.1;
          if (pct < 80) return 2 + (pct - 50) * (2 / 30);
          return 4;
        };

        rows.slice(1).forEach((r) => {
          const td = r.querySelectorAll("td");
          if (td.length > 11) {
            const sem = td[1].innerText.trim();
            const code = td[3].innerText.trim();
            const ch = parseInt(td[5].innerText.trim()) || 0;
            const marks = parseInt(td[10].innerText.trim()) || 0;
            const grade = td[11].innerText.trim();
            if (grade === "P") return;
            const qp = getQualityPoint(marks, ch) * ch;
            if (!allCourses[code] || marks > allCourses[code].marks)
              allCourses[code] = { sem, code, ch, marks, grade, qp };
          }
        });

        const semMap = {};
        Object.values(allCourses).forEach((c) => {
          if (!semMap[c.sem]) semMap[c.sem] = [];
          semMap[c.sem].push(c);
        });

        const result = Object.entries(semMap).map(([sem, subs]) => {
          const totalQP = subs.reduce((a, b) => a + b.qp, 0);
          const totalCH = subs.reduce((a, b) => a + b.ch, 0);
          const gpa = totalCH ? Number((totalQP / totalCH).toFixed(3)) : 0;
          return { semester: sem, Gpa: gpa, subjects: subs };
        });

        const totalQP = Object.values(allCourses).reduce((a, c) => a + c.qp, 0);
        const totalCH = Object.values(allCourses).reduce((a, c) => a + c.ch, 0);
        const cgpa = totalCH ? Number((totalQP / totalCH).toFixed(5)) : 0;

        return { Cgpa: cgpa, result };
      }
    );

    return {
      success: true,
      type: "success",
      message: "Result fetched successfully",
      studentName,
      registrationNo,
      Cgpa,
      result,
    };
  } catch (error) {
    if (error.type && error.message) return { success: false, ...error };
    return {
      success: false,
      type: "error",
      message: "Unexpected error occurred",
      details: error.message,
    };
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = scraper;
