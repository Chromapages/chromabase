import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

const success = (data: any) => NextResponse.json({ status: 'success', data });
const error = (msg: string) => NextResponse.json({ status: 'error', message: msg });

export async function POST(request: Request) {
    try {
        const { ids } = await request.json();

        if (!Array.isArray(ids)) {
            return error('ids must be an array');
        }

        if (ids.length === 0) {
            return success({ deletedCount: 0 });
        }

        const batch = db.batch();
        ids.forEach(id => {
            batch.delete(db.collection('tasks').doc(id));
        });

        await batch.commit();
        return success({ deletedCount: ids.length });
    } catch (e: any) {
        return error(e.message);
    }
}
