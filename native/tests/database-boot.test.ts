import { openDatabaseSync } from 'expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { openLocalDatabase } from '../src/data/database';
const mockSQLite={execSync:jest.fn(),closeSync:jest.fn()};
jest.mock('expo-sqlite',()=>({openDatabaseSync:jest.fn()}));
jest.mock('drizzle-orm/expo-sqlite',()=>({drizzle:()=>({})}));
jest.mock('drizzle-orm/expo-sqlite/migrator',()=>({migrate:jest.fn()}));
jest.mock('expo-file-system',()=>({Paths:{cache:{uri:'file:///fixture/Library/Caches/'}}}));
jest.mock('../src/data/health-store',()=>({HEALTH_DB:'insight-health.db',HEALTH_SCHEMA:'CREATE TABLE fixture (x)',moveHealthRows:jest.fn()}));
jest.mock('../src/data/repository',()=>({deviceId:()=> 'fixture-device',Repository:class {},wipeAllOwners:jest.fn()}));
test('open, locked connection and migration failures release the cached boot promise and close failed connections',async()=>{
 jest.mocked(openDatabaseSync).mockImplementationOnce(()=>{throw new Error('synthetic open failure');}).mockReturnValue(mockSQLite as never);
 await expect(openLocalDatabase()).rejects.toMatchObject({name:'DatabaseOpenError'});
 mockSQLite.execSync.mockImplementationOnce(()=>{throw new Error('synthetic database locked');});
 await expect(openLocalDatabase()).rejects.toMatchObject({name:'DatabaseOpenError'});
 expect(mockSQLite.closeSync).toHaveBeenCalledTimes(1);
 jest.mocked(migrate).mockRejectedValueOnce(new Error('synthetic failed migration'));
 await expect(openLocalDatabase()).rejects.toMatchObject({name:'DatabaseMigrationError'});
 expect(mockSQLite.closeSync).toHaveBeenCalledTimes(2);
 jest.mocked(migrate).mockResolvedValue();
 await expect(openLocalDatabase()).resolves.toHaveProperty('forOwner');
 // Four for the main database, one more for the Health store once it opened.
 expect(openDatabaseSync).toHaveBeenCalledTimes(5);
 // The Health store opened on disk, so earlier Health weigh-ins move into it.
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 expect((require('../src/data/health-store') as typeof import('../src/data/health-store')).moveHealthRows).toHaveBeenCalledTimes(1);
});

test('the Health store opens in the Caches folder, never the backed-up default, and falls back to memory without moving anything into it', async () => {
 jest.resetModules();
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const sqlite = require('expo-sqlite') as typeof import('expo-sqlite');
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const { moveHealthRows } = require('../src/data/health-store') as typeof import('../src/data/health-store');
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const { openLocalDatabase: open } = require('../src/data/database') as typeof import('../src/data/database');
 const handle = { execSync: jest.fn(), closeSync: jest.fn() };
 jest.mocked(sqlite.openDatabaseSync).mockReset().mockReturnValueOnce(handle as never).mockImplementationOnce(() => { throw new Error('synthetic cache failure'); }).mockReturnValue(handle as never);
 await expect(open()).resolves.toHaveProperty('forOwner');
 expect(sqlite.openDatabaseSync).toHaveBeenNthCalledWith(1, 'insight.db');
 expect(sqlite.openDatabaseSync).toHaveBeenNthCalledWith(2, 'insight-health.db', undefined, 'file:///fixture/Library/Caches/');
 expect(sqlite.openDatabaseSync).toHaveBeenNthCalledWith(3, ':memory:');
 // Rows moved into memory would be gone at the next launch, so they stay where they are.
 expect(moveHealthRows).not.toHaveBeenCalled();
});
