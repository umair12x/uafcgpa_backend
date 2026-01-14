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

