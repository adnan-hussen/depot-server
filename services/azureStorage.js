import { BlobServiceClient } from '@azure/storage-blob';

const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
);

const containerClient = blobServiceClient.getContainerClient(
    process.env.AZURE_BLOB_CONTAINER
);

async function uploadFile({ stream, userId, originalName, mimeType }) {
    const blobName = `${userId}/${Date.now()}-${originalName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadStream(stream,undefined, undefined, {
        blobHTTPHeaders: { blobContentType: mimeType },
    });
    return { blobName, url: blockBlobClient.url };
}

async function downloadFile(blobName) {
    const blobClient = containerClient.getBlobClient(blobName);
    return blobClient.download();
}

async function deleteFile(blobName) {
    const blobClient = containerClient.getBlobClient(blobName);
    await blobClient.deleteIfExists();
}

export { uploadFile, downloadFile, deleteFile };