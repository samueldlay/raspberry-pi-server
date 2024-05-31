import express from "express";
import fs from "fs";
import bodyParser from "body-parser";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import https from "https";
import multer from "multer";
const JSONpath = "./src/data.json";

const app = express();
const port = 8080;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static("./src/dist"));
app.use(helmet());

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "./src/uploads"),
  filename: (req, file, cb) => {
    const date = new Date();
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const currentDate = `${day}-${month}-${year}`;

    if (file.originalname) {
      cb(null, `${currentDate}-${file.originalname}`);
    }
    cb(null, "NOT_A_FILENAME");
  },
});

const upload = multer({ storage: storage });

fs.readFile(JSONpath, "utf8", (err, data) => {
  if (err) {
    console.error("Error reading file:", err);
    return;
  }
  try {
    const jsonData = JSON.parse(data);
    console.log(jsonData);
  } catch (err) {
    console.error("Error parsing JSON string:", err);
  }
});

const options = {
  key: fs.readFileSync(path.resolve(__dirname, "example.com.key")),
  cert: fs.readFileSync(path.resolve(__dirname, "example.com.crt")),
};

app.get("*", (req, res) => {
  console.log(req);
  res.send(path.resolve("./src/dist", "index.html"));
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send({ message: "No file uploaded." });
  }
  console.log("FILE_NAME", req.file.filename);
  res.send({ message: "File uploaded successfully", file: req.file });
});

app.post("/createAccount", (req, res) => {
  const newUser: {
    name: string;
    email: string;
    password: string;
    userID: string;
  } = req.body;
  fs.readFile(JSONpath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading file:", err);
      return;
    }
    try {
      const users = JSON.parse(data);
      if (
        users.find(
          (user: {
            name: string;
            email: string;
            password: string;
            userID: string;
          }) => user.email === newUser.email,
        )
      ) {
        res.send(
          JSON.stringify({ message: "A user with that email already exists" }),
        );
        return;
      }
      // Add the new user object to the array
      users.push(newUser);

      fs.writeFile(JSONpath, JSON.stringify(users, null, 2), (err) => {
        if (err) {
          console.error("Error writing file:", err);
        } else {
          console.log("New user added successfully!", users);
          res.send(
            JSON.stringify({
              message: "You have been successfully added!",
              username: newUser.email,
            }),
          );
        }
      });
    } catch (err) {
      if (err instanceof Error) {
        return err.message;
      }
      console.error("Error parsing JSON string:", err);
      res.send(JSON.stringify(err));
      return err;
    }
  });
});

// app.post('/login', (req, res) => {
// });

// app.post('/upload', (req, res) => {
//   // Handle file uploads
//   console.log("AT UPLOAD URL");
// });

https.createServer(options, app).listen(port, () => {
  console.log(`HTTPS Server is running at https://localhost:${port}`);
});