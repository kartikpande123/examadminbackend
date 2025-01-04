const express = require("express");
const cors = require("cors");
const multer = require("multer");
const admin = require("./db/firebaseConfig").firebaseAdmin;
const moment = require("moment")

// Initialize Express app
const app = express();
const port = 5555;

// Middleware
app.use(express.json());
app.use(cors());

// Multer setup for image upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // Limit: 5 MB
});

// Firestore setup
const firestore = admin.firestore();
const realtimeDatabase = admin.database();


app.get("/", (req, res) => {
  res.send("Node.js backend is running successfully!");
});


// API to add a question to a specific exam
app.post("/api/exams/:examTitle/questions", upload.single("image"), async (req, res) => {
  const { examTitle } = req.params;
  const { question, options, correctAnswer } = req.body;
  const image = req.file;

  try {
      // Validate input
      if (!examTitle || !question || !options || correctAnswer === undefined) {
          return res.status(400).json({ error: "Missing required fields" });
      }

      // Parse options and correct answer
      const parsedOptions = JSON.parse(options);
      const parsedCorrectAnswer = parseInt(correctAnswer, 10);

      if (!Array.isArray(parsedOptions) || parsedOptions.length !== 4 || isNaN(parsedCorrectAnswer)) {
          return res.status(400).json({ error: "Invalid options or correct answer" });
      }

      // Firestore references
      const examCollection = firestore.collection("Exams").doc(examTitle);
      const questionsCollection = examCollection.collection("Questions");

      // Get the current count of questions to determine the new order
      const allQuestionsSnapshot = await questionsCollection.get();
      const nextOrder = allQuestionsSnapshot.size + 1;

      // Prepare question data with order field
      const questionData = {
          question,
          options: parsedOptions,
          correctAnswer: parsedCorrectAnswer,
          order: nextOrder,
          timestamp: new Date().getTime()
      };

      // Handle image (if present)
      if (image) {
          const base64Image = image.buffer.toString("base64");
          const mimeType = image.mimetype;
          questionData.image = `data:${mimeType};base64,${base64Image}`;
      }

      // Add question to Firestore
      const questionDoc = await questionsCollection.add(questionData);

      res.status(200).json({
          message: "Question added successfully",
          questionId: questionDoc.id,
          order: nextOrder
      });

  } catch (error) {
      console.error("Error saving question:", error);
      res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/exams/:examTitle/questions/:questionId", upload.single("image"), async (req, res) => {
    const { examTitle, questionId } = req.params;
    const { question, options, correctAnswer } = req.body;
    const image = req.file;

    try {
        if (!examTitle || !questionId || !question || !options || correctAnswer === undefined) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const parsedOptions = JSON.parse(options);
        const parsedCorrectAnswer = parseInt(correctAnswer, 10);

        if (!Array.isArray(parsedOptions) || parsedOptions.length !== 4 || isNaN(parsedCorrectAnswer)) {
            return res.status(400).json({ error: "Invalid options or correct answer" });
        }

        const examCollection = firestore.collection("Exams").doc(examTitle);
        const questionDoc = examCollection.collection("Questions").doc(questionId);

        const updateData = {
            question,
            options: parsedOptions,
            correctAnswer: parsedCorrectAnswer,
        };

        if (image) {
            const base64Image = image.buffer.toString("base64");
            const mimeType = image.mimetype;
            updateData.image = `data:${mimeType};base64,${base64Image}`;
        }

        await questionDoc.update(updateData);

        res.status(200).json({ message: "Question updated successfully" });
    } catch (error) {
        console.error("Error updating question:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.delete("/api/exams/:examTitle/questions/:questionId", async (req, res) => {
  const { examTitle, questionId } = req.params;

  try {
      // Firestore references
      const examCollection = firestore.collection("Exams").doc(examTitle);
      const questionDoc = examCollection.collection("Questions").doc(questionId);

      // Delete the question document
      await questionDoc.delete();

      res.status(200).json({ message: "Question deleted successfully" });
  } catch (error) {
      console.error("Error deleting question:", error);
      res.status(500).json({ error: "Internal server error" });
  }
});


// API to get questions for a specific exam title
// API to save exam date and time
app.post("/api/exams/:examTitle/date-time", async (req, res) => {
  const { examTitle } = req.params;
  const { date, startTime, endTime, marks, price } = req.body;

  try {
    // Validate input
    if (!examTitle || !date || !startTime || !endTime || marks === undefined || price === undefined) {
      return res.status(400).json({
        error: "Missing required fields. Please provide date, startTime, endTime, marks, and price."
      });
    }

    // Validate 12-hour time format with AM/PM
    const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({
        error: "Invalid time format. Please provide time in 12-hour format (e.g., 1:45 PM)."
      });
    }

    // Reference to the exam date-time in Realtime Database
    const examDateTimeRef = realtimeDatabase.ref('ExamDateTime').child(examTitle);

    // Save the data to Realtime Database
    await examDateTimeRef.set({
      date,
      startTime,
      endTime,
      marks,
      price,
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });

    // Update the exam document in Firestore
    const examRef = firestore.collection("Exams").doc(examTitle);
    await examRef.set({
      dateTime: {
        date,
        startTime,
        endTime,
        marks,
        price,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    }, { merge: true });

    res.status(200).json({
      message: "Exam details saved successfully",
      data: {
        examTitle,
        date,
        startTime,
        endTime,
        marks,
        price
      }
    });
  } catch (error) {
    console.error("Error saving exam details:", error);
    res.status(500).json({
      error: "Failed to save exam details",
      details: error.message
    });
  }
});
  
  // API to get exam date and time
  app.get("/api/exams/:examTitle/date-time", async (req, res) => {
    const { examTitle } = req.params;
  
    try {
      // Reference to the exam date-time in Realtime Database
      const examDateTimeRef = realtimeDatabase.ref('ExamDateTime').child(examTitle);
      
      // Get the data
      const snapshot = await examDateTimeRef.once('value');
      const dateTimeData = snapshot.val();
  
      if (!dateTimeData) {
        return res.status(404).json({ 
          error: "Exam date and time not found" 
        });
      }
  
      res.status(200).json({
        examTitle,
        ...dateTimeData
      });
  
    } catch (error) {
      console.error("Error fetching exam date and time:", error);
      res.status(500).json({ 
        error: "Failed to fetch exam date and time",
        details: error.message 
      });
    }
  });


  //Notification apis

  // API to save notification
app.post("/api/notifications", async (req, res) => {
    const { message, createdAt } = req.body;
  
    try {
      // Validate input
      if (!message) {
        return res.status(400).json({ 
          error: "Missing required fields. Please provide a message" 
        });
      }
  
      // Generate a unique ID for the notification
      const notificationId = Date.now().toString();
  
      // Reference to the notifications in Realtime Database
      const notificationsRef = realtimeDatabase.ref('Notifications');
  
      // Save the notification
      await notificationsRef.child(notificationId).set({
        message,
        createdAt,
        updatedAt: admin.database.ServerValue.TIMESTAMP
      });
  
      res.status(200).json({
        message: "Notification saved successfully",
        data: {
          id: notificationId,
          message,
          createdAt
        }
      });
  
    } catch (error) {
      console.error("Error saving notification:", error);
      res.status(500).json({ 
        error: "Failed to save notification",
        details: error.message 
      });
    }
  });
  

  // API to update a notification
  app.put("/api/notifications/:id", async (req, res) => {
    const { id } = req.params;
    const { message } = req.body;
  
    try {
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }
  
      const notificationRef = realtimeDatabase.ref(`Notifications/${id}`);
      
      await notificationRef.update({
        message,
        updatedAt: admin.database.ServerValue.TIMESTAMP
      });
  
      res.status(200).json({
        message: "Notification updated successfully"
      });
  
    } catch (error) {
      console.error("Error updating notification:", error);
      res.status(500).json({ 
        error: "Failed to update notification",
        details: error.message 
      });
    }
  });
  
  // API to delete a notification
  app.delete("/api/notifications/:id", async (req, res) => {
    const { id } = req.params;
  
    try {
      const notificationRef = realtimeDatabase.ref(`Notifications/${id}`);
      await notificationRef.remove();
  
      res.status(200).json({
        message: "Notification deleted successfully"
      });
  
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).json({ 
        error: "Failed to delete notification",
        details: error.message 
      });
    }
  });


  //Syllabus pdf
 // Save syllabus endpoint
app.post("/api/syllabus", async (req, res) => {
  try {
    const { examTitle, syllabusLink } = req.body;

    // Validate input
    if (!examTitle || !syllabusLink) {
      return res.status(400).json({
        error: "Missing required fields. Please provide exam title and syllabus link"
      });
    }

    // Generate unique ID
    const syllabusId = `syllabus_${Date.now()}`;

    // Create syllabus data object
    const syllabusData = {
      id: syllabusId,
      examTitle,
      syllabusLink,
      uploadedAt: new Date().toISOString(),
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      version: "3.11.174"
    };

    // Save to Firebase Realtime Database
    const syllabusRef = admin.database().ref('Syllabus').child(syllabusId);
    await syllabusRef.set(syllabusData);

    res.status(200).json({
      message: "Syllabus saved successfully",
      data: syllabusData
    });

  } catch (error) {
    console.error("Error saving syllabus:", error);
    res.status(500).json({
      error: "Failed to save syllabus",
      details: error.message
    });
  }
});

// Get all syllabus endpoint
app.get("/api/syllabus", async (req, res) => {
  try {
    const syllabusRef = admin.database().ref("Syllabus");
    const snapshot = await syllabusRef.once("value");

    if (!snapshot.exists()) {
      return res.status(200).json({
        message: "No syllabus found",
        data: {},
        version: "3.11.174"
      });
    }

    const syllabusData = snapshot.val();

    res.status(200).json({
      message: "Syllabus fetched successfully",
      data: syllabusData,
      version: "3.11.174"
    });

  } catch (error) {
    console.error("Error fetching syllabus:", error);
    res.status(500).json({
      error: "Failed to fetch syllabus",
      details: error.message
    });
  }
});

// Update syllabus endpoint
app.put("/api/syllabus/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { examTitle, syllabusLink } = req.body;

    // Validate input
    if (!examTitle || !syllabusLink) {
      return res.status(400).json({
        error: "Missing required fields. Please provide exam title and syllabus link"
      });
    }

    const syllabusRef = admin.database().ref('Syllabus').child(id);
    const snapshot = await syllabusRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "Syllabus not found" });
    }

    const updatedData = {
      ...snapshot.val(),
      examTitle,
      syllabusLink,
      updatedAt: admin.database.ServerValue.TIMESTAMP
    };

    await syllabusRef.update(updatedData);

    res.status(200).json({
      message: "Syllabus updated successfully",
      data: updatedData
    });

  } catch (error) {
    console.error("Error updating syllabus:", error);
    res.status(500).json({
      error: "Failed to update syllabus",
      details: error.message
    });
  }
});

