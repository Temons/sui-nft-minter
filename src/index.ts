import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const TEST_MODE = false; // Force mainnet mode
const MINT_TIME = new Date('2025-05-15T15:07:00+01:00'); // 2:00 PM WEST
const SUI_NETWORK = 'mainnet'; // Force mainnet
const NFT_PACKAGE_ID = '0xc8766524653463aa9bd5eef77d86db08bdd4445e50f914deeefca1bef2f40c50';
const MAX_RETRIES = 3;
const RETRY_DELAY = 100; // ms

// Initialize Sui client
const client = new SuiClient({
    url: 'https://fullnode.mainnet.sui.io:443'
});

function getPrivateKeysFromEnv(): Buffer[] {
    return Object.entries(process.env)
        .filter(([key]) => key.startsWith('PRIVATE_KEY_'))
        .map(([, value]) => {
            if (!value) return null;
            const buf = Buffer.from(value, 'base64');
            return buf.slice(1, 33);
        })
        .filter((v): v is Buffer => !!v);
}

async function prepareMintTransaction(keypair: Ed25519Keypair): Promise<Transaction> {
    const tx = new Transaction();
    
    tx.moveCall({
        target: `${NFT_PACKAGE_ID}::stikz::mint_order`,
        arguments: [
            tx.object("0x1f468aaa1e906c4e7e87c7b4976ccca82693b7bdc51e380ae314b3a681bc0d8b::launchpad::Manager"), // &mut Manager
            tx.object("0x2::clock::Clock"), // &Clock
            tx.object("0x1f468aaa1e906c4e7e87c7b4976ccca82693b7bdc51e380ae314b3a681bc0d8b::launchpad::Collection"), // &mut Collection
            tx.pure.string("Stikz"), // name
            tx.pure.u64(1), // quantity
            tx.pure.u64(10_000_000), // price (0.01 SUI)
            tx.pure.u64(0), // edition
            tx.gas, // payment
            tx.object("0x2::tx_context::TxContext"), // &mut TxContext
        ],
    });
    return tx;
}

async function executeMintTransaction(keypair: Ed25519Keypair, tx: Transaction, retryCount = 0): Promise<void> {
    try {
        const address = keypair.getPublicKey().toSuiAddress();
        const result = await client.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx
        });
        console.log(`✅ Минт успешен для ${address}. Digest: ${result.digest}`);
    } catch (e) {
        if (retryCount < MAX_RETRIES) {
            console.log(`⚠️ Попытка ${retryCount + 1} не удалась для ${keypair.getPublicKey().toSuiAddress()}, пробуем снова...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return executeMintTransaction(keypair, tx, retryCount + 1);
        }
        console.error(`❌ Минт не удался для ${keypair.getPublicKey().toSuiAddress()} после ${MAX_RETRIES} попыток:`, e);
    }
}

async function checkMintTime(): Promise<boolean> {
    const now = new Date();
    return now >= MINT_TIME;
}

async function waitForMintTime(): Promise<void> {
    return new Promise((resolve) => {
        const interval = setInterval(async () => {
            if (await checkMintTime()) {
                clearInterval(interval);
                console.log('🎯 Время минта наступило!');
                resolve();
            }
        }, 100);
    });
}

async function main() {
    console.log('🚀 NFT Minting Script Started');
    console.log(`Mode: ${TEST_MODE ? 'TEST' : 'PRODUCTION'}`);
    console.log(`Network: ${SUI_NETWORK}`);
    console.log(`Target mint time: ${MINT_TIME.toLocaleString()}`);
    console.log(`Collection: Stikz`);
    console.log(`Package ID: ${NFT_PACKAGE_ID}`);

    const privateKeys = getPrivateKeysFromEnv();
    if (privateKeys.length === 0) {
        console.error('❌ Нет приватных ключей в .env!');
        return;
    }

    // Создаём keypair для каждого ключа
    const keypairs = privateKeys.map((key, idx) => {
        try {
            const keypair = Ed25519Keypair.fromSecretKey(key);
            const address = keypair.getPublicKey().toSuiAddress();
            console.log(`👤 Аккаунт #${idx + 1}: ${address}`);
            return keypair;
        } catch (e) {
            console.error(`❌ Ошибка с ключом #${idx + 1}:`, e);
            return null;
        }
    }).filter(Boolean) as Ed25519Keypair[];

    if (keypairs.length === 0) {
        console.error('❌ Нет валидных аккаунтов!');
        return;
    }

    // Подготавливаем транзакции заранее
    console.log('📝 Подготавливаем транзакции...');
    const transactions = await Promise.all(
        keypairs.map(async (keypair) => {
            const tx = await prepareMintTransaction(keypair);
            return { keypair, tx };
        })
    );
    console.log('✅ Транзакции подготовлены');

    console.log('⏳ Ожидаем время минта...');
    await waitForMintTime();

    // Мгновенно отправляем все транзакции
    console.log('🎨 Начинаем минт...');
    await Promise.all(
        transactions.map(({ keypair, tx }) => executeMintTransaction(keypair, tx))
    );
}

main().catch(console.error); 