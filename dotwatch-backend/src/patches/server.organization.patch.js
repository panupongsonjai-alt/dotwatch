// Add these imports in dotwatch-backend/src/server.js

import { organizationsRouter } from './routes/organizations.routes.js'
import { sitesRouter } from './routes/sites.routes.js'
import { deviceGroupsRouter } from './routes/deviceGroups.routes.js'

// Add these routes near other /api routes

app.use('/api/organizations', organizationsRouter)
app.use('/api/sites', sitesRouter)
app.use('/api/device-groups', deviceGroupsRouter)
