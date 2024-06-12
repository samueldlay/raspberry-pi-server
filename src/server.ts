/* RESEARCH

- Configure TypeScript (tsconfig.json)

- Why not use fs.access?
  https://en.wikipedia.org/wiki/Time-of-check_to_time-of-use

- Check out SQLite?

- Front-end
  ```js
  // https://10.0.1.110:8080/somedir/somepage.html
  fetch(new URL("/login", window.location.href), { method: "POST" });
  ```

*/

import express from "express";
import fs, { access, lstat, constants } from "node:fs/promises";
import os from "node:os";
import bodyParser from "body-parser";
import path from "node:path";
import cors from "cors";
import helmet from "helmet";
import https from "node:https";
import multer from "multer";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// TODO: Environment variable?
const JSONpath = "./src/data.json";
const app = express();
const router = express.Router();
const port = 8080;

const token = jwt.sign({ foo: "bar" }, "shhhhh");
console.log({ token });
const decoded = jwt.verify(token, "shhhhh");
console.log(decoded);

const saltRounds = 10;

type User = {
  email: string;
  password: string;
  userID: string;
};

async function storeUser(
  path: string,
  password: string,
  res: express.Response,
  newUser: User,
  users: User[],
): Promise<void> {
  try {
    // LOOK AT PROMISIFY IN NODE UTIL MOD
    const hash = await bcrypt.hash(password, saltRounds);
    // Store hash in your password DB.
    const newUserWithUUID: User = {
      email: newUser.email,
      password: hash,
      userID: crypto.randomUUID(),
    };
    users.push(newUserWithUUID);

    // use node:fs/promises
    await fs.writeFile(path, JSON.stringify(users, null, 2));

    console.log("New user added successfully!", users);

    res.send(
      JSON.stringify({
        message: "You have been successfully added!",
        UUID: newUserWithUUID.userID,
        user: newUser.email,
      }),
    );
  } catch (cause) {
    if (cause instanceof Error) {
      console.error(cause);
      res.send(cause.message);
    } else {
      console.error(cause);
      res.send(JSON.stringify(cause));
    }
  }
}

async function compareHashes(
  password: string,
  hashedPassword: string,
  res: express.Response,
  user: { password: string; email: string; userID: string },
) {
  try {
    const result = await bcrypt.compare(password, hashedPassword);
    console.log({ result });
    if (result === true)
      res.send(JSON.stringify({ result, UUID: user.userID }));
    else res.status(401).send("bad password");
  } catch (err) {
    if (err instanceof Error) {
      console.error(err.message);
      res.status(500).send(err.message);
    } else {
      console.error(JSON.stringify(err));
      res.status(500).send(JSON.stringify(err));
    }
  }
}

app.use(bodyParser.json());
app.use(cors());
app.use(helmet());
app.use("/", express.static("../raspberry-pi-frontend/dist"));

async function directoryExists(path: string) {
  try {
    await lstat(path);
    console.log("DIRECTORY EXISTS"); // but directory does not exist though?
  } catch (cause) {
    console.error(JSON.stringify(cause));
    await fs.mkdir(path, { recursive: true });
  }
}

async function readDirectory(path: string) {
  try {
    const files = await fs.readdir(path, {
      withFileTypes: true,
      recursive: true,
    });
    console.log({ files });
    return files;
  } catch (cause) {
    if (cause instanceof Error)
      console.error("FN: readDirectory", cause.message);
    else console.error("FN: readDirectory", JSON.stringify(cause));
  }
}
// not working
directoryExists("~/sams-ssd/uploads/samueldlay@gmail.com"); // changed from "../../sams-ssd/uploads"
readDirectory("~/sams-ssd/uploads"); // changed from "../../sams-ssd/uploads"

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "~/sams-ssd/uploads"), // changed from "../../sams-ssd/uploads"
  filename: (req, file, cb) => {
    const date = new Date();
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    // TODO: Pad these? e.g. 2024-06-03 not 2024-6-3
    // TODO: ymd not dmy for sorting purposes?
    const currentDate = `${day}-${month}-${year}`;

    if (file.originalname) {
      cb(null, `${currentDate}-${file.originalname}`);
    } else cb(null, "NOT_A_FILENAME");
  },
});

const upload = multer({ storage });

const options = {
  key: await fs.readFile("src/example.com.key"),
  cert: await fs.readFile("src/example.com.crt"),
};

app.get("/test", (req, res) => {
  console.log(req);
  res.send("TEST");
});

app.get("/", (req, res) => {
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
app.post("/createAccount", async (req, res) => {
  // TODO: Validate
  const newUser: User = req.body;
  try {
    const data = await fs.readFile(JSONpath, "utf8");
    const users: User[] = await JSON.parse(data);
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
    storeUser(JSONpath, newUser.password, res, newUser, users);
  } catch (cause) {
    if (cause instanceof Error) console.error(cause);
    else console.error(cause);
  }
});

app.post("/login", async (req, res) => {
  // accept header -- frontend
  console.log("LOGGING IN");
  const userLogin: User = req.body;

  console.log({ userLogin });
  try {
    const data = await fs.readFile(JSONpath, "utf8");
    const users: User[] = await JSON.parse(data);
    console.log({ users });
    const foundUser: User | undefined = users.find(
      (user: {
        email: string;
        password: string;
        userID: string;
      }) => user.email === userLogin.email,
    );
    console.log({ foundUser });
    if (foundUser) {
      console.log("COMPARING HASHES");
      await compareHashes(
        userLogin.password,
        foundUser.password,
        res,
        foundUser,
      );
    } else throw new Error("USER NOT FOUND");
  } catch (err) {
    if (err instanceof Error) {
      return err.message;
    }
    console.error("Error parsing JSON string:", err);
    res.send(JSON.stringify(err));
    return err;
  }
});

https.createServer(options, app).listen(port, () => {
  console.log(`HTTPS Server is running at https://localhost:${port}`);
});
