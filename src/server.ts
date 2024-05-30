import express from 'express';
import fs from "fs";
import bodyParser from 'body-parser';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import https from 'https';
// import http from 'http';
const JSONpath = "./src/data.json"



const app = express();
const port = 8080;

app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('./src/dist'));

fs.readFile(JSONpath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
    return;
  }
  try {
    const jsonData = JSON.parse(data);
    console.log(jsonData);
  } catch (err) {
    console.error('Error parsing JSON string:', err);
  }
});


function addUser(newUser: { name: string, email: string, userID: string }) {
  fs.readFile(JSONpath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading file:', err);
      return;
    }
    try {
      const users = JSON.parse(data);

      // Add the new user object to the array
      users.push(newUser);

      fs.writeFile(JSONpath, JSON.stringify(users, null, 2), (err) => {
        if (err) {
          console.error('Error writing file:', err);
        } else {
          console.log('New user added successfully!');
        }
      });
    } catch (err) {
      console.error('Error parsing JSON string:', err);
    }
  });
};

const options = {
  key: fs.readFileSync(path.resolve(__dirname, 'example.com.key')),
  cert: fs.readFileSync(path.resolve(__dirname, 'example.com.crt'))
};

app.get('*', (req, res) => {
  console.log(req);
  res.send(path.resolve('./src/dist', 'index.html'));
});

app.get('/test', (req, res) => {
  console.log(req);
  console.log("AT TEST URL");
  res.send("TESTING 123");
});

app.post('/login', (req, res) => {
  const user: { name: string, email: string, userID: string } = req.body;
  console.log(user);
  addUser(user);
  res.send("logged in");
  // Handle user login
});

// app.post('/register', (req, res) => {
//   // Handle user registration
// });

// app.post('/upload', (req, res) => {
//   // Handle file uploads
//   console.log("AT UPLOAD URL")
// });

// http.createServer(app).listen(3000)

https.createServer(options, app).listen(port, () => {
  console.log(`HTTPS Server is running at https://localhost:${port}`);
});