// Delete syllabus endpoint
app.delete("/api/syllabus/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const syllabusRef = admin.database().ref('Syllabus').child(id);
    
    const snapshot = await syllabusRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: "Syllabus not found" });
    }

    await syllabusRef.remove();

    res.status(200).json({
      message: "Syllabus deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting syllabus:", error);
    res.status(500).json({
      error: "Failed to delete syllabus",
      details: error.message
    });
  }
});


//Api for q/a upload
app.post("/api/exam-qa", async (req, res) => {
  try {
    const { examTitle, qaLink } = req.body;

    // Validate input
    if (!examTitle || !qaLink) {
      return res.status(400).json({
        error: "Missing required fields. Please provide exam title and Q&A link.",
      });
    }

    // Generate unique ID for the Q&A entry
    const qaId = `qa_${Date.now()}`;

    // Create Q&A data object
    const qaData = {
      id: qaId,
      examTitle,
      qaLink,
      uploadedAt: new Date().toISOString(),
      version: "1.0.0", // Optional: Add version or metadata
    };

    // Save to Firebase Realtime Database
    const qaRef = admin.database().ref("ExamQA").child(qaId);
    await qaRef.set(qaData);

    // Respond with success
    res.status(200).json({
      message: "Exam Q&A saved successfully",
      data: qaData,
    });
  } catch (error) {
    console.error("Error saving Q&A details:", error);
    res.status(500).json({
      error: "Failed to save Q&A details",
      details: error.message,
    });
  }
});

  
// API to get all concerns from Firestore
app.get("/api/concerns", async (req, res) => {
  try {
      // Reference to the concerns collection in Firestore
      const concernsRef = firestore.collection("concerns");

      // Get all concerns
      const snapshot = await concernsRef.get();

      if (snapshot.empty) {
          return res.status(404).json({
              message: "No concerns found",
          });
      }

      // Convert Firestore documents to an array of concern objects
      const concerns = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
      }));

      // Return concerns to the client
      res.status(200).json({
          concerns,
      });
  } catch (error) {
      console.error("Error fetching concerns:", error);
      res.status(500).json({
          error: "Failed to fetch concerns",
          details: error.message,
      });
  }
});

