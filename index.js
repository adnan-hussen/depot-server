import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { initDb, saveUser, getUserById, 
    getUserByEmail, getUserByGoogleId, updateGoogleId, 
    getLocalUser, saveFileMetadata, getFileById,
    deleteFileMetadata, getFilesForUser, usedSpace} from './config/db.js';

import passport from 'passport';
import session from 'express-session';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import bcrypt from 'bcryptjs';

import { createClient } from 'redis';
import {RedisStore} from 'connect-redis';

import multer from "multer";
import { uploadFile, downloadFile, deleteFile } from './services/azureStorage.js';
import {Readable} from "stream"

import { errorMiddleware } from './middleware/errorMiddleware.js';

const redisClient = createClient({
    url: process.env.REDIS_URL
});
redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Connected'));
await redisClient.connect();

await initDb()

const PORT = process.env.PORT || 3000;
const app = express();

//add trust proxy for vercel
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

app.use(express.json())
app.use(express.urlencoded())
app.use(cors({
    origin:"https://depot-theta.vercel.app",
    credentials:true,
}));


let redisStore = new RedisStore({
  client: redisClient,
})

app.use(
    session({
        store:redisStore,
        secret:process.env.SESSION_SECRET,
        resave:false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV==="production",
            httpOnly:true,
            sameSite: process.env.NODE_ENV=="production" ? "none":"lax",
            maxAge:24*60*60*1000
        },
    }))

app.use(passport.initialize())
app.use(passport.session())
app.use((req, res, next) => {
  res.header('Access-Control-Expose-Headers', 'Content-Disposition'); 
  next();
});

passport.use(
    new LocalStrategy({usernameField: "email"}, async (email, password, done) => {
        try {
            const user = await getUserByEmail(email);

            if (!user) return done(null, false, {message: "User not found"});
            if (user.googleId && !user.passwordHash) {
                return done(null, false, {message: "This account uses Google login."})
            }
            if (!user.passwordhash) return done(null, false, {message: "Can't login with email into this account"})

            const match = await bcrypt.compare(password, user.passwordhash);
            if (!match) return done(null, false, {message: "Password doesn't match"});

            return done(null, user)
        } catch (err) {
            return done(err);
        }
    })
);


passport.use(
    new GoogleStrategy({
        clientID:"620475659289-g8jv5kqstti23jk47knovhpff6ckdfig.apps.googleusercontent.com",
        clientSecret:"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",
        callbackURL:`/auth/google/callback`
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails[0].value
            let existingGoogleUser = await getUserByGoogleId(profile.id);
            let existingLocalUser = await getLocalUser(email);

            if (existingGoogleUser) return done(null, existingGoogleUser);

            if (existingLocalUser) {
                await updateGoogleId(profile.id, email)
                const updatedUser = await getUserByGoogleId(profile.id)
                return done(null, updatedUser)
            }
            
            const newUser = await saveUser({
                email,
                googleId:profile.id
            });
            return done(null, newUser);
        } catch(err) {
            console.error(err);
            return done(err, null)}
    }));

passport.serializeUser((user, done)=> {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await getUserById(id)
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

function checkAuthentication(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.status(401).json({message: "Unauthorized"})
}


app.post("/register", async(req, res, next) => {
    try {
        const { email, password } = req.body;
        const existingUser = await getUserByEmail(email)
        if (existingUser) return res.status(400).json({message:"User already exists"});

        const passwordhash = await bcrypt.hash(password, 10);
        const newUser = {email, passwordhash}
        await saveUser(newUser)
        const storedNewUser = await getUserByEmail(email)

        req.login(storedNewUser, (err)=>{
            if (err) return next(err);
            return res.json({
                message: "User registered and logged in",
                user: {id: newUser.id, email: newUser.email}
            })
        })
    } catch (err) {
        next(err);
    }
});

app.post("/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
        if (err) return next(err);
        if (!user) return res.status(401).json({message: info.message});

        req.login(user, (err) => {
            if (err) return next(err);
            return res.json({message: "Logged in successfully", user: {id: user.id, email: user.email}})
        });
    })(req, res, next);
});

app.post("/logout", (req, res) => {
    req.logout(()=>{
        res.json({message: "Logged out successfully"})
    })
})

app.get("/auth/google", passport.authenticate("google", {scope:["profile", "email"]}));

app.get("/auth/google/callback", passport.authenticate("google", {failureRedirect: "/", session: true}),
    (req, res) => {
        res.redirect("https://depot-theta.vercel.app/");
    }
);

app.get("/profile", checkAuthentication, (req, res) => {
    res.json({user:req.user})
});


const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 *1024
    },
});
function bufferToStream(buffer) {
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    return readable;
}

app.get('/files', checkAuthentication, async (req, res, next) => {
    try {
        const data = await getFilesForUser(req.user.id);
        res.status(201).json(data)
    } catch (err) {
        next(err)
    }
})

app.post('/files', checkAuthentication, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({message: 'No file provided'});
        const {buffer, originalname, mimetype, size} = req.file;
        
        if (size <= ((1024 * 1024 * 100) - await usedSpace(req.user.id))) {
            const stream= bufferToStream(buffer)
            const { blobName, url } = await uploadFile({
                stream: stream,
                userId: req.user.id,
                originalName: originalname,
                mimeType: mimetype
            });
            const fileRecord = await saveFileMetadata({
                userid: Number(req.user.id),
                originalname,
                blobname: blobName,
                mimetype,
                size: Number(size)
            });
            res.status(201).json({
                message: 'File uploaded',
                file: {
                    id: fileRecord.id,
                    originalName: fileRecord.originalname,
                    size:fileRecord.size,
                    mimetype: fileRecord.mimetype,
                    createdAt: fileRecord.createdat,
                    downloadUrl: url
                }
            })}
        else {
            return res.status(413).json({message: "Insufficient storage space"})}
    } catch(err) {
        next(err);
    }
})

app.get('/storagespace', checkAuthentication, async(req,res,next)=> {
    try {
        const space = await usedSpace(req.user.id);
        res.status(201).json(space)
    } catch(err) {
        next(err)
    }
})

app.get('/files/:id/download', checkAuthentication, async (req, res, next)=> {
    try {
        const file = await getFileById(req.params.id);
        if (!file || file.userid !== req.user.id) {
            return res.status(404).json({message: "File not found"})}

        const blobDownload = await downloadFile(file.blobname);
        res.setHeader('Content-Type', file.mimetype);
        res.setHeader(
            'content-disposition',
            `attachment; filename=${file.originalname}`);
        blobDownload.readableStreamBody.pipe(res)
    } catch(err) {
        next(err)
    }
});

app.delete('/files/:id', checkAuthentication, async (req, res, next) => {
    try {
        const file = await getFileById(req.params.id);
        if (!file || req.user.id !== file.userid) {
            return res.status(404).json({message: "File not found"})
        }
        await deleteFile(file.blobname)
        await deleteFileMetadata(file.id)
        res.json({ message: 'File deleted' });
    } catch (err) {
        next(err);
    }
})

app.use(errorMiddleware)


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})