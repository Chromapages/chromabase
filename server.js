const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const serviceAccount = require('./service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const authenticate = async (req, res, next) => {
  // Bypass auth for these endpoints (ChromaBrain sync, health checks, AHM pipelines)
  const publicPaths = ['/', '/api/health', '/api/sync', '/api/pipelines'];
  if (publicPaths.includes(req.path)) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized: Missing or invalid Bearer token.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.user = decoded;
    console.log(`[AUTH] Authenticated user: ${decoded.email} (${decoded.uid})`);
    next();
  } catch (err) {
    console.error(`[AUTH] Token verification failed:`, err.message);
    return res.status(401).json({ status: 'error', message: 'Unauthorized: Invalid ID token.' });
  }
};

app.use(authenticate);

// ==================== SOCKET.IO HANDLER ====================
io.on('connection', (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id}`);

  socket.on('join', (userUid) => {
    if (userUid) {
      socket.join(userUid);
      console.log(`[SOCKET] Client ${socket.id} joined room: ${userUid}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET] Client disconnected: ${socket.id}`);
  });
});

// Helper to emit data_change events to a user's room
const emitDataChange = (userUid, eventType, collection, entityId, data = {}) => {
  if (userUid && io) {
    io.to(userUid).emit('data_change', {
      type: eventType,
      collection,
      entityId,
      data,
      timestamp: Date.now()
    });
    console.log(`[SOCKET] Emitted ${eventType} for ${collection}/${entityId} to user ${userUid}`);
  }
};

const success = (data) => ({ status: 'success', data });
const error = (msg) => ({ status: 'error', message: msg });

// Root
app.get('/', (req, res) => {
  const status = !!db ? '<span class="status-up">ONLINE</span>' : '<span class="status-down">OFFLINE</span>';
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ChromaBase API | Explorer</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg: #0a0a0b;
                --surface: #141417;
                --primary: #2c3892;
                --primary-glow: rgba(44, 56, 146, 0.4);
                --text: #f4f4f5;
                --text-muted: #a1a1aa;
                --border: #27272a;
                --success: #10b981;
                --error: #ef4444;
            }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                background: var(--bg); 
                color: var(--text); 
                font-family: 'Inter', sans-serif; 
                line-height: 1.5;
                padding: 40px 20px;
            }
            .container { max-width: 1000px; margin: 0 auto; }
            header { 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                margin-bottom: 48px;
                padding-bottom: 24px;
                border-bottom: 1px solid var(--border);
            }
            h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.025em; display: flex; align-items: center; gap: 12px; }
            .badge { 
                font-family: 'JetBrains Mono', monospace; 
                font-size: 12px; 
                padding: 4px 12px; 
                border-radius: 100px; 
                background: var(--surface);
                border: 1px solid var(--border);
            }
            .status-up { color: var(--success); }
            .status-down { color: var(--error); }
            
            .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(450px, 1fr)); gap: 24px; }
            section { 
                background: var(--surface); 
                border: 1px solid var(--border); 
                border-radius: 12px; 
                padding: 24px;
                transition: border-color 0.2s;
            }
            section:hover { border-color: var(--primary); }
            h2 { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
            
            .route { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
            .method { 
                font-weight: 700; 
                width: 60px; 
                padding: 2px 6px; 
                border-radius: 4px; 
                text-align: center;
                background: #27272a;
            }
            .GET { color: #60a5fa; }
            .POST { color: #34d399; }
            .PUT { color: #fbbf24; }
            .DELETE { color: #f87171; }
            .path { color: var(--text); }
            
            .commands { margin-top: 48px; }
            code-box {
                display: block;
                background: #000;
                padding: 16px;
                border-radius: 8px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 13px;
                border: 1px solid var(--border);
                color: #d4d4d8;
                margin-bottom: 8px;
            }

            footer { margin-top: 80px; text-align: center; color: var(--text-muted); font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <h1>🚀 ChromaBase <span>API</span></h1>
                <div class="badge">Firestore: ${status}</div>
            </header>

            <div class="grid">
                <section>
                    <h2>Dynamic Collections</h2>
                    <div class="route"><span class="method GET">GET</span> <span class="path">/api/:collection</span></div>
                    <div class="route"><span class="method POST">POST</span> <span class="path">/api/:collection</span></div>
                    <div class="route"><span class="method GET">GET</span> <span class="path">/api/:collection/:id</span></div>
                    <div class="route"><span class="method PUT">PUT</span> <span class="path">/api/:collection/:id</span></div>
                    <div class="route"><span class="method DELETE">DELETE</span> <span class="path">/api/:collection/:id</span></div>
                </section>

                <section>
                    <h2>Specialized Logic</h2>
                    <div class="route"><span class="method GET">GET</span> <span class="path">/api/stats</span></div>
                    <div class="route"><span class="method GET">GET</span> <span class="path">/api/settings/discord</span></div>
                    <div class="route"><span class="method POST">POST</span> <span class="path">/api/tasks/bulk-delete</span></div>
                    <div class="route"><span class="method PUT">PUT</span> <span class="path">/api/tasks/bulk-update</span></div>
                </section>

                <section>
                    <h2>Query Filters</h2>
                    <div class="route"><span class="path">/api/contacts?clientId=...</span></div>
                    <div class="route"><span class="path">/api/comments?entityId=...</span></div>
                    <div class="route"><span class="path">/api/activities?limit=100</span></div>
                    <div class="route" style="margin-top: 12px; border-top: 1px dotted var(--border); padding-top: 12px;">
                        <span class="method GET">GET</span> <span class="path">/api/accounts/:id/timeline</span>
                    </div>
                </section>

                <section>
                    <h2>System Status</h2>
                    <div class="route"><span class="method GET">GET</span> <span class="path">/api/health</span></div>
                    <div class="route"><span class="method POST">POST</span> <span class="path">/api/discord/test</span></div>
                </section>
            </div>

            <div class="commands">
                <h2>CLI Command Reference</h2>
                <p style="color: var(--text-muted); margin-bottom: 16px; font-size: 14px;">Essential commands for system maintenance and deployment.</p>
                <code-box>firebase deploy --only hosting,firestore:rules</code-box>
                <code-box>npm run dev:server # Runs bridge API locally</code-box>
                <code-box>stripe listen --forward-to localhost:3000/api/webhook</code-box>
            </div>

            <footer>
                &copy; 2026 ChromaBase CRM Engineering. All rights reserved.
            </footer>
        </div>
    </body>
    </html>
  `);
});

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'ChromaBase API', firestore: !!db }));

