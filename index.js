require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')

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
    const token = req.cookies?.token

    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.log(err)
            return res.status(401).send({ message: 'unauthorized access' })
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
    try {
        // Generate jwt token
        app.post('/jwt', async (req, res) => {
            const email = req.body
            const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '365d',
            })
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true })
        })
        // Logout
        app.get('/logout', async (req, res) => {
            try {
                res
                    .clearCookie('token', {
                        maxAge: 0,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    })
                    .send({ success: true })
            } catch (err) {
                res.status(500).send(err)
            }
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
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })
        // Update user role by ID for (ManageUsers page) and store it in the DB 
        app.patch('/users/role/:id', async (req, res) => {
            const id = req.params.id
            const { role } = req.body

            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { role } }
            )

            res.send(result)
        })
        // send medicine data in the DB for (ManageMedicines page)
        app.post('/medicines', async (req, res) => {
            const newMedicine = req.body
            const result = await medicinesCollection.insertOne(newMedicine)
            res.send(result)
        })
        // GET all medicines from the DB
        app.get('/medicines', async (req, res) => {
            const result = await medicinesCollection.find().toArray()
            res.send(result)
        })
        // Save selected medicine data in the db with quantity and subtotal
        app.post('/carts', async (req, res) => {
            const cartItem = req.body
            cartItem.quantity = 0
            cartItem.subtotal = 0

            // Prevent duplication by checking for medicineId
            const existing = await cartsCollection.findOne({ medicineId: cartItem.medicineId })
            if (existing) {
                return res.status(409).send({ message: 'Already in cart' }) // conflict status
            }

            const result = await cartsCollection.insertOne(cartItem)
            res.send(result)
        })
        // get all the cats data form the db
        app.get('/carts', async (req, res) => {
            const result = await cartsCollection.find().toArray()
            res.send(result)
        })
        // Update quantity and subtotal of a cart item
        app.patch('/carts/:id', async (req, res) => {
            const id = req.params.id
            const { quantity, stock, subtotal } = req.body

            const result = await cartsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { quantity, stock, subtotal } }
            )

            res.send(result)
        })
        // Delete a specific cart item
        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id
            const result = await cartsCollection.deleteOne({ _id: new ObjectId(id) })
            res.send(result)
        })
        // Clear all cart items
        app.delete('/carts', async (req, res) => {
            const result = await cartsCollection.deleteMany({})
            res.send(result)
        })
        // Save checkout data with items and grand total
        app.post('/checkout', async (req, res) => {
            const checkoutData = req.body
            const result = await checkoutCollection.insertOne(checkoutData)
            res.send(result)
        })
        // 1. Create category (POST /categories)
        app.post('/categories', async (req, res) => {
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
        app.delete('/categories/:id', async (req, res) => {
            const id = req.params.id
            const result = await categoriesCollection.deleteOne({ _id: new ObjectId(id) })
            res.send(result)
        })

        // 4. Update category (PATCH /categories/:id)
        app.patch('/categories/:id', async (req, res) => {
            const id = req.params.id
            const updatedData = req.body
            const result = await categoriesCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updatedData }
            )
            res.send(result)
        })
        // update the request property
        app.patch('/medicines/request/:id', async (req, res) => {
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
        app.get('/medicines/requested', async (req, res) => {
            try {
                const result = await medicinesCollection.find({ requested: true }).toArray()
                res.send(result)
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch requested medicines', error: err.message })
            }
        })
        // Update 'advertised' to true
        app.patch('/medicines/advertise/:id', async (req, res) => {
            const id = req.params.id
            try {
                const result = await medicinesCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { advertised: true } }
                )
                res.send(result)
            } catch (err) {
                res.status(500).send({ message: 'Failed to update advertised field', error: err.message })
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
