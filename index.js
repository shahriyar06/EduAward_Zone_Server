const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;


// middleware
app.use(cors(
  {
    origin: [
      "http://localhost:5173"
      // "https://kajer-khoj.web.app",
      // "https://kajer-khoj.firebaseapp.com"
    ],
    credentials: true,
  }
));
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_USER_PASS}@cluster0.qexkjce.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const usercollection = client.db('EduawardDB').collection('users');
    const scholarshipcollection = client.db('EduawardDB').collection('scholarships');

    // JWT related Api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token =  jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({token});
      })

    // Middlewares
    const verifyToken = (req, res, next) =>{
      if(!req.headers.authorization){
        return res.status(401).send({message: 'unauthorized access'});
      }
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) =>{
        if(err){
          return res.status(401).send({message: 'unauthorized access'});
        }
        req.decoded= decoded;
        next();
      })
    }


    const verifyAdmin = async (req, res, next) =>{
      const email = req.decoded.email;
      const query = {email: email};
      const user = await usercollection.findOne(query);
      const isAdmin = user.role === 'Admin';
      if(!isAdmin){
        return res.status(403).send({message: 'forbidden access'});
      }
      next();
    }

    const verifyModerator = async (req, res, next) =>{
      const email = req.decoded.email;
      const query = {email: email};
      const user = await usercollection.findOne(query);
      const isModerator = user.role === 'Moderator';
      if(!isModerator){
        return res.status(403).send({message: 'forbidden access'});
      }
      next();
    }


    // User related Api
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await usercollection.find().toArray();
      res.send(result);
    })

    app.get('/users/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await usercollection.findOne(email);
      res.send(result);
    })

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if(email !== req.decoded.email){
        return res.status(403).send({message: 'forbidden access'});
      }
      const query = {email: email};
      const user = await usercollection.findOne(query);
      let admin = false ;
      if(user){
        admin = user?.role === 'Admin';
      }
      res.send({admin});
    })

    app.get('/users/moderator/:email', verifyToken, verifyModerator, async (req, res) => {
      const email = req.params.email;
      if(email !== req.decoded.email){
        return res.status(403).send({message: 'forbidden access'});
      }
      const query = {email: email};
      const user = await usercollection.findOne(query);
      let moderator = false ;
      if(user){
        moderator = user?.role === 'Moderator';
      }
      res.send({moderator});
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await usercollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await usercollection.insertOne(user);
      res.send(result);
    })

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const update = req.body;
      const updateduser = {
        $set: {
          role: update.role
        }
      }
      const result = await usercollection.updateOne(filter, updateduser);
      res.send(result);
    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usercollection.deleteOne(query);
      res.send(result);
    })


    // Schoarship related api
    app.post('/scholarships', async (req, res)=>{
      const scholarship = req.body;
      const result = await scholarshipcollection.insertOne(scholarship);
      res.send(result);
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('EduAward-Zone-server is running...')
})

app.listen(port, () => {
  console.log(`EduAward-Zone-server is running on port : ${port}`)
})