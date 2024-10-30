require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const admin = require('firebase-admin');

const app = express();
const port = 3000;

// Ensure required environment variables are set
if (!process.env.OPENAI_API_KEY || !process.env.FIREBASE_PROJECT_ID) {
  console.error("API keys or Firebase configurations are missing in the .env file.");
  process.exit(1);
}

// Configure OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Firebase Admin SDK for Firestore and Storage
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  storageBucket: process.env.FIREBASE_BUCKET_NAME,
});

const db = admin.firestore();  // Firestore reference
const bucket = admin.storage().bucket();  // Firebase Storage reference

// Endpoint to handle audio upload and transcription
app.post('/transcribe', express.raw({ type: 'application/octet-stream', limit: '10mb' }), async (req, res) => {
  const audioBuffer = req.body;
  const tempFilePath = path.join(__dirname, 'uploads', `temp_${Date.now()}.webm`);

  // Save the raw audio data temporarily
  fs.writeFileSync(tempFilePath, audioBuffer);
  console.log(`File saved temporarily at ${tempFilePath}`);

  try {
    // Upload file to Firebase Storage
    const destination = `audio/${path.basename(tempFilePath)}`;
    await bucket.upload(tempFilePath, { destination });
    const fileURL = `gs://${bucket.name}/${destination}`;
    console.log(`File uploaded to Firebase Storage at ${fileURL}`);

    // Set transcription language (default to English if not provided)
    const language = req.query.language || "es";
    console.log(`Using language: ${language}`);

    // Transcribe audio using OpenAI Whisper
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
      language,
    });

    const transcription = response.text;
    console.log(`Transcription success: ${transcription}`);

    // Save transcription in Firestore
    const docRef = db.collection('transcriptions').doc();  // Generate new document
    await docRef.set({
      transcription,
      language,
      fileURL,  // Store the Firebase Storage URI for reference
      timestamp: new Date().toISOString(),
    });

    res.json({ transcription, message: 'Transcription saved to Firebase Firestore successfully!' });

  } catch (error) {
    console.error('Error during transcription:', error);  // Detailed error logging
    res.status(500).send("Error processing audio file.");
  } finally {
    // Clean up temporary file
    fs.unlinkSync(tempFilePath);
    console.log(`Temporary file ${tempFilePath} deleted.`);
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
