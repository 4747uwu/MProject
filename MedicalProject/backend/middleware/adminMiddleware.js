// middleware/admin.middleware.js
import { protect, authorize } from './authMiddleware.js'; // Adjust path if your auth middleware is elsewhere

// This is a sequence of middleware: first protect, then authorize for 'admin' role.
export const isAdmin = [protect, authorize('admin')];