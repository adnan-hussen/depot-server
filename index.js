import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb, saveUser, getUserById, 
        getUserByEmail, getUserByGoogleId, 
        updateGoogleId, getLocalUser} from './config/db.js';
import passport from 'passport';
import session from 'express-session';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import bcrypt from 'bcryptjs';
import { createClient } from 'redis';
import {RedisStore} from 'connect-redis';

const redisClient = createClient();
redisClient.connect().then(()=>console.log("connected to redis")).catch(console.error)

await initDb()

const app = express();
app.use(express.json())
app.use(express.urlencoded())
app.use(cors({
    origin:"http://localhost:5173",
    credentials:true,
}));


let redisStore = new RedisStore({
  client: redisClient,
})

app.use(
    session({
        store:redisStore,
        secret:"aldkfn4l",
        resave:false,
        saveUninitialized: false,
        cookie: {
            secure: false,
            sameSite: "lax",
        },
    }))

app.use(passport.initialize())
app.use(passport.session())


passport.use(
    new LocalStrategy({usernameField: "email"}, async (email, password, done) => {
        const user = await getUserByEmail(email);

        if (!user) return done(null, false, {message: "User not found"});
        if (user.googleId && !user.passwordHash) {
            return done(null, false, {message: "This account uses Google login."})
        }
        if (!user.passwordhash) return done(null, false, {message: "Can't login with email into this account"})

        const match = await bcrypt.compare(password, user.passwordhash);
        if (!match) return done(null, false, {message: "Password doesn't match"});

        return done(null, user)
    })
);

//todo: find a way to add id to the user object

passport.use(
    new GoogleStrategy({
        clientID:"620475659289-g8jv5kqstti23jk47knovhpff6ckdfig.apps.googleusercontent.com",
        clientSecret:"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",
        callbackURL:"/auth/google/callback"
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
    const user = await getUserById(id)
    done(null, user);
});

function checkAuthentication(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.json({message: "Unauthorized"})
}

app.post("/register", async(req, res, next) => {
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
        res.redirect("http://localhost:5173/");
    }
);

app.get("/profile", checkAuthentication, (req, res) => {
    res.json({user:req.user})
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})