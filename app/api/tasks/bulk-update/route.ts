import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

const success = (data: any) => NextResponse.json({ status: 'success', data });
const error = (msg: string) => NextResponse.json({ status: 'error', message: msg });

export async function PUT(request: Request) {
    try {
        const { ids, data } = await request.json();

        if (!Array.isArray(ids)) {
            return error('ids must be an array');
        }

        if (ids.length === 0) {
            return success({ updatedCount: 0 });
        }

        const batch = db.batch();
        const updateData = { ...data, updatedAt: Date.now() };

        // Fetch docs in parallel to check for recurrence
        const docs = await Promise.all(ids.map(id => db.collection('tasks').doc(id).get()));

        ids.forEach((id, index) => {
            const doc = docs[index];
            batch.update(db.collection('tasks').doc(id), updateData);

            if (doc.exists) {
                const existingData = doc.data() as any;
                const isNowCompleted = existingData.status !== 'completed' && data.status === 'completed';

                if (isNowCompleted && existingData.recurrenceRule && existingData.recurrenceRule !== 'none') {
                    let addedDays = 1;
                    if (existingData.recurrenceRule === 'daily') addedDays = 1;
                    else if (existingData.recurrenceRule === 'weekly') addedDays = 7;
                    else if (existingData.recurrenceRule === 'monthly') addedDays = 30;

                    const nextDueDate = new Date(existingData.dueDate || Date.now());
                    nextDueDate.setDate(nextDueDate.getDate() + addedDays);

                    const nextTaskRef = db.collection('tasks').doc();
                    batch.set(nextTaskRef, {
                        ...existingData,
                        status: 'todo',
                        dueDate: nextDueDate.getTime(),
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    });
                }
            }
        });

        await batch.commit();
        return success({ updatedCount: ids.length });
    } catch (e: any) {
        return error(e.message);
    }
}