// API to delete a concern
app.delete("/api/concerns/:id", async (req, res) => {
  try {
    const concernId = req.params.id;

    // Reference to the specific concern in Firestore
    const concernRef = firestore.collection("concerns").doc(concernId);

    // Delete the concern document
    await concernRef.delete();

    res.status(200).json({ message: "Concern deleted successfully" });
  } catch (error) {
    console.error("Error deleting concern:", error);
    res.status(500).json({ error: "Failed to delete concern", details: error.message });
  }
});



//Login page
// Admin Login Validation API
app.get("/api/admin/login", async (req, res) => {
  const { userid, password } = req.query;

  if (!userid || !password) {
    return res.status(400).json({ error: "User ID and Password are required." });
  }

  try {
    const db = admin.database();
    const ref = db.ref("Adminlogin");

    // Fetch stored admin credentials
    const snapshot = await ref.once("value");
    const adminData = snapshot.val();

    // Log the incoming and stored data
    console.log("Incoming request: ", { userid, password });
    console.log("Stored admin data: ", adminData);

    // Compare provided credentials with stored ones
    if (adminData.userid === userid.trim() && adminData.password === password.trim()) {
      return res.status(200).json({ message: "Login successful!" });
    } else {
      return res.status(401).json({ error: "Invalid User ID or Password." });
    }
  } catch (error) {
    console.error("Error fetching admin data:", error);
    return res.status(500).json({ error: "Internal Server Error." });
  }
});


