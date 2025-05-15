1. cd sui-nft-minter
2. npm i
3. Create .env-file
4. Fill it with your private keys PRIVATE_KEY_3=ACnkSCKo0F7ZJf1FhtmxymuoL8/R/fBbhGcvCn9TRnO8
5. open index.ts, change 10 line MINT_TIME for current time + 1 min. Это позволит отработать событию ожидания открытия возможности мингта по времени и запросы уйдут только после разрешения проверки. 
6. Запуск скрипта командой npx ts-node src/index.ts