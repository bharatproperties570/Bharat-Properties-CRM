import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import WhatsAppIntegration from '../../models/WhatsAppIntegration.js';
import { useMongoDBAuthState } from './useMongoDBAuthState.js';
import qrcode from 'qrcode';

const logger = pino({ level: 'silent' });
const connections = new Map();

export const BaileysConnectionManager = {
    async initializeAll() {
        try {
            const integrations = await WhatsAppIntegration.find({ 
                provider: 'BAILEYS', 
                status: { $in: ['ACTIVE', 'PENDING_ONBOARDING'] }
            });
            for (const integration of integrations) {
                await this.connect(integration._id.toString());
            }
        } catch (error) {
            console.error('[BaileysConnectionManager] Failed to initialize integrations:', error);
        }
    },

    async connect(integrationId) {
        if (connections.has(integrationId)) {
            return connections.get(integrationId);
        }

        const { state, saveCreds } = await useMongoDBAuthState(integrationId);
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger
        });

        connections.set(integrationId, sock);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                // Generate data URL for the frontend
                try {
                    const qrDataUrl = await qrcode.toDataURL(qr);
                    // Update integration status to QR_PENDING and store the QR data URL somewhere temporarily,
                    // or just emit via WebSockets. For now, we update the DB so the frontend can poll it.
                    await WhatsAppIntegration.findByIdAndUpdate(integrationId, {
                        onboardingStatus: 'QR_PENDING',
                        failureReason: qrDataUrl // Storing QR in failureReason temporarily for polling, or a custom field.
                        // Actually, better to store in credentials.configId temporarily
                    });
                } catch (e) {
                    console.error('[BaileysConnectionManager] QR Code generation failed', e);
                }
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error instanceof Boom)
                    ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
                    : true;
                console.log(`[BaileysConnectionManager] connection closed due to ${lastDisconnect.error?.message}, reconnecting: ${shouldReconnect}`);
                
                connections.delete(integrationId);
                
                if (shouldReconnect) {
                    this.connect(integrationId);
                } else {
                    await WhatsAppIntegration.findByIdAndUpdate(integrationId, {
                        status: 'REVOKED',
                        onboardingStatus: 'REVOKED'
                    });
                }
            } else if (connection === 'open') {
                console.log(`[BaileysConnectionManager] opened connection for integration ${integrationId}`);
                await WhatsAppIntegration.findByIdAndUpdate(integrationId, {
                    status: 'ACTIVE',
                    onboardingStatus: 'CONNECTED'
                });
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // Handle incoming messages
        sock.ev.on('messages.upsert', async (m) => {
            // Process incoming messages and route to WebhookHandler or DiscoveryService
            // For now, just log
            // console.log('[BaileysConnectionManager] got messages:', JSON.stringify(m, undefined, 2));
        });

        return sock;
    },

    getSocket(integrationId) {
        return connections.get(integrationId);
    }
};