//Api for candidates section
app.get('/api/candidates', async (req, res) => {
  try {
    // Fetch all candidate documents from the 'candidates' collection
    const snapshot = await firestore.collection('candidates').get();

    if (snapshot.empty) {
      return res.status(404).json({ message: 'No candidates found' });
    }

    // Map through the documents and return the candidate data
    const candidates = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({ message: 'Candidates fetched successfully', candidates });
  } catch (error) {
    console.error('Error fetching candidates:', error);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

app.get("/api/exams", async (req, res) => {
  try {
    const examsRef = firestore.collection("Exams");
    const examSnapshot = await examsRef.get();
    
    const exams = [];
    
    // Fetch each exam and its subcollections
    for (const examDoc of examSnapshot.docs) {
      const examData = examDoc.data();
      const examId = examDoc.id;
      
      // Get exam details subcollection
      const examDetailsRef = examsRef.doc(examId);
      const examDetailsSnapshot = await examDetailsRef.get();
      
      // Get questions subcollection
      const questionsRef = examDetailsRef.collection("Questions");
      const questionsSnapshot = await questionsRef.get();
      
      const questions = [];
      questionsSnapshot.forEach(questionDoc => {
        questions.push({
          id: questionDoc.id,
          ...questionDoc.data()
        });
      });

      // Combine all data
      exams.push({
        id: examId,
        ...examData,
        examDetails: examDetailsSnapshot.data(),
        questions: questions
      });
    }
    
    res.status(200).json({
      success: true,
      data: exams
    });
    
  } catch (error) {
    console.error("Error fetching exams:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch exams",
      details: error.message
    });
  }
});


// Add this new API endpoint to your existing Express app
app.get("/api/today-exam-results", async (req, res) => {
  try {
    const today = moment().format('YYYY-MM-DD');
    
    // Step 1: Get today's exam from Firestore
    const examsSnapshot = await firestore.collection('Exams').get();
    let todayExam = null;
    let examQuestions = [];

    // Find today's exam
    for (const doc of examsSnapshot.docs) {
      const examData = doc.data();
      if (examData.dateTime?.date === today) {
        todayExam = {
          id: doc.id,
          ...examData.dateTime
        };
        
        // Get questions for this exam
        const questionsSnapshot = await doc.ref.collection('Questions').orderBy('order').get();
        examQuestions = questionsSnapshot.docs.map(qDoc => ({
          id: qDoc.id,
          ...qDoc.data()
        }));
        break;
      }
    }

    if (!todayExam) {
      return res.status(404).json({
        success: false,
        message: 'No exam found for today'
      });
    }

    // Step 2: Get candidates who took this exam
    const candidatesSnapshot = await firestore.collection('candidates')
      .where('exam', '==', todayExam.id)
      .get();

    const results = [];
    
    // Step 3: Process each candidate's answers
    for (const candidateDoc of candidatesSnapshot.docs) {
      const candidateData = candidateDoc.data();
      
      // Get candidate's answers
      const answersSnapshot = await candidateDoc.ref.collection('answers').get();
      const answers = answersSnapshot.docs.map(aDoc => ({
        id: aDoc.id,
        ...aDoc.data()
      }));

      // Calculate results
      let correctAnswers = 0;
      let skippedQuestions = 0;
      
      examQuestions.forEach(question => {
        const candidateAnswer = answers.find(a => a.order === question.order);
        
        if (!candidateAnswer || candidateAnswer.skipped) {
          skippedQuestions++;
        } else if (candidateAnswer.answer === question.correctAnswer) {
          correctAnswers++;
        }
      });

      // Prepare result object
      const resultData = {
        registrationNumber: candidateDoc.id,
        candidateName: candidateData.candidateName,
        phone: candidateData.phone,
        totalQuestions: examQuestions.length,
        correctAnswers,
        skippedQuestions,
        wrongAnswers: examQuestions.length - (correctAnswers + skippedQuestions)
      };

      results.push(resultData);

      // Store results in Realtime Database
      const resultRef = realtimeDatabase.ref(`Results/${todayExam.id}/${candidateDoc.id}`);
      await resultRef.set({
        ...resultData,
        timestamp: new Date().toISOString()
      });
    }

    res.status(200).json({
      success: true,
      examDetails: {
        examName: todayExam.id,
        date: todayExam.date,
        startTime: todayExam.startTime,
        endTime: todayExam.endTime,
        totalMarks: todayExam.marks
      },
      results
    });

  } catch (error) {
    console.error('Error fetching exam results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch exam results',
      details: error.message
    });
  }
});

app.get("/api/all-exam-results", async (req, res) => {
  try {
    // Reference to the Results node in Realtime Database
    const resultsRef = realtimeDatabase.ref('Results');
    
    // Fetch all results
    const snapshot = await resultsRef.once('value');
    const resultsData = snapshot.val();

    // If no results exist
    if (!resultsData) {
      return res.status(200).json({
        success: true,
        message: "No exam results found",
        data: {}
      });
    }

    // Transform the data into a more structured format
    const formattedResults = Object.entries(resultsData).map(([examId, examData]) => ({
      examId,
      candidates: Object.entries(examData).map(([registrationId, candidateData]) => ({
        registrationId,
        ...candidateData
      }))
    }));

    res.status(200).json({
      success: true,
      message: "Exam results fetched successfully",
      data: formattedResults,
      metadata: {
        totalExams: formattedResults.length,
        totalCandidates: formattedResults.reduce((total, exam) => 
          total + exam.candidates.length, 0
        )
      }
    });

  } catch (error) {
    console.error("Error fetching exam results:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch exam results",
      details: error.message
    });
  }
});


