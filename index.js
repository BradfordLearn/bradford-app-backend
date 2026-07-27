const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const htmlToPdf = require('html-pdf-node');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors()); 
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); 
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// Endpoint 1: Adaptive Question Generation
app.post('/api/next-question', async (req, res) => {
    try {
        const payload = req.body;
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: JSON.stringify(payload),
            config: {
                // The Brain's specific instructions for asking questions
                systemInstruction: `ROLE AND OBJECTIVE:
You are the Bradford Learning Adaptive Assessment Engine. Your task is to generate a single, highly rigorous, standard-aligned multiple-choice question.

SELF-CORRECTION & ACCURACY CHECK:
Before generating the JSON, verify the math/logic. Ensure the correct_answer is 100% accurate and explicitly matches one of the options (A, B, C, or D).

TWO LAWS OF VERTICAL ALIGNMENT (STRICT TIERING):
1. Exhaustive Readiness Coverage: When testing the baseline grade, assess ALL major readiness/power standards across domains before scaling.
2. Strict Conceptual Alignment: You must stay within the exact same conceptual strand when scaling up or down +1 or -1 grade levels. NEVER skip grades.

DYNAMIC TERMINATION:
Evaluate your confidence in the final 3 questions. If the student's ceiling and floor are not confidently isolated, set request_test_extension: true in your JSON output.

JSON OUTPUT REQUIREMENT:
{"type": "object", "properties": {"standard_code": {"type": "string"}, "question_text": {"type": "string"}, "options": {"type": "object"}, "correct_answer": {"type": "string"}, "rationale": {"type": "string"}, "diagnostic_confidence": {"type": "string"}, "request_test_extension": {"type": "boolean"}}}`,
                responseMimeType: "application/json"
            }
        });
        res.json(JSON.parse(response.text));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to generate question" });
    }
});

// Endpoint 2: PDF Generation and Email Dispatch
app.post('/api/finish-exam', async (req, res) => {
    try {
        const { student_profile, test_history } = req.body; 
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash', 
            contents: JSON.stringify({ student_profile, test_history }),
            config: {
                // The Brain's specific instructions for generating the final report
                systemInstruction: `ROLE AND OBJECTIVE:
You are the Bradford Learning Diagnostic Engine. You will receive a payload containing a student's entire multi-subject test history. Generate two distinct HTML outputs:

1. pdf_ready_html: A granular, multi-subject administrative report.
2. student_friendly_ui_html: A simplified, encouraging UI overview.

ADMIN REPORT (pdf_ready_html) RULES:
- Consolidated Overview: Provide a master executive summary at the top.
- Isolated Skill Placement Profile: Create a subsection for EACH subject.
- Vertical Ceilings & Floors: Explicitly document the highest standard mastered (The Ceiling) and the lowest foundational standard targeted to find a root gap (The Floor).
- Color Coding: Graph visuals MUST follow enrolled grade rules (Red = Below Grade, Yellow = On Grade, Green = Above Grade). Do not use overlapping absolute positioning in CSS.

STUDENT UI (student_friendly_ui_html) RULES:
- Focus strictly on celebrating strengths and framing growth areas positively. Exclude confusing alphanumeric standard codes.

JSON OUTPUT REQUIREMENT:
{"type": "object", "properties": {"pdf_ready_html": {"type": "string"}, "student_friendly_ui_html": {"type": "string"}}}`,
                responseMimeType: "application/json"
            }
        });

        const geminiData = JSON.parse(response.text);

        let file = { content: geminiData.pdf_ready_html };
        let options = { format: 'A4', printBackground: true, margin: { top: "20px", bottom: "20px" } };
        const pdfBuffer = await htmlToPdf.generatePdf(file, options);

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: 'Tbradford@bradfordlearn.com',
            subject: `Diagnostic Complete: ${student_profile.first_name} ${student_profile.last_name}`,
            text: `Attached is the comprehensive multi-subject placement diagnostic report.`,
            attachments: [{
                filename: `${student_profile.first_name}_Master_Diagnostic_Report.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }]
        };

        await transporter.sendMail(mailOptions);

        res.json({ success: true, student_ui_html: geminiData.student_friendly_ui_html });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to process final report." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nervous System running on port ${PORT}`));
