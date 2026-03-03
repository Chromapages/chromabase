import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

const success = (data: any) => NextResponse.json({ status: 'success', data });
const error = (msg: string) => NextResponse.json({ status: 'error', message: msg });

export async function GET(
    request: Request,
    { params }: { params: Promise<{ collection: string }> }
) {
    try {
        const { collection } = await params;

        // Check for queries
        const url = new URL(request.url);
        const clientId = url.searchParams.get('clientId');
        const entityId = url.searchParams.get('entityId');

        let query: any = db.collection(collection);

        // Some collections have specific orders
        if (collection === 'tasks') {
            query = query.orderBy('dueDate', 'asc');
        } else if (collection === 'appointments') {
            query = query.orderBy('startTime', 'asc');
        } else if (collection === 'activities') {
            query = query.orderBy('timestamp', 'desc').limit(100);
        } else if (collection === 'comments') {
            query = query.orderBy('createdAt', 'asc');
        } else {
            query = query.orderBy('createdAt', 'desc');
        }

        const snap = await query.get();
        let docs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

        // Manual filtering for specific lists
        if (collection === 'contacts' && clientId) {
            docs = docs.filter((c: any) => c.clientId === clientId);
        }
        if (collection === 'comments' && entityId) {
            docs = docs.filter((c: any) => c.entityId === entityId);
        }

        return success(docs);
    } catch (e: any) {
        return error(e.message);
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ collection: string }> }
) {
    try {
        const { collection } = await params;
        const body = await request.json();

        let data = { ...body, createdAt: Date.now(), updatedAt: Date.now() };

        if (collection === 'activities') {
            data.timestamp = Date.now();
        }
        if (collection === 'comments') {
            delete data.updatedAt;
        }
        if (collection === 'notifications') {
            data.read = false;
            delete data.updatedAt;
        }

        const doc = await db.collection(collection).add(data);

        // Discord alert placeholder (can be extracted into a separate utility)
        if (collection === 'tasks' || collection === 'deals') {
            // await sendDiscordAlertIfEnabled(collection === 'tasks' ? 'task' : 'deal', { id: doc.id, ...data });
        }

        return success({ id: doc.id });
    } catch (e: any) {
        return error(e.message);
    }
}
