import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import mongoose from 'mongoose'

const bucketName = 'resumes'

function getBucket() {
  if (!mongoose.connection.db) throw new Error('MongoDB is not connected.')
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName })
}

export async function savePrivateFile(file, prefix) {
  const bucket = getBucket()
  const upload = bucket.openUploadStream(file.originalname, {
    metadata: {
      contentType: file.mimetype,
      prefix,
    },
  })

  await pipeline(Readable.from([file.buffer]), upload)
  return upload.id.toString()
}

export async function streamPrivateFile(key, res) {
  if (!mongoose.mongo.ObjectId.isValid(key)) {
    const error = new Error('Resume file not found.')
    error.status = 404
    throw error
  }

  const db = mongoose.connection.db
  if (!db) throw new Error('MongoDB is not connected.')
  const id = new mongoose.mongo.ObjectId(key)
  const file = await db.collection(`${bucketName}.files`).findOne({ _id: id })
  if (!file) {
    const error = new Error('Resume file not found.')
    error.status = 404
    throw error
  }

  res.setHeader('Content-Type', file.metadata?.contentType || 'application/octet-stream')
  res.setHeader('Content-Disposition', 'inline')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (Number.isSafeInteger(file.length)) res.setHeader('Content-Length', file.length)
  await pipeline(getBucket().openDownloadStream(id), res)
}
