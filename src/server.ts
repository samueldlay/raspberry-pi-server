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
import cors from "cors";
import helmet from "helmet";
import https from "node:https";
import multer from "multer";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

async function loadEnv(): Promise<void> {
  try {
    const env = await fs.readFile("./.env", { encoding: "utf8" });

    for (const newLine of env.split("\n")) {
      const [name, value] = newLine.split("=");
      if (name && value) {
        process.env[name] = value;
      }
    }
  } catch (cause) {
    if (cause instanceof Error) console.error(cause.message);
    else console.error(JSON.stringify(cause));
  }
}

await loadEnv();

// TODO: Environment variables?
const SECRET = process.env.SECRET as string;
const JSONpath = "./src/data.json";
const app = express();
const port = process.env.PORT;

const options = {
  key: await fs.readFile("src/localhost.key"),
  cert: await fs.readFile("src/localhost.crt"),
};

app.use(bodyParser.json());
app.use(cors());
app.use(helmet());
app.use("/", express.static("../raspberry-pi-frontend/dist"));

const saltRounds = 10;

function useState<T>(initialState: T): [() => T, (newState: T) => void] {
  let state: T = initialState;
  const getState = () => state;
  const updateState = (newState: T) => {
    state = newState;
  };

  return [getState, updateState];
}

type CurrentUser = {
  email: string;
  userID: string;
  uploadPath: string;
};

type jwtUserPayload = {
  foundUser: CurrentUser;
};

const home = os.homedir();
const userCreatedPath = "sams-ssd";

function generateUploadPath(
  homePath: string,
  userCreatedPath: string,
  userID: string,
) {
  return `${homePath}/${userCreatedPath}/uploads/${userID}`;
}

async function verifyToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (!req.headers.authorization)
    return res.status(401).send("No auth was sent");
  const token = req.headers.authorization.split(" ")[1];
  try {
    jwt.verify(token, SECRET, (err, user) => {
      if (err) {
        throw err;
      }
      if (user) {
        const { foundUser } = user as jwtUserPayload; // create proper data type for this
        res.locals.user = {
          email: foundUser.email,
          userID: foundUser.userID,
          uploadPath: generateUploadPath(
            home,
            userCreatedPath,
            foundUser.userID,
          ),
        }

      }
    });
  } catch (cause) {
    if (cause instanceof Error)
      console.error("BIG ERROR:", JSON.stringify(cause.message));
    else console.error(JSON.stringify(cause));
    return res.status(500).send(JSON.stringify(cause));
  }
  next();
}

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

    const uploadPath = generateUploadPath(
      home,
      userCreatedPath,
      newUserWithUUID.userID,
    );

    await fs.mkdir(uploadPath, {
      recursive: true,
    });

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
      console.error(cause.message);
    else console.error(JSON.stringify(cause));
  }
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const currUser: CurrentUser = req.res?.locals.user
    if (currUser.userID && currUser.uploadPath) {
      await directoryExists(currUser.uploadPath);
      cb(null, currUser.uploadPath);
    } else throw new Error("HANDLE THIS STORAGE ERROR");
  },
  filename: (req, file, cb) => {
    if (file.originalname) {
      cb(null, `${file.originalname}`);
    } else cb(null, "NOT_A_FILENAME");
  },
});

const upload = multer({ storage });

app.post("/api/createAccount", async (req, res) => {
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

app.post("/api/login", async (req, res) => {
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
      const uploadPath = generateUploadPath(
        home,
        userCreatedPath,
        foundUser.userID,
      );
      if (result) {
        const token = jwt.sign({ foundUser }, SECRET);
        const files = await readDirectory(uploadPath);
        const mapped = files
          ?.filter((file) => file.name !== ".DS_Store")
          .map((file) => file.name);
        res.send(
          JSON.stringify({
            result,
            userID: foundUser.userID,
            email: foundUser.email,
            mapped,
            token,
          }),
        );
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

app.post("/api/files", verifyToken, async (req, res) => {
  try {
    const user: User = req.body;
    if (!user) throw new Error("Upload path undefined");
    const uploadPath = generateUploadPath(home, userCreatedPath, user.userID);
    await directoryExists(uploadPath);
    const unfilteredFiles = await readDirectory(uploadPath);
    const files = unfilteredFiles
      ?.filter((file) => file.name !== ".DS_Store")
      .map((file) => file.name);
    res.send(files);
  } catch (cause) {
    if (cause instanceof Error) console.error(cause.message);
    else console.error(JSON.stringify(cause));
  }
});

// app.use(verifyToken);

app.post(
  "/api/upload",
  verifyToken,
  upload.single("file"),
  async (req, res) => {
    try {
      const user: CurrentUser = res.locals.user;
      if (!Object.keys(user).length) throw new Error("Upload path undefined");
      await directoryExists(user.uploadPath);
      const files = await readDirectory(user.uploadPath);
      const mapped = files
        ?.filter((file) => file.name !== ".DS_Store")
        .map((file) => file.name);
      res.status(200).send(mapped);
    } catch (cause) {
      if (cause instanceof Error) console.error(cause.message);
      else console.error(JSON.stringify(cause));
    }
  },
);

https.createServer(options, app).listen(port, () => {
  console.log(`HTTPS Server is running at https://localhost:${port}`);
});
