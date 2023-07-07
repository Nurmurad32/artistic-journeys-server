const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const app = express()
require('dotenv').config()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 3000;

// Middleware
app.use(cors())
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    console.log("authorization",authorization)
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'Unauthorized access' })
    }
    // bearer token
    const token = authorization.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'Unauthorized access' })
        }
        req.decoded = decoded;
        console.log('decoded', decoded);
        next();
    })
}


// --------------------------------------------------------------

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.frhdrfe.mongodb.net/?retryWrites=true&w=majority`;

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
        await client.connect();


        const userCollection = client.db("ArtisticJourneysDB").collection("users")
        const classCollection = client.db("ArtisticJourneysDB").collection("classes")
        const cartCollection = client.db("ArtisticJourneysDB").collection("carts")
        const paymentCollection = client.db("ArtisticJourneysDB").collection("payments")


        app.post('/jwt', (req, res) => {
            const user = req.body;
            console.log("From jwt",user);
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '2h' })
            console.log('token', token)
            console.log(process.env.ACCESS_TOKEN_SECRET)
            res.send({ token })
        })

        // Warning: use verifyJWT before using verifyAdmin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await userCollection.findOne(query);
            // const result = {admin: user?.role === 'admin'}
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'Forbidden Message' })
            }
            next();
        }
        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await userCollection.findOne(query);
            // const result = {admin: user?.role === 'admin'}
            if (user?.role !== 'instructor') {
                return res.status(403).send({ error: true, message: 'Forbidden Message' })
            }
            next();
        }
        const verifyStudent = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await userCollection.findOne(query);
            // const result = {admin: user?.role === 'admin'}
            if (user?.role !== 'student') {
                return res.status(403).send({ error: true, message: 'Forbidden Message' })
            }
            next();
        }

        // User APIs
        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })
        app.get('/users/role/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ role: null });
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            const role = user?.role || null;

            if (role === 'admin' || role === 'instructor' || role === 'student') {
                res.send({ role });
            }
            // else {
            //     res.send({ role: null });
            // }
        });


        app.post('/users', async (req, res) => {
            const user = req.body;

            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query)
            if (existingUser) {
                return res.send({ message: 'User already exists' })
            }

            const result = await userCollection.insertOne(user)
            res.send(result)
        })

        app.patch('/users/admin/:id',verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedUser = req.body;
            console.log("updatedUser-role",updatedUser)
            const user = {
                $set: {
                    role: updatedUser.role
                }
            }
            const result = await userCollection.updateOne(filter, user);
            res.send(result)
        })

        app.delete('/users/admin/:id' ,verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })

        // Class Related API
        app.get('/classes', async (req, res) => {
            const result = await classCollection.find().toArray();
            res.send(result);
        })
        app.post('/classes', verifyJWT, verifyInstructor, async (req, res) => {
            const newItem = req.body;
            const result = await classCollection.insertOne(newItem);
            res.send(result);
        })

        app.patch('/classes/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedUser = req.body;
            console.log("updatedUser",updatedUser)
            const cls = {
                $set: {
                    status: updatedUser.status
                }
            }
            const result = await classCollection.updateOne(filter, cls);
            // const insertApproved = await approvedClassCollection.insertOne(result);
            res.send(result)
        })

        app.delete('/classes/admin/:id', verifyJWT , async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await classCollection.deleteOne(query);
            res.send(result);
        })

        // cart Related APIs
        app.get('/carts', verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'Forbidden access' })
            }
            const query = { email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/carts', verifyJWT, async (req, res) => {
            const item = req.body;
            console.log(item);
            const result = await cartCollection.insertOne(item);
            res.send(result);
        })

        app.delete('/carts/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query);
            res.send(result);

        })
        // Create Payment Intent
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
                // automatic_payment_methods: {
                //   enabled: true,
                // },
            })
            res.send({
                clientSecret: paymentIntent.client_secret,
            });

        })
        // Payment Related Api
        app.get('/payments', verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'Forbidden access' })
            }
            const query = { email: email };
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })
        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            console.log(payment)
            const insertResult = await paymentCollection.insertOne(payment);

            const query = { _id: new ObjectId(payment.cartItems) }
            const deletedResult = await cartCollection.deleteOne(query);

            // Deduct enrolled seats from classCollection
            const classId = payment.classItemId;
            const classQuery = { _id: new ObjectId(classId) };
            const classUpdate = { $inc: { seat: -1 } }; // Deduct 1 from enrolledSeats
            const classUpdateResult = await classCollection.updateOne(classQuery, classUpdate);

            // Check if available seats reached 0
            const updatedClass = await classCollection.findOne(classQuery);
            if (updatedClass.seat === 0) {
                // Handle case when available seats reached 0 (e.g., prevent further enrollments)
                // Add your logic here
                return res.send({ error: true, message: 'Seat is fulled. Please wait for the next batch' })
            }

            console.log(classUpdateResult)
            res.send({ insertResult, deletedResult, classUpdateResult });
        })

        app.get('/class-status', async (req, res) => {
            const salesCountByClassItemId = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: "$classItemId",
                        count: { $sum: 1 }
                    }
                }
            ]).toArray();

            // Sort the array in ascending order based on the count property
            salesCountByClassItemId.sort((a, b) => b.count - a.count);

            const detailedClasses = await Promise.all(salesCountByClassItemId.map(async (item) => {
                const classItem = await classCollection.findOne({ _id: new ObjectId(item._id) });
                return {
                    classItemId: item._id,
                    count: item.count,
                    classItem: classItem,

                };
            }));

              res.send(detailedClasses);
        });



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

// --------------------------------------------------------------

app.get('/', (req, res) => {
    res.json('Artistic Journey is running')
})

app.listen(port, () => {
    console.log(`Artistic is sitting on port ${port}`)
})