import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const TEST_MODE = process.env.TEST_MODE === 'true';
const MINT_TIME = new Date('2025-05-15T11:23:00+01:00'); // 2:00 PM WEST
const SUI_NETWORK = TEST_MODE ? 'testnet' : (process.env.SUI_NETWORK || 'mainnet');
const NFT_PACKAGE_ID = '0x1f468aaa1e906c4e7e87c7b4976ccca82693b7bdc51e380ae314b3a681bc0d8b';
const TEST_PACKAGE_ID = '0x5c8b5588ee7648bf89c55977f6e818e4d1a9fd8350a619c401d2eea5a8f22e80';
const MAX_RETRIES = 3;
const RETRY_DELAY = 100; // ms

// Initialize Sui client
const client = new SuiClient({
    url: SUI_NETWORK === 'mainnet' 
        ? 'https://fullnode.mainnet.sui.io:443'
        : 'https://fullnode.testnet.sui.io:443'
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
        target: `${TEST_PACKAGE_ID}::nft::mint`,
        arguments: [
            tx.pure.string('Test NFT'),
            tx.pure.string('This is a test NFT'),
            tx.pure.string('https://example.com/nft.jpg'),
        ],
    });
    return tx;
}

async function executeMintTransaction(keypair: Ed25519Keypair, tx: Transaction, retryCount = 0): Promise<void> {
    try {
        const result = await client.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx
        });
        console.log(`✅ Минт успешен для ${keypair.getPublicKey().toSuiAddress()}. Digest: ${result.digest}`);
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

// Добавим функцию для тестового минта на тестовой сети
async function testMintOnTestnet(keypair: Ed25519Keypair) {
    console.log('🔗 Тестовое подключение к testnet и попытка минта через наш контракт...');
    const TEST_PACKAGE_ID = '0x5c8b5588ee7648bf89c55977f6e818e4d1a9fd8350a619c401d2eea5a8f22e80';
    try {
        const tx = new Transaction();
        tx.moveCall({
            target: `${TEST_PACKAGE_ID}::nft::mint`,
            arguments: [
                tx.pure.string('Test NFT'),
                tx.pure.string('This is a test NFT'),
                tx.pure.string('https://example.com/nft.jpg'),
            ],
        });
        const result = await client.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx
        });
        console.log('✅ Тестовая транзакция отправлена! Digest:', result.digest);
    } catch (e) {
        const err = e as Error;
        console.error('❌ Ошибка при тестовом минте:', err.message || e);
    }
}

// Добавим функцию для деплоя тестового контракта на testnet
async function deployTestContract(keypair: Ed25519Keypair) {
    console.log('🔗 Тестовое подключение к testnet и деплой простого Move-контракта для минта NFT...');
    // Путь к папке с Move-контрактом (предполагается, что контракт уже собран)
    const contractPath = './sui_nft';
    try {
        const { execSync } = require('child_process');
        const result = execSync(`sui client publish --gas-budget 50000000000 ${contractPath}`, { encoding: 'utf-8' });
        console.log('✅ Контракт успешно опубликован! Результат:', result);
    } catch (e) {
        const err = e as Error;
        console.error('❌ Ошибка при деплое контракта:', err.message || e);
    }
}

// Добавим функцию для создания тестового Move-контракта
async function createTestContract() {
    console.log('🔗 Создаем простой Move-контракт для минта NFT...');
    const { execSync } = require('child_process');
    try {
        // Создаем новый Move-пакет
        execSync('sui move new sui_nft', { stdio: 'inherit' });
        // Создаем файл nft.move с примером контракта
        const nftCode = `
module sui_nft::nft {
    use sui::url::{Self, Url};
    use std::string;
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    public struct NFT has key, store {
        id: UID,
        name: string::String,
        description: string::String,
        url: Url,
    }

    public entry fun mint(name: vector<u8>, description: vector<u8>, url: vector<u8>, ctx: &mut TxContext) {
        let nft = NFT {
            id: object::new(ctx),
            name: string::utf8(name),
            description: string::utf8(description),
            url: url::new_unsafe_from_bytes(url),
        };
        let sender = tx_context::sender(ctx);
        transfer::public_transfer(nft, sender);
    }

    public entry fun transfer(nft: NFT, recipient: address) {
        transfer::transfer(nft, recipient);
    }
}
`;
        require('fs').writeFileSync('./sui_nft/sources/nft.move', nftCode);
        console.log('✅ Контракт успешно создан в папке ./sui_nft!');
    } catch (e) {
        const err = e as Error;
        console.error('❌ Ошибка при создании контракта:', err.message || e);
    }
}

async function main() {
    console.log('🚀 NFT Minting Script Started');
    console.log(`Mode: ${TEST_MODE ? 'TEST' : 'PRODUCTION'}`);
    console.log(`Network: ${SUI_NETWORK}`);
    console.log(`Target mint time: ${MINT_TIME.toLocaleString()}`);
    console.log(`Collection: Xociety`);
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

    console.log('⏳ Ожидаем время минта...');
    await waitForMintTime();

    // Мгновенно отправляем все транзакции
    console.log('🎨 Начинаем минт...');
    await Promise.all(
        keypairs.map(async (keypair) => {
            const tx = await prepareMintTransaction(keypair);
            return executeMintTransaction(keypair, tx);
        })
    );
}

main().catch(console.error); 