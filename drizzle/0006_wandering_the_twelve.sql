ALTER TABLE `bookings` ADD `pickup_time` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `return_time` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `pickup_address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `return_address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `trip_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `quote_details` text;