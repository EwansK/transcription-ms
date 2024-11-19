### **Project Overview** 
This project is a server-side API built with Node.js that handles audio transcription requests. It uses the OpenAI Whisper API for transcription and integrates with Firebase for audio file storage and metadata management.
### Features
* **Audio File Upload:** Accepts audio files in various formats (e.g., .webm, .wav, .mp3) via a POST request.
* **OpenAI Whisper Integration:** Transcribes audio files using the Whisper API.
* **Firebase Integration:**
    * **Cloud Storage:** Stores uploaded audio files.
    * **Firestore:** Saves transcription results with metadata.
* **Retry Logic:** Ensures reliable transcription with multiple retry attempts.
* **Health Check Endpoint:** Provides a simple endpoint to verify server availability.
### Requirements
* **Node.js:** Version 18 or later.
* **npm:** Installed with Node.js.
* **Firebase Project:**
    * Service account JSON key.
    * Configured Firebase Cloud Storage bucket.
    * Firestore database.
* **OpenAI API Key:** Required for Whisper API access.
 
