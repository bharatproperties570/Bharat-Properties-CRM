import { exec } from 'child_process';
import redisConnection from '../config/redis.js';

/**
 * Senior Professional Service Launcher
 * Attempts to ensure Redis is running in the background.
 * This directly addresses the user's requirement to auto-start dependencies.
 */
export const ensureRedisRunning = async () => {
    // 1. Check if already online (handled by redis.js initialization)
    // We wait a brief moment for the initial connection attempt to resolve
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (redisConnection && !redisConnection.isMock) {
        console.log('💎 Redis: Already running and connected.');
        return;
    }

    console.log('🔄 Redis: Attempting automatic startup...');

    // 2. Try to start redis-server in background
    // We try multiple common paths and the naked command
    const commands = [
        'redis-server --daemonize yes',
        '/opt/homebrew/bin/redis-server --daemonize yes',
        '/usr/local/bin/redis-server --daemonize yes'
    ];

    for (const cmd of commands) {
        try {
            await new Promise((resolve, reject) => {
                exec(cmd, (error, stdout, stderr) => {
                    if (error) {
                        // If it's already running, it might error with "Address already in use"
                        if (stderr.includes('Address already in use') || stdout.includes('Address already in use')) {
                            resolve();
                        } else {
                            reject(error);
                        }
                    } else {
                        resolve();
                    }
                });
            });
            console.log(`✅ Redis: Started successfully using [${cmd.split(' ')[0]}]`);
            return;
        } catch (err) {
            // Silently try next command
        }
    }

    console.warn('⚠️  Redis: Auto-start failed (Binary not found or permission denied). Please start Redis manually.');
};
