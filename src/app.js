import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import Joi from "joi";
import dayjs from "dayjs";
import bcrypt from "bcrypt";

const app = express();
app.use(cors());
app.use(express.json());

dotenv.config();
const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

mongoClient.connect().then(() => {
  db = mongoClient.db();
  console.log("conectado");
});

app.post("/cadastro", async (req, res) => {
  console.log(req.body);
  const user = req.body;
  const userJoi = Joi.object({
    name: Joi.string().min(1).required(),
    email: Joi.string().min(1).email().required(),
    password: Joi.string().min(3).required(),
  });
  const validation = userJoi.validate(user);
  if (validation.error) {
    return res.status(422).send("Verifique os dados e tente novamente!");
  }

  const usuarioExiste = await db
    .collection("users")
    .findOne({ email: req.body?.email.toLowerCase() });

  if (usuarioExiste) {
    return res.status(409).send("usuario já registrado!");
  }
  const hashPass = await bcrypt.hash(req.body?.password, 8);
  console.log(hashPass);
  const userC = await db.collection("users").insertOne({
    name: req.body?.name,
    email: req.body?.email.toLowerCase(),
    password: hashPass,
    createdtime: dayjs().format("DD:MM:YYYY HH:mm:ss"),
    edittime: dayjs().format("DD:MM:YYYY HH:mm:ss"),
  });
  await db.collection("accounts").insertOne({
    userId: userC.insertedId,
    saldo: 0.0,
    createdtime: dayjs().format("DD/MM/YYYY HH:mm:ss"),
    edittime: dayjs().format("DD/MM/YYYY HH:mm:ss"),
  });

  return res.sendStatus(201);
});

app.post("/login", async (req, res) => {
  const login = req.body;
  const loginJoy = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  });
  const validation = loginJoy.validate(login);
  if (validation.error) {
    console.log("error");
    return res.status(422).send("verifique os dados e tente novamente!");
  }
  const userDb = await db.collection("users").findOne({ email: login.email });
  if (userDb) {
    const comparation = await bcrypt.compare(
      req.body.password,
      userDb.password
    );
    if (userDb && comparation) {
      const accountObject = await db
        .collection("accounts")
        .findOne({ userId: userDb._id });
      const userObject = {
        token: userDb._id,
        name: userDb.name,
        email: userDb.email,
        saldo: accountObject.saldo,
      };
      res.status(200).send(userObject);
    }
    return res.sendStatus(404)
  }else {
    res.sendStatus(404);
  }
});
app.post("/extracts", async (req, res) => {
  const objectIdUser = new ObjectId(req.headers?.authorization);
  const userExist = await db.collection("users").findOne({ _id: objectIdUser });

  if (userExist) {
    const extractEnterExit = req.body;
    const extractEnterExitJoi = Joi.object({
      value: Joi.number().required(),
      description: Joi.string().min(1).required(),
      type: Joi.string().valid("entrada", "saida").required(),
    });
    const validation = extractEnterExitJoi.validate(extractEnterExit);

    if (validation.error)
      return res.status(422).send("verifique os dados e tente novamente!");

    const userAccount = await db
      .collection("accounts")
      .findOne({ userId: objectIdUser });


    await db.collection("extracts").insertOne({
      accountId: userAccount._id,
      value: parseInt(req.body?.value),
      description: req.body?.description,
      type: req.body?.type,
      date: dayjs().format("DD/MM"),
    });
    if (req.body.type === "entrada") {
      await db
        .collection("accounts")
        .updateOne(
          { _id: userAccount._id },
          { $set: { saldo: userAccount.saldo + parseInt(req.body?.value) } }
        );
      return res.sendStatus(201);
    }
    await db
      .collection("accounts")
      .updateOne(
        { _id: userAccount._id },
        { $set: { saldo: userAccount.saldo - req.body?.value } }
      );
    return res.sendStatus(201);
  }
  res.sendStatus(404);
});

app.get("/extracts", async (req, res) => {
  const objectIdUser = new ObjectId(req.headers?.authorization);
  const userExist = await db.collection("users").findOne({ _id: objectIdUser });
  if (userExist) {
    const userAccount = await db
      .collection("accounts")
      .findOne({ userId: objectIdUser });
    const extractsUser = await db
      .collection("extracts")
      .find({ accountId: userAccount._id })
      .toArray();

    const returnObject = extractsUser.map((e) => ({
      value: e.value.toFixed(2).replace(".", ",").replace("-",""),
      description: e.description,
      type: e.type,
      date: e.date,
    }));

    return res.status(200).send(returnObject);
  }
  return res.sendStatus(404);
});
app.get("/saldo", async (req, res) => {
  const objectIdUser = new ObjectId(req.headers?.authorization);
  const userExist = await db.collection("users").findOne({ _id: objectIdUser });
  if (userExist) {
    const data = await db
      .collection("accounts")
      .findOne({ userId: objectIdUser });
    const saldo = data.saldo;
    return res.send(`${saldo}`);
  }
  return res.sendStatus(404);
});
app.get("/teste", (req, res) => {
  res.send("testando");
});
app.listen(5000, () => console.log("server open"));
