import { admin, firebaseReady } from '../config/firebaseAdmin.js';

export async function authUser(req, res, next) {
  try {
    if (!firebaseReady) {
      req.user = { uid: 'dev-user', email: 'dev@dotwatch.local' };
      return next();
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Missing user token' });

    const decoded = await admin.auth().verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid user token' });
  }
}