// delte apis
app.delete("/api/candidates", async (req, res) => {
  try {
      // Firestore reference to the "Candidates" collection
      const candidatesCollection = firestore.collection("Candidates");

      // Fetch all documents in the "Candidates" collection
      const candidatesSnapshot = await candidatesCollection.get();

      // Iterate through each document in the "Candidates" collection
      for (const candidateDoc of candidatesSnapshot.docs) {
          const candidateDocRef = candidateDoc.ref;

          // Delete the "answers" document in the candidate's sub-collection, if it exists
          const answersDocRef = candidateDocRef.collection("SubCollection").doc("answers");
          const answersDoc = await answersDocRef.get();
          if (answersDoc.exists) {
              await answersDocRef.delete();
          }

          // Delete any sub-collections under the candidate document
          const subCollections = await candidateDocRef.listCollections();
          for (const subCollection of subCollections) {
              const subCollectionRef = firestore.collection(subCollection.path);
              const subCollectionDocs = await subCollectionRef.get();
              for (const doc of subCollectionDocs.docs) {
                  await doc.ref.delete();
              }
          }

          // Delete the candidate document itself
          await candidateDocRef.delete();
      }

      res.status(200).json({ message: "Candidates collection and related data deleted successfully" });
  } catch (error) {
      console.error("Error deleting Candidates data:", error);
      res.status(500).json({ error: "Internal server error" });
  }
});


// Start the server
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
