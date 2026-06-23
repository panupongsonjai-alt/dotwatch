import pg from 'pg'
import { env } from '../config/env.js'

const { Pool } = pg

const isRenderDb =
  env.databaseUrl?.includes('render.com') ||
  env.databaseUrl?.includes('render.internal')

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: isRenderDb
    ? {
        rejectUnauthorized: false,
      }
    : false,
})
