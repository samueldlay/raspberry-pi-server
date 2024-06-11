import express from "express";
import fs, { access, constants } from "fs";
import os from "os";
import bodyParser from "body-parser";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import https from "https";
import multer from "multer";
const JSONpath = "./src/data.json";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"

const app = express();
const router = express.Router();
const port = 8080;

const token = jwt.sign({ foo: 'bar' }, 'shhhhh');
console.log({ token });
const decoded = jwt.verify(token, 'shhhhh');
console.log(decoded)

const saltRounds = 10;
const myPlaintextPassword = "password1";

type User = { email: string, password: string, userID: string };

function storeUser(path: string, password: string, res: Response, newUser: User, users: User[]) {
  bcrypt.hash(password, saltRounds, (err, hash) => {
    // Store hash in your password DB.
    try {
      if (err) throw err;

      const newUserWithUUID = { email: newUser.email, password: hash, userID: crypto.randomUUID() };
      users.push(newUserWithUUID);

      fs.writeFile(path, JSON.stringify(users, null, 2), (err) => {
        if (err) {
          console.error("Error writing file:", err);
        } else {
          console.log("New user added successfully!", users);
          //@ts-ignore
          res.send(
            JSON.stringify({
              message: "You have been successfully added!",
              UUID: newUserWithUUID.userID,
              user: newUser.email
            }),
          );
        }
      });
    }
    catch (err) {
      if (err instanceof Error) console.error(err);
      else console.error(err);
    }
  });
}

function compareHashes(password: string, hashedPassword: string, res: Response, user: { password: string, email: string, userID: string }) {
  bcrypt.compare(password, hashedPassword, (err, result) => {
    try {
      if (err) throw err;
      console.log({ result });
      // @ts-ignore
      res.send(JSON.stringify({ result, UUID: user.userID }));
    } catch (err) {
      if (err instanceof Error) console.error(err.message);
      else console.error(JSON.stringify(err));
      // @ts-ignore
      res.status(401).send("bad password");
    }
  });
}

// function readPassword(path: string, password: string) {
//   fs.readFile(path, "utf8", (err, data) => {
//     try {
//       if (err) throw err;
//       console.log(data);
//       const parsed = JSON.parse(data);
//       const hashedPassword = parsed.password;
//       compareHashes(password, hashedPassword);
//     } catch (err) {
//       if (err instanceof Error) console.error(err.message);
//       else console.error(JSON.stringify(err));
//     }
//   });
// }

// console.log("OS:", os.networkInterfaces());
app.use(bodyParser.json());
app.use(cors());
app.use("/", express.static("../raspberry-pi-frontend/dist"));
app.use(helmet());
const testSubDirectory = "3-6-2024-connect-four2.png";
const testDirectory = `../../sams-ssd/uploads/${testSubDirectory}`;

// function directoryExists(path: string) {
//   access(path, constants.F_OK, (err) => {
//     try {
//       if (err) throw err;
//       console.log("DIRECTORY EXISTS");
//     } catch (err) {
//       console.log(err);
//       fs.mkdir(path, { recursive: true }, (err) => {
//         if (err) console.log("MKDIR ERR:", err);
//       });
//     }
//   })
// }

// function readDirectory(path: string) {
//   const files = fs.readdir(path, { withFileTypes: true, recursive: true }, (err, data) => {
//     if (err) console.log(err);
//     return data;
//   });

//   return files;
// }

// directoryExists("../../sams-ssd/uploads/samueldlay@gmail.com");
// readDirectory("../../sams-ssd/uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) =>
    cb(null, "../../sams-ssd/uploads") /* update this to not be hard-coded */,
  filename: (req, file, cb) => {
    const date = new Date();
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const currentDate = `${day}-${month}-${year}`;

    if (file.originalname) {
      cb(null, `${currentDate}-${file.originalname}`);
    } else cb(null, "NOT_A_FILENAME");
  },
});

const upload = multer({ storage });

const options = {
  key: fs.readFileSync(path.resolve(__dirname, "example.com.key")),
  cert: fs.readFileSync(path.resolve(__dirname, "example.com.crt")),
};

app.get("/test", (req, res) => {
  console.log(req);
  res.send("TEST");
})

app.get("/", (req, res) => {
  console.log("HOMEPAGE");
  res.send(path.resolve("./src/dist", "index.html"));
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send({ message: "No file uploaded." });
  }
  console.log("FILE_NAME: ", req.file.filename);
  res.send({ message: "File uploaded successfully", file: req.file });
});

// UPdate this logic and update frontend logic for user account creation
app.post("/createAccount", (req, res) => {
  const newUser: {
    email: string;
    password: string;
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

      // @ts-ignore
      storeUser(JSONpath, newUser.password, res, newUser, users);

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

app.post('/login', (req, res) => {
  console.log("LOGGING IN")
  const userLogin: { email: string, UUID: string, password: string } = req.body;

  console.log({ userLogin })
  fs.readFile(JSONpath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading file:", err);
      return;
    }
    try {
      const users = JSON.parse(data);
      console.log({ users })
      const foundUser: { password: string, email: string, userID: string } = users.find(
        (user: {
          email: string;
          password: string;
          userID: string;
        }) => user.email === userLogin.email,
      );
      console.log({ foundUser })
      if (
        foundUser
      ) {
        console.log("COMPARING HASHES");
        // @ts-ignore
        compareHashes(userLogin.password, foundUser.password, res, foundUser);
      }
      else throw new Error("USER NOT FOUND");

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

https.createServer(options, app).listen(port, () => {
  console.log(`HTTPS Server is running at https://localhost:${port}`);
});
