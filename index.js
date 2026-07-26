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
            model: 'gemini-2.5-flash',
            contents: JSON.stringify(payload),
            config: {
                // TODO: Inject exact prompt from Section 3A below here
                systemInstruction: "You are the Bradford Learning Adaptive Assessment Engine...",
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
            model: 'gemini-2.5-flash',
            contents: JSON.stringify({ student_profile, test_history }),
            config: {
                // TODO: Inject exact prompt from Section 3B below here
                systemInstruction: "You are the Bradford Learning Diagnostic Engine...",
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

