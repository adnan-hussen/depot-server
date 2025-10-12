import multer from 'multer'
const errorMiddleware = async (err, req, res, next) => {
    console.error(err);
    if (err instanceof multer.MulterError) {
        return res.status(400).json({message: err.message});
    }
    res.status(500).json({message: 'Internal server error'});
}

export {errorMiddleware}