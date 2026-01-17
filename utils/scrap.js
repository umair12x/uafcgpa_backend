require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");

const scraper = async (regNo) => {
  try {
    // Create session with axios
    const session = axios.create({
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
      maxRedirects: 5
    });

    // Get initial page
    const initialResponse = await session.get("http://lms.uaf.edu.pk/login/index.php");
    const $ = cheerio.load(initialResponse.data);

    // Look for form
    const form = $("form");
    const formAction = form.attr("action") || "http://lms.uaf.edu.pk/login/index.php";
    const formMethod = form.attr("method") || "POST";

    // Collect all form inputs
    const formData = {};
    form.find("input").each((i, elem) => {
      const name = $(elem).attr("name");
      const value = $(elem).attr("value") || "";
      if (name) {
        formData[name] = value;
      }
    });

    // Set registration number
    formData["REG"] = regNo; // Adjust field name as needed

    // Submit form
    const resultResponse = await session({
      method: formMethod,
      url: new URL(formAction,  "http://lms.uaf.edu.pk/login/index.php").href,
      data: new URLSearchParams(formData),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "http://lms.uaf.edu.pk/login/index.php"
      }
    });

    const result$ = cheerio.load(resultResponse.data);
    const table = result$(".table.tab-content");

    if (!table.length) {
      throw {
        type: "error",
        message: "No result found for this registration number"
      };
    }

    // Extract data using cheerio
    const rawText = table.text().replace(/\s+/g, " ").trim();
    const nameMatch = rawText.match(/Student Full Name\s*(.*?)(?=\s*(?:Registration|Semester|$))/i);
    const regMatch = rawText.match(/Registration\s*#\s*([^\s]+)/i);

    const studentName = nameMatch ? nameMatch[1].trim() : "";
    const registrationNo = regMatch ? regMatch[1].trim() : regNo;

    if (!studentName) {
      throw {
        type: "warning",
        message: "Invalid registration number, student not found"
      };
    }

    // Process table rows
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

    table.find("tr").each((i, row) => {
      if (i === 0) return; // Skip header
      const cells = result$(row).find("td");
      if (cells.length > 11) {
        const sem = result$(cells[1]).text().trim();
        const code = result$(cells[3]).text().trim();
        const ch = parseInt(result$(cells[5]).text().trim()) || 0;
        const marks = parseInt(result$(cells[10]).text().trim()) || 0;
        const grade = result$(cells[11]).text().trim();
        
        if (grade === "P") return;
        
        const qp = getQualityPoint(marks, ch) * ch;
        
        if (!allCourses[code] || marks > allCourses[code].marks) {
          allCourses[code] = {
            semester: sem,
            code,
            creditHours: ch,
            marks,
            grade,
            qualityPoints: qp
          };
        }
      }
    });

    // Organize by semester
    const semesters = {};
    Object.values(allCourses).forEach(course => {
      if (!semesters[course.semester]) {
        semesters[course.semester] = [];
      }
      semesters[course.semester].push(course);
    });

    const result = Object.entries(semesters).map(([semester, courses]) => {
      const totalQP = courses.reduce((sum, c) => sum + c.qualityPoints, 0);
      const totalCH = courses.reduce((sum, c) => sum + c.creditHours, 0);
      const gpa = totalCH ? Number((totalQP / totalCH).toFixed(3)) : 0;
      
      return {
        semester,
        gpa,
        subjects: courses
      };
    });

    // Calculate CGPA
    const allCoursesArray = Object.values(allCourses);
    const totalQP = allCoursesArray.reduce((sum, c) => sum + c.qualityPoints, 0);
    const totalCH = allCoursesArray.reduce((sum, c) => sum + c.creditHours, 0);
    const cgpa = totalCH ? Number((totalQP / totalCH).toFixed(5)) : 0;

    return {
      success: true,
      type: "success",
      message: "Result fetched successfully",
      data: {
        studentName,
        registrationNo,
        cgpa,
        semesters: result,
        totalCreditHours: totalCH,
        totalQualityPoints: Number(totalQP.toFixed(2))
      }
    };

  } catch (error) {
    if (error.type && error.message) {
      return { success: false, ...error };
    }
    
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      return {
        success: false,
        type: "error",
        message: "Cannot connect to university website"
      };
    }
    
    if (error.response && error.response.status === 404) {
      return {
        success: false,
        type: "error",
        message: "University website not found"
      };
    }

    return {
      success: false,
      type: "error",
      message: "Unexpected error occurred",
      details: error.message
    };
  }
};

// module.exports = scraper;
scraper("2022-ag-7755").then(console.log).catch(console.error);