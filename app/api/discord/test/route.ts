import { NextResponse } from 'next/server';

const success = (data: any) => NextResponse.json({ status: 'success', data });
const error = (msg: string) => NextResponse.json({ status: 'error', message: msg });

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL || body.webhookUrl;

        if (!webhookUrl) {
            return error('No Discord webhook URL provided');
        }

        const payload = {
            username: "ChromaBase System",
            avatar_url: "https://ui.shadcn.com/favicon.ico",
            embeds: [{
                title: "✅ ChromaBase Integration Successful",
                description: "Your Discord server is now connected to ChromaBase. You will receive automated task reminders and deal alerts here.",
                color: 5814783, // #5865F2 in decimal
                timestamp: new Date().toISOString()
            }]
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            return success({ sent: true });
        } else {
            return error(`Discord API Error: ${response.statusText}`);
        }
    } catch (e: any) {
        return error(e.message);
    }
}
