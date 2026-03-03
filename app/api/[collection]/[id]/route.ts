import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

const success = (data: any) => NextResponse.json({ status: 'success', data });
const error = (msg: string) => NextResponse.json({ status: 'error', message: msg });

export async function GET(
    request: Request,
    { params }: { params: Promise<{ collection: string; id: string }> }
) {
    try {
        const { collection, id } = await params;
        const doc = await db.collection(collection).doc(id).get();

        if (doc.exists) {
            return success({ id: doc.id, ...doc.data() });
        } else {
            return error('Not found');
        }
    } catch (e: any) {
        return error(e.message);
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ collection: string; id: string }> }
) {
    try {
        const { collection, id } = await params;
        const body = await request.json();

        // Note: Tasks recurrence logic is extracted out. A full migration of `server.js` would need that.

        await db.collection(collection).doc(id).update({
            ...body,
            updatedAt: Date.now()
        });

        return success({ id });
    } catch (e: any) {
        return error(e.message);
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ collection: string; id: string }> }
) {
    try {
        const { collection, id } = await params;
        await db.collection(collection).doc(id).delete();

        return success({ deleted: true });
    } catch (e: any) {
        return error(e.message);
    }
}
