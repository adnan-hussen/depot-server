import {Pool} from "pg"

const pool = new Pool({
    connectionString:process.env.CONNECTIONSTRING,
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
        console.error(err)}
    
    try {
        await pool.query(`
            create table if not exists metadata (
                id serial primary key not null,
                userid int,
                originalname text not null,
                blobname text not null,
                mimetype text not null,
                size int not null,
                createdAt timestamptz not null default now(),
                foreign key (userid) references users(id) on delete cascade
            );`)
    } catch(err) {
        console.log(err)
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


const updateGoogleId = async (googleid, email) => {
    await pool.query(`update users set googleid = $1 where email = $2`,[googleid, email])
}

const updatePasswordHash = async (passwordhash, email) => {
    await pool.query(`update users set passwordhash = $1 where email = $2`,[passwordhash, email])
}

const saveFileMetadata = async ({ userid, originalname, blobname, mimetype, size }) => {
    const res = await pool.query(
        `insert into metadata(userid, originalname, blobname, mimetype, size) values($1,$2,$3,$4,$5) returning *`,
        [userid, originalname, blobname, mimetype, size]
    );
    return res.rows[0];
}

const getFilesForUser = async (userid) => {
    const res = await pool.query(`select * from metadata where userid=$1 order by createdat desc`,[userid])
    return res.rows
}

const getFileById = async (id) => {
    const res = await pool.query(`select * from metadata where id=$1`, [id]);
    return res.rows[0]
}

const deleteFileMetadata = async (id) => {
    const res = await pool.query (`delete from metadata where id=$1 returning *`, [id])
    return res.rows[0]
}

const usedSpace = async (userid) => {
    const res = await pool.query(`select size from metadata where userid=$1`, [userid]);
    const data = res.rows;
    const usedSpace = data.reduce((total, row)=>total+row.size,0);
    return usedSpace
}

export {
        initDb, saveUser, getUserById, 
        getUserByEmail, getUserByGoogleId, 
        updateGoogleId, updatePasswordHash,
        getLocalUser, saveFileMetadata, 
        getFilesForUser, getFileById, 
        deleteFileMetadata, usedSpace
    }