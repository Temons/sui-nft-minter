import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkBalances() {
    const client = new SuiClient({
        url: 'https://fullnode.testnet.sui.io:443'
    });

    // Получаем все приватные ключи из .env
    const privateKeys = Object.entries(process.env)
        .filter(([key]) => key.startsWith('PRIVATE_KEY_'))
        .map(([, value]) => {
            if (!value) return null;
            const buf = Buffer.from(value, 'base64');
            return buf.slice(1, 33);
        })
        .filter((key): key is Buffer => key !== null);

    console.log('Checking balances on testnet...\n');

    for (const key of privateKeys) {
        try {
            const keypair = Ed25519Keypair.fromSecretKey(key);
            const address = keypair.getPublicKey().toSuiAddress();
            const balance = await client.getBalance({
                owner: address,
                coinType: '0x2::sui::SUI'
            });
            
            console.log(`Address: ${address}`);
            console.log(`Balance: ${Number(balance.totalBalance) / 1_000_000_000} SUI`);
            console.log('------------------------\n');
        } catch (error) {
            console.error('Error checking balance:', error);
        }
    }
}

checkBalances().catch(console.error); 