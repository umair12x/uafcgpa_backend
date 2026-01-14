require("dotenv").config();
const { webkit } = require("playwright");

const scraper = async (regNo) => {
  let browser;
  try {
    // Launch the browser in headless mode
    browser = await webkit.launch({ headless: false, args: ["--no-sandbox"] });

    const context = await browser.newContext({
      ignoreHTTPSErrors: true, // ✅ ignore SSL errors
    });

    const page = await context.newPage();

    // Block unnecessary resources to speed up the scraping
    // await page.route(
    //   "**/*.{png,jpg,jpeg,css,woff,woff2,eot,ttf,svg}",
    //   (route) => route.abort()
    // );

    await page.setDefaultTimeout(5000);
    try {
      await page.goto(process.env.LOGIN_URL, {
        waitUntil: "domcontentloaded",
      });
    } catch (err) {
      if (err.message.includes("net::ERR_CERT")) {
        throw {
          type: "error",
          message: "SSL problem, university website has invalid certificate",
        };
      } else if (err.message.includes("Timeout")) {
        throw {
          type: "warning",
          message: "Website took too long to respond, please try again later",
        };
      } else {
        throw {
          type: "error",
          message: "Unable to connect to the university website",
        };
      }
    }
    await page.fill("#REG", regNo);
    await page.click("input[type='submit'][value='Result']");
    await page.waitForSelector(".table.tab-content", { timeout: 5000 });

    await page.waitForLoadState("domcontentloaded");

    const pageContent = await page.content();
    if (
      pageContent.includes("Invalid Registration") ||
      pageContent.includes("No Record Found") ||
      pageContent.includes("Record not found") ||
      pageContent.includes("not exist")
    ) {
      throw {
        type: "warning",
        message: "Invalid registration number, please check and try again",
      };
    }

    const hasResultTable = await page.$(".table.tab-content");
    if (!hasResultTable) {
      throw {
        type: "warning",
        message: "No result found for this registration number",
      };
    }

    const table = await page.$(".table.tab-content");
    if (!table) {
      throw {
        type: "warning",
        message: "No result table found, please verify the registration number",
      };
    }

    const rawInfo = await page.textContent(".table.tab-content");
    const cleanedInfo = rawInfo
      .replace("Registration #", "")
      .replace("Student Full Name", "")
      .trim();
    const match = cleanedInfo.match(/(\d{4}-?[A-Za-z]{2,}-?\d+)\s+(.+)/);
    const registrationNo = match[1];
    const studentName = match[2];
    
    if (!studentName) {
      throw {
        type: "warning",
        message: "Invalid registration number, student not found",
      };
    }

    const result = await page.$$eval(".table.tab-content tr", (rows) => {
      const allCourses = {}; // Store all courses globally (keyed by courseCode)

      // Function to calculate quality points
      const getQualityPoint = (obtainedMarks, creditHours) => {
        if (creditHours <= 0) return 0;
        const totalMarks = creditHours * 20;
        const percentage = (obtainedMarks / totalMarks) * 100;
        let qpPerCreditHour = 0;
        if (percentage < 40) {
          // 0-39%: 0 QP
          qpPerCreditHour = 0;
        } else if (percentage < 50) {
          // 40-49%: Linear increase from 1.0 to 2.0
          qpPerCreditHour = 1.0 + (percentage - 40) * 0.1;
        } else if (percentage < 80) {
          // 50-79%: Linear increase from 2.0 to 4.0
          qpPerCreditHour = 2.0 + (percentage - 50) * (2 / 30);
        } else {
          // 80%+: Full 4.0
          qpPerCreditHour = 4.0;
        }
        // Calculate total QP with precise rounding
        const totalQP = qpPerCreditHour * creditHours;
        return Number(totalQP.toFixed(2));
      };

      rows.slice(1).forEach((row) => {
        const columns = row.querySelectorAll("td");
        if (columns.length > 11) {
          const semesterName = columns[1]?.innerText.trim();
          const courseCode = columns[3]?.innerText.trim();
          const creditHours = parseInt(columns[5]?.innerText.trim()) || 0;
          const obtainedMarks = parseInt(columns[10]?.innerText.trim()) || 0;
          const grade = columns[11]?.innerText.trim();
          const qualityPoints = getQualityPoint(obtainedMarks, creditHours);

          // Exclude subjects with grade "P"
          if (grade === "P") return;

          // Check if the course already exists in `allCourses`
          if (
            !allCourses[courseCode] ||
            obtainedMarks > allCourses[courseCode].obtainedMarks
          ) {
            allCourses[courseCode] = {
              semester: semesterName,
              courseCode,
              creditHours,
              obtainedMarks,
              grade,
              qualityPoints,
            };
          }
        }
      });

      // Reorganize courses back into semesters
      const semesterMap = {};
      Object.values(allCourses).forEach((course) => {
        const { semester } = course;
        if (!semesterMap[semester]) {
          semesterMap[semester] = [];
        }
        semesterMap[semester].push(course); // Add the course to the semester's list
      });

      // Calculate GPA for each semester and prepare the final result
      const formattedResult = Object.entries(semesterMap).map(
        ([semester, subjects]) => {
          const totalQualityPointsInSemester = subjects.reduce(
            (sum, subject) => sum + subject.qualityPoints,
            0
          );
          const totalCreditHoursInSemester = subjects.reduce(
            (sum, subject) => sum + subject.creditHours,
            0
          );
          const gpa =
            totalCreditHoursInSemester > 0
              ? Number(
                  (
                    totalQualityPointsInSemester / totalCreditHoursInSemester
                  ).toFixed(3)
                )
              : 0;

          return {
            semester: semester,
            Gpa: gpa,
            subjects: subjects.map(
              ({
                courseCode,
                creditHours,
                obtainedMarks,
                grade,
                qualityPoints,
              }) => ({
                courseCode,
                creditHours,
                obtainedMarks,
                grade,
                qualityPoints,
              })
            ),
          };
        }
      );

      // Calculate CGPA
      const cumulativeQualityPoints = Object.values(allCourses).reduce(
        (sum, course) => sum + course.qualityPoints,
        0
      );
      const cumulativeCreditHours = Object.values(allCourses).reduce(
        (sum, course) => sum + course.creditHours,
        0
      );
      const cgpa =
        cumulativeCreditHours > 0
          ? Number((cumulativeQualityPoints / cumulativeCreditHours).toFixed(5))
          : 0;

      return {
        Cgpa: cgpa,
        result: formattedResult,
      };
    });

    return {
      success: true,
      type: "success",
      message: "Result fetched successfully",
      registrationNo,
      studentName,
      ...result,
    };
  } catch (error) {
    // handle structured errors from inside
    if (error.type && error.message) {
      return { success: false, ...error };
    }
    return {
      success: false,
      type: "error",
      message:
        "Unexpected issue occurred, might be due to internet problem or website maintenance",
      details: error.message,
    };
  } finally {
    // if (browser) await browser.close();
  }
};

module.exports = scraper;
