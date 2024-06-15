/* RESEARCH

- Why not use fs.access?
  https://en.wikipedia.org/wiki/Time-of-check_to_time-of-use

- Store user data using SQLite?

- Front-end
  ```js
  // https://10.0.1.110:8080/somedir/somepage.html
  fetch(new URL("/login", window.location.href), { method: "POST" });
  ```

*/

import express from "express";
import fs, { lstat } from "node:fs/promises";
import os from "node:os";
import bodyParser from "body-parser";
import path from "node:path";
import cors from "cors";
import helmet from "helmet";
import https from "node:https";
import multer from "multer";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

type CurrentUser = {
  email?: string;
  userID?: string;
}

type jwtUserPayload = {
  foundUser: CurrentUser;
}

const home = os.homedir();

function userState(currentUser: CurrentUser) {
  const uploadPath = `${home}/sams-ssd/uploads/${currentUser.userID}`;
  return { ...currentUser, uploadPath };
}

let state: CurrentUser & { uploadPath?: string } = {};

async function verifyToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.headers.authorization) return res.status(401).send("No auth was sent");
  const token = req.headers.authorization.split(" ")[1];

  try {
    jwt.verify(token, SECRET, (err, user) => {
      if (err) {
        throw err;
      }
      if (user) {
        const { foundUser } = user as jwtUserPayload; // create proper data type for this
        // currentUser.email = foundUser.email;
        // currentUser.userID = foundUser.userID;
        state = userState({ email: foundUser.email, userID: foundUser.userID });
      }
    });
  } catch (cause) {
    if (cause instanceof Error) console.error("BIG ERROR:", JSON.stringify(cause.message));
    else console.error(JSON.stringify(cause));
    return res.status(500).send(JSON.stringify(cause));
  }
  next();
}
// TODO: Environment variables?
const SECRET = "test_secret";
const JSONpath = "./src/data.json";
const app = express();
const port = 8080;

app.use(bodyParser.json());
app.use(cors());
app.use(helmet());
app.use("/", express.static("../raspberry-pi-frontend/dist"));

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
    const hash = await bcrypt.hash(password, saltRounds);
    const newUserWithUUID: User = {
      email: newUser.email,
      password: hash,
      userID: crypto.randomUUID(),
    };
    users.push(newUserWithUUID);

    await fs.writeFile(path, JSON.stringify(users, null, 2));

    await fs.mkdir(`${home}/sams-ssd/uploads/${newUserWithUUID.userID}`, { recursive: true });

    res.send(
      JSON.stringify({
        message: "You have been successfully added!",
        userID: newUserWithUUID.userID,
        email: newUser.email,
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
) {
  try {
    const result = await bcrypt.compare(password, hashedPassword);
    return result;
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

async function directoryExists(path: string) {
  try {
    await lstat(path);
  } catch (cause) {
    console.error("Diretory error:", JSON.stringify(cause));
    await fs.mkdir(path, { recursive: true });
  }
}

async function readDirectory(path: string) {
  try {
    const files = await fs.readdir(path, {
      withFileTypes: true,
      recursive: true,
    });
    return files;
  } catch (cause) {
    if (cause instanceof Error)
      console.error("FN: readDirectory", cause.message);
    else console.error("FN: readDirectory", JSON.stringify(cause));
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // const userID = currentUser.userID; // create proper data type for this
    if (state.userID && state.uploadPath) {
      // directoryExists(`${home}/sams-ssd/uploads/${userID}`);
      // readDirectory(`${home}/sams-ssd/uploads/${userID}`);
      // cb(null, `${home}/sams-ssd/uploads/${userID}`);
      directoryExists(state.uploadPath);
      readDirectory(state.uploadPath);
      cb(null, state.uploadPath);
    }
    else throw new Error("HANDLE THIS STORAGE ERROR");
  }, // changed from "../../sams-ssd/uploads"
  filename: (req, file, cb) => {
    req.headers.authorization;
    const date = new Date();
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    // TODO: Pad these? e.g. 2024-06-03 not 2024-6-3
    const currentDate = `${year}-${month}-${day}`;

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

app.post("/createAccount", async (req, res) => {
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
  const userLogin: User = req.body;

  try {
    const data = await fs.readFile(JSONpath, "utf8");
    const users: User[] = await JSON.parse(data);
    const foundUser: User | undefined = users.find(
      (user: {
        email: string;
        password: string;
        userID: string;
      }) => user.email === userLogin.email,
    );
    if (foundUser) {
      const result = await compareHashes(
        userLogin.password,
        foundUser.password,
        res,
      );
      if (result) {
        const token = jwt.sign({ foundUser }, SECRET);
        res.send(JSON.stringify({ result, userID: userLogin.userID, email: userLogin.email, token }));
      }
    } else res.status(401).send("That user or password does not exist");
  } catch (err) {
    if (err instanceof Error) {
      return err.message;
    }
    console.error("Error", err);

    return err;
  }
});

// app.use(verifyToken);

app.post("/upload", verifyToken,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!state.uploadPath) throw new Error("Upload path undefined");
      const files = await readDirectory(state.uploadPath);
      res.status(200).send(JSON.stringify(files));
    } catch (cause) {
      if (cause instanceof Error) console.error(cause.message);
      else console.error(JSON.stringify(cause));
    }

  }
);

https.createServer(options, app).listen(port, () => {
  console.log(`HTTPS Server is running at https://localhost:${port}`);
});
