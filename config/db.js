import {Pool} from "pg"

const pool = new Pool({
    connectionString:process.env.CONNECTIONSTRING
})

const initDb = async () => {
    try {
        await pool.query(
            `create table if not exists users (
                id serial primary key not null,
                email text unique not null,
                passwordhash text,
                googleid text
            );`);
        console.log("table initialized")
    } catch(err){
        console.error(err);
    }
}

const saveUser = async (user) => {
    const values = [user.email, user.passwordhash || null, user.googleid || null];
    try {
        const res = await pool.query(`
        insert into users (email, passwordhash, googleid) values($1,$2,$3) returning *
        `,values);
        return res.rows[0]
    } catch (err) {console.log(err)}
    
    
}

const getUserById = async (id) => {
    const res = await pool.query(`select * from users where id = $1`,[id]);
    return res.rows[0]
}

const getUserByEmail = async(email) => {
    const res = await pool.query(`select * from users where email = $1`, [email]);
    return res.rows[0]
}

const getLocalUser = async(email) => {
    const res = await pool.query(`select * from users where email = $1 and googleid is null`, [email]);
    return res.rows[0]
}

const getUserByGoogleId = async (googleid) => {
    const res = await pool.query(`select * from users where googleid = $1`, [googleid]);
    return res.rows[0]
}

// const getCount = async () => {
//     const res = await pool.query(`select count(*) from users`)
//     return res.rows[0].count;
// }

const updateGoogleId = async (googleid, email) => {
    await pool.query(`update users set googleid = $1 where email = $2`,[googleid, email])
}

const updatePasswordHash = async (passwordhash, email) => {
    await pool.query(`update users set passwordhash = $1 where email = $2`,[passwordhash, email])
}
export {initDb, saveUser, getUserById, getUserByEmail, getUserByGoogleId, updateGoogleId, updatePasswordHash, getLocalUser}