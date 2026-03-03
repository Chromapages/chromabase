import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

const success = (data: any) => NextResponse.json({ status: 'success', data });
const error = (msg: string) => NextResponse.json({ status: 'error', message: msg });

export async function GET() {
    try {
        const doc = await db.collection('settings').doc('discord').get();

        if (!doc.exists) {
            return success({
                webhookUrl: '',
                options: { highPriorityTasks: false, dealStageChanges: false }
            });
        }

        return success(doc.data());
    } catch (e: any) {
        return error(e.message);
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        await db.collection('settings').doc('discord').set({
            ...body,
            updatedAt: Date.now()
        });

        return success({ id: 'discord' });
    } catch (e: any) {
        return error(e.message);
    }
}
