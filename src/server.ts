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

async function verifyToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.headers.authorization) return res.status(401).send("No auth was sent");
  const token = req.headers.authorization.split(" ")[1];

  console.log("RUNNING IN LOGGER", token)

  try {
    jwt.verify(token, SECRET, (err, user) => {
      if (err) throw err;
      if (user) {
        req.body = { ...req.body, user };
        console.log("REQ BODY:", req.body);
      }
    });
  } catch (cause) {
    console.error("BIG ERROR:", JSON.stringify(cause));
    return res.status(500).send(JSON.stringify(cause));
  }

  console.log("LOG HEADERS IN LOGGER", req.headers);
  next();
}


// TODO: Environment variable?
const JSONpath = "./src/data.json";
const app = express();
const router = express.Router();
const port = 8080;
const home = os.homedir();

app.use(bodyParser.json());
app.use(cors());
app.use(helmet());
app.use("/", express.static("../raspberry-pi-frontend/dist"));

console.log("HOME:", home)

const SECRET = "test_secret";

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

    console.log("New user added successfully!", users);

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
  user: { password: string; email: string; userID: string },
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
  destination: (req, file, cb) => {
    console.log
    cb(null, "~/sams-ssd/uploads/samueldlay@gmail.com")
  }, // changed from "../../sams-ssd/uploads"
  filename: (req, file, cb) => {
    req.headers.authorization;
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
// this logic should run on refresh or any time the page is revisited
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
      const result = await compareHashes(
        userLogin.password,
        foundUser.password,
        res,
        foundUser,
      );
      if (result) {
        const token = jwt.sign({ userLogin }, SECRET);
        console.log({ token });
        // foundUser.token = token;
        // await fs.writeFile(JSONpath, JSON.stringify(users, null, 2));
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
// app.get("/", (req, res) => {
//   res.send(path.resolve("./src/dist", "index.html"));
// });

// app.use(verifyToken);

app.post("/upload", verifyToken,
  upload.single("file"),
  (req, res) => {
    res.status(200).send(JSON.stringify("UPLOADED"));
    console.log("UPLOADED");
  }
);

https.createServer(options, app).listen(port, () => {
  console.log(`HTTPS Server is running at https://localhost:${port}`);
});
