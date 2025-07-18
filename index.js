require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const stripe = require('stripe')(process.env.STRIPE_SK_KEY)

const port = process.env.PORT || 4000
const app = express()
// middleware
const corsOptions = {
    origin: ['http://localhost:5173', 'http://localhost:5174', 'https://assignment-12-a7eae.web.app'],
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send({ message: 'Unauthorized access' })
    }

    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.user = decoded
        next()
    })
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
})
async function run() {
    const db = client.db('MedEasyDB')
    const usersCollection = db.collection('users')
    const medicinesCollection = db.collection('medicines')
    const cartsCollection = db.collection('carts')
    const checkoutCollection = db.collection('checkout');
    const categoriesCollection = db.collection('categories')
    const paymentsCollection = db.collection('payments')
    try {
        const verifyAdmin = async (req, res, next) => {
            const email = req?.user?.email
            const user = await usersCollection.findOne({
                email,
            })
            console.log(user?.role)
            if (!user || user?.role !== 'admin')
                return res
                    .status(403)
                    .send({ message: 'Admin only Actions!', role: user?.role })

            next()
        }
        const verifySeller = async (req, res, next) => {
            const email = req?.user?.email
            const user = await usersCollection.findOne({
                email,
            })
            console.log(user?.role)
            if (!user || user?.role !== 'seller')
                return res
                    .status(403)
                    .send({ message: 'Seller only Actions!', role: user?.role })

            next()
        }
        // generate JWT token
        app.post('/jwt', async (req, res) => {
            const email = req.body.email
            if (!email) return res.status(400).send({ message: 'Email is required' })

            const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '365d',
            })

            res.send({ token })
        })



        // save user data in the DB
        app.post('/user', async (req, res) => {
            const { name, email, role } = req.body
            if (!email) return res.status(400).send({ message: 'Email required' })

            const existingUser = await usersCollection.findOne({ email })

            if (existingUser) {
                return res.status(200).send({ message: 'User already exists' })
            }

            const result = await usersCollection.insertOne({ name, email, role })
            res.send(result)
        })
        // get all users data form the DB
        app.get('/users', verifyToken, async (req, res) => {
            const email = req.query.email
            if (email) {
                const user = await usersCollection.findOne({ email })
                return res.send(user)
            }

            const users = await usersCollection.find().toArray()
            res.send(users)
        })
        // Update user role by ID and store it in the DB 
        app.patch('/users/role/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const { role } = req.body

            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { role } }
            )

            res.send(result)
        })



        // save medicine data in the db with quantity and subtotal
        app.post('/carts', verifyToken, async (req, res) => {
            const cartItem = req.body

            if (!cartItem.userEmail) {
                return res.status(400).send({ message: 'userEmail is required' })
            }

            cartItem.quantity = 0
            cartItem.subtotal = 0

            const existing = await cartsCollection.findOne({ medicineId: cartItem.medicineId, userEmail: cartItem.userEmail })
            if (existing) {
                return res.status(409).send({ message: 'Already in cart' })
            }

            const result = await cartsCollection.insertOne(cartItem)
            res.send(result)
        })
        // get all the cats data form the db
        app.get('/carts', verifyToken, async (req, res) => {
            const userEmail = req.query?.email
            if (!userEmail) {
                return res.status(400).send({ message: 'Missing user email' })
            }
            const result = await cartsCollection.find({ userEmail }).toArray()
            res.send(result)
        })
        // Update quantity , stock, and subtotal properties and store it in the db
        app.patch('/carts/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const { quantity, stock, subtotal } = req.body

            const result = await cartsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { quantity, stock, subtotal } }
            )

            res.send(result)
        })
        // delete specific cart data in the db
        app.delete('/carts/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const result = await cartsCollection.deleteOne({ _id: new ObjectId(id) })
            res.send(result)
        })
        // delete all carts data in the db
        app.delete('/carts', verifyToken, async (req, res) => {
            const result = await cartsCollection.deleteMany({})
            res.send(result)
        })



        // save checkout data in the db
        app.post('/checkout', verifyToken, async (req, res) => {
            const checkoutData = req.body
            const result = await checkoutCollection.insertOne(checkoutData)
            res.send(result)
        })



        // save categories data in the db
        app.post('/categories', verifyToken, verifyAdmin, async (req, res) => {
            const newCategory = req.body
            const result = await categoriesCollection.insertOne(newCategory)
            res.send(result)
        })
        // get all categories data in the db
        app.get('/categories', async (req, res) => {
            const result = await categoriesCollection.find().toArray()
            res.send(result)
        })
        // 3. delete a specific category data in the db
        app.delete('/categories/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const result = await categoriesCollection.deleteOne({ _id: new ObjectId(id) })
            res.send(result)
        })
        // 4. Update a specific category data in the db
        app.patch('/categories/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const updatedData = req.body
            const result = await categoriesCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updatedData }
            )
            res.send(result)
        })


        // save medicine data in the DB
        app.post('/medicines', verifyToken, verifySeller, async (req, res) => {
            const newMedicine = req.body
            const result = await medicinesCollection.insertOne(newMedicine)
            res.send(result)
        })
        // get medicines data form the db
        app.get('/medicines', async (req, res) => {
            const seller = req.query.seller;
            try {
                const filter = seller ? { seller } : {};
                const result = await medicinesCollection.find(filter).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch medicines', error: err.message });
            }
        });
        // update requested = true form the db
        app.patch('/medicines/request/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            try {
                const result = await medicinesCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { requested: true } }
                )
                res.send(result)
            } catch (err) {
                res.status(500).send({ message: 'Failed to update requested field', error: err.message })
            }
        })
        // get all requested medicines form the db
        app.get('/medicines/requested', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const result = await medicinesCollection.find({ requested: true }).toArray()
                res.send(result)
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch requested medicines', error: err.message })
            }
        })
        // update advertise properties true in the db
        app.patch('/medicines/advertise/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const { advertised } = req.body

            if (typeof advertised !== 'boolean') {
                return res.status(400).send({ message: 'Invalid advertised value' })
            }

            try {
                const result = await medicinesCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { advertised } }
                )
                res.send(result)
            } catch (err) {
                res.status(500).send({ message: 'Failed to update advertised field', error: err.message })
            }
        })
        // get all advertised medicines in the db
        app.get('/medicines/advertised', async (req, res) => {
            try {
                const result = await medicinesCollection.find({ advertised: true }).toArray()
                res.send(result)
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch advertised medicines', error: err.message })
            }
        })
        // get all discounted medicines in the db
        app.get('/medicines/discounted', async (req, res) => {
            try {
                const result = await medicinesCollection.find({ discount: { $gt: 0 } }).toArray()
                res.send(result)
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch discounted medicines', error: err.message })
            }
        })
        // get all medicines by category in the db
        app.get('/medicines/category/:category', async (req, res) => {
            const category = req.params.category;
            try {
                const result = await medicinesCollection.find({ category }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch category medicines', error: err.message });
            }
        });



        // create stripe payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { amount } = req.body;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(amount * 100),
                currency: 'usd',
                automatic_payment_methods: {
                    enabled: true,
                },
            });

            res.send({ clientSecret: paymentIntent.client_secret });
        });
        // save payments data in the db
        app.post('/payments', verifyToken, async (req, res) => {
            const paymentData = req.body
            const result = await paymentsCollection.insertOne(paymentData)

            await cartsCollection.deleteMany({ userEmail: paymentData?.userEmail })
            await checkoutCollection.deleteMany({ userEmail: paymentData?.userEmail });

            res.send(result)
        })
        // Get all user role based on email in the db
        app.get('/payments', verifyToken, async (req, res) => {
            const email = req.query.email
            const type = req.query.type

            try {
                let result = []

                if (email && type === 'seller') {
                    result = await paymentsCollection.find({ 'items.seller': email }).toArray()
                } else if (email && type === 'buyer') {
                    result = await paymentsCollection.find({ userEmail: email }).toArray()
                } else {
                    result = await paymentsCollection.find().toArray()
                }

                res.send(result)
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch payments', error: err.message })
            }
        })

        // update payment status and store it in the db
        app.patch('/payments/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const { status } = req.body

            try {
                const result = await paymentsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status } }
                )

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: 'Payment status updated' })
                } else {
                    res.status(404).send({ success: false, message: 'Payment not found or already updated' })
                }
            } catch (err) {
                res.status(500).send({ success: false, message: 'Failed to update payment', error: err.message })
            }
        })



        // Send a ping to confirm a successful connection
        // await client.db('admin').command({ ping: 1 })
        // console.log(
        //     'Pinged your deployment. You successfully connected to MongoDB!'
        // )
    } finally {
        // Ensures that the client will close when you finish/error
    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello from MedEasy Server..')
})

app.listen(port, () => {
    console.log(`MedEasy is running on port ${port}`)
})
