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
