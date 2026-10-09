import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const cars=sqliteTable('cars',{id:text('id').primaryKey(),data:text('data').notNull(),version:integer('version').notNull().default(1),updatedAt:text('updated_at').notNull()});
export const locations=sqliteTable('locations',{id:text('id').primaryKey(),name:text('name').notNull(),enabled:integer('enabled').notNull().default(1),version:integer('version').notNull().default(1)},(table)=>[uniqueIndex('locations_name_unique').on(sql`lower(${table.name})`)]);
export const settings=sqliteTable('settings',{key:text('key').primaryKey(),value:text('value').notNull()});
