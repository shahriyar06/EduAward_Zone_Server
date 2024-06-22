const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;


// middleware
app.use(cors());
// app.use(cors(
//   {
//     origin: [
//       "http://localhost:5173"
//       // "https://edu-award-zone.web.app",
//       // "https://edu-award-zone.firebaseapp.com"
//     ],
//     credentials: true,
//   }
// ));
app.use(express.json());


const stripe = require("stripe")('sk_test_51PUNaqIlyHzunZkKYBXkWmM42ZK6yAVKHhDKPFOmEaR4YSHATJi7RyUDuqqO50HTYGZepr4JxKSprEqh7yHzgUhB00P9DzZCvz');
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
    const paymentCollection = client.db('EduawardDB').collection('payments');
    const applicationCollection = client.db('EduawardDB').collection('applications');
    const reviewCollection = client.db('EduawardDB').collection('reviews');

    // JWT related Api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })

    // Middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
      })
    }


    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usercollection.findOne(query);
      const isAdmin = user.role === 'Admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    const verifyModerator = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usercollection.findOne(query);
      const isModerator = user.role === 'Moderator';
      if (!isModerator) {
        return res.status(403).send({ message: 'forbidden access' });
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
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const query = { email: email };
      const user = await usercollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'Admin';
      }
      res.send({ admin });
    })

    app.get('/users/moderator/:email', verifyToken, verifyModerator, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const query = { email: email };
      const user = await usercollection.findOne(query);
      let moderator = false;
      if (user) {
        moderator = user?.role === 'Moderator';
      }
      res.send({ moderator });
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
    app.get('/scholarships', async (req, res) => {
      const result = await scholarshipcollection.find().toArray();
      res.send(result);
    })

    app.get('/scholarships/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await scholarshipcollection.findOne(query);
      res.send(result);
    })

    app.post('/scholarships', verifyToken, async (req, res) => {
      const scholarship = req.body;
      const result = await scholarshipcollection.insertOne(scholarship);
      res.send(result);
    })

    app.delete('/scholarships/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await scholarshipcollection.deleteOne(query);
      res.send(result);
    })

    // Payment Api
    // server for the payment gateway Stripe

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100)

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });



    app.get('/payments/:email', async (req, res) => {

      const query = { email: req.params.email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })


    // save payment data and clear users cart
    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      res.send({ paymentResult})
    })


    // Application related api
    app.get('/applications', async (req, res) => {
      const result = await applicationCollection.find().toArray();
      res.send(result);
    })

    app.get('/applications/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await applicationCollection.findOne(query);
      res.send(result);
    })


    app.post('/applications', async (req, res) => {
      const application = req.body;
      const result = await applicationCollection.insertOne(application);
      res.send(result);
    })

    app.delete('/applications/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await applicationCollection.deleteOne(query);
      res.send(result);
    })

    // Review api
    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    })

    app.post('/reviews', async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
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