// ==================== AHM PIPELINE SYNC (No Auth - AHM Only) ====================
// Receive pipeline status from Agent Handoff Manager
app.post('/api/pipelines', async (req, res) => {
  try {
    const { id, task, agents, status, createdAt, completedAt, outputPath, handoffs } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Pipeline ID is required' });
    }

    // Build pipeline data, excluding undefined values
    const pipelineData = {
      id,
      task: task || '',
      agents: agents || [],
      status,
      createdAt: createdAt ? new Date(createdAt) : new Date(),
      completedAt: completedAt ? new Date(completedAt) : null,
      updatedAt: new Date()
    };

    if (outputPath) pipelineData.outputPath = outputPath;
    if (handoffs) pipelineData.handoffs = handoffs;

    // Store pipeline in firestore
    const pipelineRef = db.collection('pipelines').doc(id);
    await pipelineRef.set(pipelineData, { merge: true });

    // Also log as activity
    await db.collection('activities').add({
      type: 'pipeline',
      pipelineId: id,
      action: status === 'completed' ? 'completed' : 'started',
      task: task ? task.substring(0, 50) : '',
      timestamp: new Date()
    });

    console.log(`[PIPELINE] Synced: ${id} - ${status}`);

    res.json({ success: true, id, status });
  } catch (error) {
    console.error('[PIPELINE] Sync error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// List pipelines
app.get('/api/pipelines', async (req, res) => {
  try {
    const snapshot = await db.collection('pipelines')
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    const pipelines = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({ pipelines });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SYNC ENDPOINT (No Auth - ChromaBrain Only) ====================
app.get('/api/sync', async (req, res) => {
  try {
    // Allow passing user ID via query param, or default to 'chromabrain'
    const userUid = req.query.userId || 'chromabrain';
    const userRef = db.collection('users').doc(userUid);

    // Get all main collections
    const [clientsSnap, leadsSnap, tasksSnap, quotesSnap, appointmentsSnap, activitiesSnap] = await Promise.all([
      userRef.collection('clients').get(),
      userRef.collection('leads').get(),
      userRef.collection('tasks').get(),
      userRef.collection('quotes').get(),
      userRef.collection('appointments').get(),
      userRef.collection('activities').orderBy('timestamp', 'desc').limit(100).get()
    ]);

    res.json({
      status: 'success',
      data: {
        clients: clientsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        leads: leadsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        tasks: tasksSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        quotes: quotesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        appointments: appointmentsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        activities: activitiesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        syncedAt: Date.now()
      }
    });
  } catch (e) {
    console.error('[SYNC] Error:', e.message);
    res.json({ status: 'error', message: e.message });
  }
});

// ==================== DYNAMIC COLLECTION HANDLERS ====================

// GET List
app.get('/api/:collection', async (req, res) => {
  try {
    const { collection } = req.params;
    const userUid = req.user.uid;
    console.log(`[API] GET /api/${collection} for user: ${userUid}`);
    let query = db.collection('users').doc(userUid).collection(collection);

    // Dynamic Sorters
    if (collection === 'tasks') {
      query = query.orderBy('dueDate', 'asc');
    } else if (collection === 'appointments') {
      query = query.orderBy('startTime', 'asc');
    } else if (collection === 'activities') {
      query = query.orderBy('timestamp', 'desc').limit(100);
    } else if (collection === 'comments') {
      query = query.orderBy('createdAt', 'asc');
    } else {
      // Default sorter
      try {
        query = query.orderBy('createdAt', 'desc');
      } catch (e) {
        // Fallback if createdAt doesn't exist
      }
    }

    let snap;
    try {
      snap = await query.get();
    } catch (queryError) {
      console.warn(`[API] Query failed for ${collection}. Error:`, queryError.message);
      snap = await db.collection('users').doc(userUid).collection(collection).get();
    }

    console.log(`[API] Found ${snap.size} documents in ${collection} for user ${userUid}`);

    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Dynamic Filters
    if (collection === 'contacts' && req.query.clientId) {
      docs = docs.filter(c => c.clientId === req.query.clientId);
    }
    if (collection === 'comments' && req.query.entityId) {
      docs = docs.filter(c => c.entityId === req.query.entityId);
    }

    res.json(success(docs));
  } catch (e) {
    console.error(`[API] Unhandled error in /api/${req.params.collection}:`, e);
    res.json(error(e.message));
  }
});

// GET Single
app.get('/api/:collection/:id', async (req, res) => {
  try {
    const { collection, id } = req.params;
    const userUid = req.user.uid;
    const doc = await db.collection('users').doc(userUid).collection(collection).doc(id).get();
    doc.exists ? res.json(success({ id: doc.id, ...doc.data() })) : res.json(error('Not found'));
  } catch (e) { res.json(error(e.message)); }
});

// POST Create
app.post('/api/:collection', async (req, res) => {
  try {
    const { collection } = req.params;
    const userUid = req.user.uid;
    const data = { ...req.body, createdAt: Date.now(), updatedAt: Date.now() };

    if (collection === 'activities') {
      data.timestamp = Date.now();
    }
    if (collection === 'notifications') {
      data.read = false;
    }

    const doc = await db.collection('users').doc(userUid).collection(collection).add(data);

    // Emit socket event for real-time sync
    emitDataChange(userUid, 'create', collection, doc.id, data);

    // Alerts
    if (collection === 'tasks' || collection === 'deals') {
      sendDiscordAlertIfEnabled(collection === 'tasks' ? 'task' : 'deal', { id: doc.id, ...data });
    }

    // NEW: Auto-create calendar event when a Task with a dueDate is created
    if (collection === 'tasks' && data.dueDate) {
      await db.collection('users').doc(userUid).collection('calendar').add({
        title: data.title || 'Task Deadline',
        type: 'TASK',
        status: data.status || 'todo',
        timestamp: data.dueDate,
        accountId: data.accountId || null,
        taskId: doc.id,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    res.json(success({ id: doc.id }));
  } catch (e) { res.json(error(e.message)); }
});

// PUT Update
app.put('/api/:collection/:id', async (req, res) => {
  try {
    const { collection, id } = req.params;
    const userUid = req.user.uid;
    const userRef = db.collection('users').doc(userUid);
    const existingDoc = await userRef.collection(collection).doc(id).get();

    if (!existingDoc.exists) return res.json(error('Not found'));

    const existingData = existingDoc.data();
    const isNowCompleted = collection === 'tasks' && existingData.status !== 'completed' && req.body.status === 'completed';
    const isCalendarNowCompleted = collection === 'calendar' && existingData.status !== 'completed' && req.body.status === 'completed';

    await userRef.collection(collection).doc(id).update({ ...req.body, updatedAt: Date.now() });

    // Emit socket event for real-time sync
    emitDataChange(userUid, 'update', collection, id, req.body);

    // Sync Calendar Event -> Task
    if (collection === 'calendar' && req.body.timestamp && existingData.taskId) {
      await userRef.collection('tasks').doc(existingData.taskId).update({
        dueDate: req.body.timestamp,
        updatedAt: Date.now()
      });
    }

    // Sync Task -> Calendar Event
    if (collection === 'tasks') {
      const calSnap = await userRef.collection('calendar').where('taskId', '==', id).get();
      if (!calSnap.empty) {
        const calDocId = calSnap.docs[0].id;
        let calUpdates = { updatedAt: Date.now() };
        if (req.body.dueDate) calUpdates.timestamp = req.body.dueDate;
        if (req.body.status) calUpdates.status = req.body.status;
        if (req.body.title) calUpdates.title = req.body.title;
        await userRef.collection('calendar').doc(calDocId).update(calUpdates);
      }
    }

    // Auto-Follow-up Task for Meetings
    if (isCalendarNowCompleted && existingData.type === 'MEETING') {
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + 1); // +24 hours
      await userRef.collection('tasks').add({
        title: `Follow-up regarding: ${existingData.title || req.body.title || 'Meeting'}`,
        description: 'Automated follow-up task generated post-meeting.',
        status: 'todo',
        priority: 'medium',
        dueDate: followUpDate.getTime(),
        accountId: existingData.accountId || req.body.accountId || null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    // Recurrence Logic for Tasks
    if (isNowCompleted && existingData.recurrenceRule && existingData.recurrenceRule !== 'none') {
      let addedDays = 1;
      if (existingData.recurrenceRule === 'daily') addedDays = 1;
      else if (existingData.recurrenceRule === 'weekly') addedDays = 7;
      else if (existingData.recurrenceRule === 'monthly') addedDays = 30;

      const nextDueDate = new Date(existingData.dueDate || Date.now());
      nextDueDate.setDate(nextDueDate.getDate() + addedDays);

      const nextTask = {
        ...existingData,
        status: 'todo',
        dueDate: nextDueDate.getTime(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      delete nextTask.id;

      const newRecurrentDoc = await userRef.collection('tasks').add(nextTask);

      // Add linked calendar event for the new recurring task
      await userRef.collection('calendar').add({
        title: nextTask.title || 'Task Deadline',
        type: 'TASK',
        status: 'todo',
        timestamp: nextTask.dueDate,
        accountId: nextTask.accountId || null,
        taskId: newRecurrentDoc.id,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    // Alerts for Deals/Tasks
    if (collection === 'tasks' || collection === 'deals') {
      sendDiscordAlertIfEnabled(collection === 'tasks' ? 'task' : 'deal', { id, ...existingData, ...req.body }, userUid);
    }

    res.json(success({ id }));
  } catch (e) { res.json(error(e.message)); }
});

// DELETE
app.delete('/api/:collection/:id', async (req, res) => {
  try {
    const { collection, id } = req.params;
    const userUid = req.user.uid;
    await db.collection('users').doc(userUid).collection(collection).doc(id).delete();

    // Emit socket event for real-time sync
    emitDataChange(userUid, 'delete', collection, id);

    res.json(success({ deleted: true }));
  } catch (e) { res.json(error(e.message)); }
});

// ==================== BULK OPERATIONS ====================
app.post('/api/tasks/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    const userUid = req.user.uid;
    if (!Array.isArray(ids)) return res.json(error('ids must be an array'));
    const batch = db.batch();
    const tasksRef = db.collection('users').doc(userUid).collection('tasks');
    ids.forEach(id => { batch.delete(tasksRef.doc(id)); });
    await batch.commit();

    emitDataChange(userUid, 'bulk_delete', 'tasks', null, { ids });

    res.json(success({ deletedCount: ids.length }));
  } catch (e) { res.json(error(e.message)); }
});

app.put('/api/tasks/bulk-update', async (req, res) => {
  try {
    const { ids, data } = req.body;
    const userUid = req.user.uid;
    if (!Array.isArray(ids)) return res.json(error('ids must be an array'));
    const batch = db.batch();
    const tasksRef = db.collection('users').doc(userUid).collection('tasks');
    ids.forEach(id => { batch.update(tasksRef.doc(id), { ...data, updatedAt: Date.now() }); });
    await batch.commit();

    emitDataChange(userUid, 'bulk_update', 'tasks', null, { ids, data });

    res.json(success({ updatedCount: ids.length }));
  } catch (e) { res.json(error(e.message)); }
});

// ==================== SPECIALIZED HANDLERS ====================

app.get('/api/accounts/:id/timeline', async (req, res) => {
  try {
    const { id } = req.params;
    const userUid = req.user.uid;
    const userRef = db.collection('users').doc(userUid);
    const [tasksSnap, calendarSnap, activitiesSnap] = await Promise.all([
      userRef.collection('tasks').where('accountId', '==', id).get(),
      userRef.collection('calendar').where('accountId', '==', id).get(),
      userRef.collection('activities').where('accountId', '==', id).get()
    ]);

    const tasks = tasksSnap.docs.map(d => ({ id: d.id, _feedType: 'task', ...d.data() }));
    const events = calendarSnap.docs.map(d => ({ id: d.id, _feedType: 'event', ...d.data() }));
    const activities = activitiesSnap.docs.map(d => ({ id: d.id, _feedType: 'activity', ...d.data() }));

    const feed = [...tasks, ...events, ...activities].sort((a, b) => {
      const timeA = a.timestamp || a.dueDate || a.createdAt || 0;
      const timeB = b.timestamp || b.dueDate || b.createdAt || 0;
      return timeB - timeA; // Descending, newest first
    });

    res.json(success(feed));
  } catch (e) { res.json(error(e.message)); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const userUid = req.user.uid;
    const userRef = db.collection('users').doc(userUid);
    const [clients, leads, tasks, quotes] = await Promise.all([
      userRef.collection('clients').get(),
      userRef.collection('leads').get(),
      userRef.collection('tasks').get(),
      userRef.collection('quotes').get()
    ]);
    res.json(success({
      totalClients: clients.size,
      activeLeads: leads.docs.filter(d => !['won', 'lost'].includes(d.data().status)).length,
      wonLeads: leads.docs.filter(d => d.data().status === 'won').length,
      pendingTasks: tasks.docs.filter(d => d.data().status !== 'completed').length,
      totalRevenue: quotes.docs.filter(d => d.data().status === 'accepted').reduce((sum, d) => sum + (d.data().total || 0), 0),
      pendingQuotes: quotes.docs.filter(d => d.data().status === 'sent').length
    }));
  } catch (e) { res.status(500).json(error(e.message)); }
});

// Search across collections
app.get('/api/search', async (req, res) => {
  try {
    const userUid = req.user.uid;
    const query = (req.query.q || '').toString().toLowerCase();
    if (!query || query.length < 2) return res.json(success({ clients: [], leads: [], contacts: [] }));
    
    const userRef = db.collection('users').doc(userUid);
    const [clients, leads, contacts] = await Promise.all([
      userRef.collection('clients').get(),
      userRef.collection('leads').get(),
      userRef.collection('contacts').get()
    ]);
    
    const searchIn = (docs, fields) => docs.filter(d => {
      const data = d.data();
      return fields.some(f => data[f] && String(data[f]).toLowerCase().includes(query));
    });
    
    res.json(success({
      clients: searchIn(clients.docs, ['name', 'company', 'email']).map(d => ({ id: d.id, ...d.data() })),
      leads: searchIn(leads.docs, ['name', 'company', 'email']).map(d => ({ id: d.id, ...d.data() })),
      contacts: searchIn(contacts.docs, ['name', 'email', 'phone']).map(d => ({ id: d.id, ...d.data() }))
    }));
  } catch (e) { res.status(500).json(error(e.message)); }
});

app.get('/api/settings/discord', async (req, res) => {
  try {
    const userUid = req.user.uid;
    const doc = await db.collection('users').doc(userUid).collection('settings').doc('discord').get();
    res.json(success(doc.exists ? doc.data() : { webhookUrl: '', options: { highPriorityTasks: false, dealStageChanges: false } }));
  } catch (e) { res.json(error(e.message)); }
});

app.post('/api/settings/discord', async (req, res) => {
  try {
    const userUid = req.user.uid;
    await db.collection('users').doc(userUid).collection('settings').doc('discord').set({ ...req.body, updatedAt: Date.now() });
    res.json(success({ id: 'discord' }));
  } catch (e) { res.json(error(e.message)); }
});

const sendDiscordAlertIfEnabled = async (type, data, userUid) => {
  try {
    const doc = await db.collection('users').doc(userUid).collection('settings').doc('discord').get();
    if (!doc.exists) return;
    const settings = doc.data();
    if (!settings.webhookUrl) return;

    let embeds = [];
    if (type === 'task' && settings.options?.highPriorityTasks && ['high', 'urgent'].includes(data.priority?.toLowerCase()) && data.status !== 'completed') {
      embeds.push({ title: `🔴 High Priority Task: ${data.title}`, color: 16711680, description: `Status: ${data.status}\nDue: ${data.dueDate ? new Date(data.dueDate).toLocaleString() : 'N/A'}` });
    } else if (type === 'deal' && settings.options?.dealStageChanges) {
      embeds.push({ title: `🤝 Deal Stage Updated: ${data.name || 'Unknown'}`, color: 3447003, description: `New Stage: **${data.stage}**\nValue: $${data.value || 0}` });
    }

    if (embeds.length > 0) {
      // Use built-in fetch if possible, or axios/node-fetch if present. 
      // server.js was using fetch at the bottom.
      fetch(settings.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds }) }).catch(e => { });
    }
  } catch (e) { }
};

// ==================== DISCORD INTEGRATION ====================
app.post('/api/discord/test', async (req, res) => {
  try {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL || req.body.webhookUrl;
    if (!webhookUrl) return res.json(error('No Discord webhook URL provided'));

    const payload = {
      username: "ChromaBase System",
      avatar_url: "https://ui.shadcn.com/favicon.ico",
      embeds: [{
        title: "✅ ChromaBase Integration Successful",
        description: "Your Discord server is now connected to ChromaBase. You will receive automated task reminders and deal alerts here.",
        color: 5814783,
        timestamp: new Date().toISOString()
      }]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      res.json(success({ sent: true }));
    } else {
      res.json(error(`Discord API Error: ${response.statusText}`));
    }
  } catch (e) { res.json(error(e.message)); }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 ChromaBase API running on port ${PORT}`));
