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
    origin: ['http://localhost:5173', 'http://localhost:5174'],
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
        // get all users form DB
        app.get('/users', verifyAdmin, async (req, res) => {
            const email = req.query.email
            if (email) {
                const user = await usersCollection.findOne({ email })
                return res.send(user)
            }

            const users = await usersCollection.find().toArray()
            res.send(users)
        })
        // Update user role by ID for (ManageUsers page) and store it in the DB 
        app.patch('/users/role/:id', verifyAdmin, async (req, res) => {
            const id = req.params.id
            const { role } = req.body

            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { role } }
            )

            res.send(result)
        })
        // send medicine data in the DB for (ManageMedicines page)
        app.post('/medicines', verifyToken, verifySeller, async (req, res) => {
            const newMedicine = req.body
            const result = await medicinesCollection.insertOne(newMedicine)
            res.send(result)
        })
        // GET all medicines OR only seller's medicines
        app.get('/medicines', async (req, res) => {
            const seller = req.query.seller;

            try {
                const filter = seller ? { seller } : {}; // if seller query present, filter by seller
                const result = await medicinesCollection.find(filter).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch medicines', error: err.message });
            }
        });
        // Save selected medicine data in the db with quantity and subtotal
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
        // Update quantity and subtotal of a cart item
        app.patch('/carts/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const { quantity, stock, subtotal } = req.body

            const result = await cartsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { quantity, stock, subtotal } }
            )

            res.send(result)
        })
        // Delete a specific cart item
        app.delete('/carts/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const result = await cartsCollection.deleteOne({ _id: new ObjectId(id) })
            res.send(result)
        })
        // Clear all cart items
        app.delete('/carts', verifyToken, async (req, res) => {
            const result = await cartsCollection.deleteMany({})
            res.send(result)
        })
        // Save checkout data with items and grand total
        app.post('/checkout', verifyToken, async (req, res) => {
            const checkoutData = req.body
            const result = await checkoutCollection.insertOne(checkoutData)
            res.send(result)
        })
        // 1. Create category (POST /categories)
        app.post('/categories', verifyToken, verifySeller, async (req, res) => {
            const newCategory = req.body
            const result = await categoriesCollection.insertOne(newCategory)
            res.send(result)
        })

        // 2. Get all categories (GET /categories)
        app.get('/categories', async (req, res) => {
            const result = await categoriesCollection.find().toArray()
            res.send(result)
        })

        // 3. Delete category (DELETE /categories/:id)
        app.delete('/categories/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const result = await categoriesCollection.deleteOne({ _id: new ObjectId(id) })
            res.send(result)
        })

        // 4. Update category (PATCH /categories/:id)
        app.patch('/categories/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const updatedData = req.body
            const result = await categoriesCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updatedData }
            )
            res.send(result)
        })
        // update the request property
        app.patch('/medicines/request/:id', verifyToken, verifySeller, async (req, res) => {
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
        // Get only requested medicines
        app.get('/medicines/requested', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const result = await medicinesCollection.find({ requested: true }).toArray()
                res.send(result)
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch requested medicines', error: err.message })
            }
        })
        // Update 'advertised' to true
        app.patch('/medicines/advertise/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const { advertised } = req.body  // get boolean from client

            if (typeof advertised !== 'boolean') {
                return res.status(400).send({ message: 'Invalid advertised value' })
            }

            try {
                const result = await medicinesCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { advertised } }   // use the value from client
                )
                res.send(result)
            } catch (err) {
                res.status(500).send({ message: 'Failed to update advertised field', error: err.message })
            }
        })
        // get only advertised medicines
        app.get('/medicines/advertised', async (req, res) => {
            try {
                const result = await medicinesCollection.find({ advertised: true }).toArray()
                res.send(result)
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch advertised medicines', error: err.message })
            }
        })
        // Get only discounted medicines
        app.get('/medicines/discounted', async (req, res) => {
            try {
                const result = await medicinesCollection.find({ discount: { $gt: 0 } }).toArray()
                res.send(result)
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch discounted medicines', error: err.message })
            }
        })
        // Get medicines by category
        app.get('/medicines/category/:category', async (req, res) => {
            const category = req.params.category;
            try {
                const result = await medicinesCollection.find({ category }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch category medicines', error: err.message });
            }
        });
        // Stripe payment intent
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
        // Save payment after success (status = pending)
        app.post('/payments', verifyToken, async (req, res) => {
            const paymentData = req.body
            const result = await paymentsCollection.insertOne(paymentData)
            // clear the user's cart after successful payment
            await cartsCollection.deleteMany({ userEmail: paymentData?.userEmail })
            // Clear the user's checkout collection
            await checkoutCollection.deleteMany({ userEmail: paymentData?.userEmail });
            res.send(result)
        })
        // Get all payment information (filtered by email)
        app.get('/payments', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.query.email
            const type = req.query.type // 'seller', 'buyer', or undefined for admin

            try {
                let result = []

                if (email && type === 'seller') {
                    // Seller view
                    result = await paymentsCollection.find({ 'items.seller': email }).toArray()
                } else if (email && type === 'buyer') {
                    // Buyer view
                    result = await paymentsCollection.find({ userEmail: email }).toArray()
                } else {
                    // Admin view - get all
                    result = await paymentsCollection.find().toArray()
                }

                res.send(result)
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch payments', error: err.message })
            }
        })

        // Update payment status to 'paid'
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
        await client.db('admin').command({ ping: 1 })
        console.log(
            'Pinged your deployment. You successfully connected to MongoDB!'
        )
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
