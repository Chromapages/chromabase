import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

const success = (data: any) => NextResponse.json({ status: 'success', data });
const error = (msg: string) => NextResponse.json({ status: 'error', message: msg });

export async function GET() {
    try {
        const [clients, leads, tasks, quotes] = await Promise.all([
            db.collection('clients').get(),
            db.collection('leads').get(),
            db.collection('tasks').get(),
            db.collection('quotes').get()
        ]);

        const activeLeads = leads.docs.filter((d: any) => {
            const status = d.data().status;
            return status !== 'won' && status !== 'lost';
        }).length;

        const wonLeads = leads.docs.filter((d: any) => d.data().status === 'won').length;
        const pendingTasks = tasks.docs.filter((d: any) => d.data().status !== 'completed').length;

        const totalRevenue = quotes.docs
            .filter((d: any) => d.data().status === 'accepted')
            .reduce((sum: number, d: any) => sum + (d.data().total || 0), 0);

        const pendingQuotes = quotes.docs.filter((d: any) => d.data().status === 'sent').length;

        return success({
            totalClients: clients.size,
            activeLeads,
            wonLeads,
            pendingTasks,
            totalRevenue,
            pendingQuotes
        });
    } catch (e: any) {
        return error(e.message);
    }
}
