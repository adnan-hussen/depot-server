import { Storage } from '@google-cloud/storage';

// Authenticate with a service account. Credentials are provided via env vars so
// no key file needs to live on disk (works well on Railway/Vercel/etc.).
// GCP_PRIVATE_KEY is stored with escaped newlines in the .env file, so we
// convert "\n" back into real newlines before handing it to the SDK.
const storage = new Storage({
    projectId: process.env.GCP_PROJECT_ID,
    credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
});

const bucket = storage.bucket(process.env.GCS_BUCKET);

async function uploadFile({ stream, userId, originalName, mimeType }) {
    const blobName = `${userId}/${Date.now()}-${originalName}`;
    const file = bucket.file(blobName);

    await new Promise((resolve, reject) => {
        stream
            .pipe(
                file.createWriteStream({
                    resumable: false,
                    contentType: mimeType,
                })
            )
            .on('finish', resolve)
            .on('error', reject);
    });

    return {
        blobName,
        url: `https://storage.googleapis.com/${bucket.name}/${blobName}`,
    };
}

function downloadFile(blobName) {
    return bucket.file(blobName).createReadStream();
}

async function deleteFile(blobName) {
    await bucket.file(blobName).delete({ ignoreNotFound: true });
}

export { uploadFile, downloadFile, deleteFile };
